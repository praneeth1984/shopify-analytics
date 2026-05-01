/**
 * COGS storage layer over shop metafields.
 *
 * Layout (namespace: firstbridge_analytics):
 *   - cogs_meta              : { schemaVersion, totalCount, shardCount, defaultMarginPct, lastWriteAt, currency_code }
 *   - cogs_index             : full entries blob (Free / small Pro stores, single ~5KB metafield)
 *   - cogs_shard_{0..49}     : Pro overflow, <=200 entries per shard
 *
 * Conventions:
 *   - All writes are read-modify-write the whole blob via metafieldsSet (idempotent).
 *   - Compare-and-swap on `cogs_meta.lastWriteAt`: writers pass the value they
 *     read; if storage has advanced, the write is rejected with a
 *     COGS_VERSION_CONFLICT and the caller retries.
 *   - When totalCount > 200 we transition from a single index blob to sharded
 *     storage. The index blob is removed (set to empty) and shards are written.
 *   - All entries share the shop's currency_code; multi-currency is rejected
 *     at the route layer.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import { getShopGid } from "../metafields/client.js";
import {
  COGS_MAX_SHARDS,
  COGS_SHARD_MAX_ENTRIES,
  METAFIELD_KEYS,
  METAFIELD_NAMESPACE,
} from "@fbc/shared";
import type { CogsEntry, CogsIndex, CogsMeta } from "@fbc/shared";
import { HttpError } from "../lib/errors.js";

// ---- GraphQL ----

const READ_COGS_QUERY = /* GraphQL */ `
  query ReadCogs($namespace: String!) {
    shop {
      id
      metafields(namespace: $namespace, first: 100) {
        nodes {
          id
          key
          value
          type
          updatedAt
        }
      }
    }
  }
`;

const SET_METAFIELDS = /* GraphQL */ `
  mutation SetCogsMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        key
        namespace
        updatedAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const DELETE_METAFIELDS = /* GraphQL */ `
  mutation DeleteCogsMetafields($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields {
        key
        namespace
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ---- Errors ----

export class CogsVersionConflict extends HttpError {
  constructor() {
    super(409, "COGS_VERSION_CONFLICT", "COGS data was updated elsewhere. Please retry.");
  }
}

// ---- Types ----

export type CogsState = {
  meta: CogsMeta;
  entries: CogsEntry[];
};

type RawMetafield = {
  id: string;
  key: string;
  value: string;
  type: string;
  updatedAt: string;
};

// ---- Helpers ----

function safeParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function emptyMeta(currencyCode: string, defaultMarginPct = 0): CogsMeta {
  return {
    schemaVersion: 1,
    totalCount: 0,
    shardCount: 0,
    defaultMarginPct,
    lastWriteAt: new Date(0).toISOString(),
    currency_code: currencyCode,
  };
}

function shardKey(n: number): string {
  return `${METAFIELD_KEYS.cogsShardPrefix}${n}`;
}

function isShardKey(key: string): boolean {
  return key.startsWith(METAFIELD_KEYS.cogsShardPrefix);
}

function shardIndex(key: string): number | null {
  if (!isShardKey(key)) return null;
  const n = Number(key.slice(METAFIELD_KEYS.cogsShardPrefix.length));
  return Number.isInteger(n) && n >= 0 && n < COGS_MAX_SHARDS ? n : null;
}

// ---- Reads ----

/**
 * Reads meta + all entries (from index or shards) in a single GraphQL round trip.
 * Returns sensible defaults when nothing has been written yet.
 */
export async function readCogsState(
  graphql: GraphQLClient,
  fallbackCurrency: string,
): Promise<CogsState> {
  const { data } = await graphql<{
    shop: { id: string; metafields: { nodes: RawMetafield[] } };
  }>(READ_COGS_QUERY, { namespace: METAFIELD_NAMESPACE });

  const nodes = data.shop.metafields.nodes;
  const metaNode = nodes.find((n) => n.key === METAFIELD_KEYS.cogsMeta);
  const indexNode = nodes.find((n) => n.key === METAFIELD_KEYS.cogsIndex);
  const shardNodes = nodes
    .filter((n) => isShardKey(n.key))
    .map((n) => ({ idx: shardIndex(n.key), node: n }))
    .filter((s): s is { idx: number; node: RawMetafield } => s.idx !== null)
    .sort((a, b) => a.idx - b.idx);

  const meta = metaNode
    ? safeParse<CogsMeta>(metaNode.value) ?? emptyMeta(fallbackCurrency)
    : emptyMeta(fallbackCurrency);

  let entries: CogsEntry[] = [];
  if (meta.shardCount > 0 && shardNodes.length > 0) {
    for (const s of shardNodes) {
      const blob = safeParse<{ entries: CogsEntry[] }>(s.node.value);
      if (blob?.entries) entries.push(...blob.entries);
    }
  } else if (indexNode) {
    const blob = safeParse<CogsIndex>(indexNode.value);
    if (blob?.entries) entries = blob.entries;
  }

  return { meta, entries };
}

// ---- Writes ----

type WriteOp =
  | { kind: "upsert"; entry: CogsEntry }
  | { kind: "bulk-upsert"; entries: CogsEntry[] }
  | { kind: "delete"; variantId: string }
  | { kind: "default-margin"; defaultMarginPct: number };

export type WriteResult = {
  meta: CogsMeta;
  entries: CogsEntry[];
};

function applyOp(entries: CogsEntry[], op: WriteOp): CogsEntry[] {
  if (op.kind === "default-margin") return entries;
  if (op.kind === "delete") return entries.filter((e) => e.variantId !== op.variantId);
  if (op.kind === "bulk-upsert") {
    // Merge semantics: each incoming entry replaces by variantId; previously
    // saved variants not present in the input are preserved.
    const byId = new Map(entries.map((e) => [e.variantId, e]));
    for (const incoming of op.entries) {
      byId.set(incoming.variantId, incoming);
    }
    return Array.from(byId.values());
  }
  // upsert
  const idx = entries.findIndex((e) => e.variantId === op.entry.variantId);
  if (idx >= 0) {
    const next = entries.slice();
    next[idx] = op.entry;
    return next;
  }
  return [...entries, op.entry];
}

function buildSetInputs(args: {
  ownerId: string;
  meta: CogsMeta;
  entries: CogsEntry[];
  previousShardCount: number;
}): { sets: unknown[]; deletes: { ownerId: string; namespace: string; key: string }[] } {
  const { ownerId, meta, entries, previousShardCount } = args;

  const metaInput = {
    ownerId,
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEYS.cogsMeta,
    type: "json",
    value: JSON.stringify(meta),
  };

  const sets: unknown[] = [metaInput];
  const deletes: { ownerId: string; namespace: string; key: string }[] = [];

  if (entries.length <= COGS_SHARD_MAX_ENTRIES) {
    // Single-blob mode.
    const indexBlob: CogsIndex = {
      version: 1,
      count: entries.length,
      updatedAt: meta.lastWriteAt,
      entries,
    };
    sets.push({
      ownerId,
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEYS.cogsIndex,
      type: "json",
      value: JSON.stringify(indexBlob),
    });
    // If previously sharded, schedule deletes for old shards.
    for (let i = 0; i < previousShardCount; i++) {
      deletes.push({ ownerId, namespace: METAFIELD_NAMESPACE, key: shardKey(i) });
    }
    return { sets, deletes };
  }

  // Sharded mode.
  const shards: CogsEntry[][] = [];
  for (let i = 0; i < entries.length; i += COGS_SHARD_MAX_ENTRIES) {
    shards.push(entries.slice(i, i + COGS_SHARD_MAX_ENTRIES));
  }
  if (shards.length > COGS_MAX_SHARDS) {
    throw new HttpError(
      400,
      "COGS_TOO_LARGE",
      `COGS exceeds maximum of ${COGS_MAX_SHARDS * COGS_SHARD_MAX_ENTRIES} entries`,
    );
  }
  for (let i = 0; i < shards.length; i++) {
    sets.push({
      ownerId,
      namespace: METAFIELD_NAMESPACE,
      key: shardKey(i),
      type: "json",
      value: JSON.stringify({ version: 1, entries: shards[i] }),
    });
  }
  // Delete the index blob if we just transitioned, plus any tail shards.
  deletes.push({ ownerId, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.cogsIndex });
  for (let i = shards.length; i < previousShardCount; i++) {
    deletes.push({ ownerId, namespace: METAFIELD_NAMESPACE, key: shardKey(i) });
  }
  return { sets, deletes };
}

async function metafieldsSet(graphql: GraphQLClient, metafields: unknown[]): Promise<void> {
  const { data } = await graphql<{
    metafieldsSet: {
      metafields: { id: string }[] | null;
      userErrors: { field: string[]; message: string; code: string }[];
    };
  }>(SET_METAFIELDS, { metafields });
  if (data.metafieldsSet.userErrors.length > 0) {
    const msg = data.metafieldsSet.userErrors.map((e) => e.message).join("; ");
    throw new HttpError(500, "metafields_set_failed", "Failed to write COGS data", msg);
  }
}

async function metafieldsDelete(
  graphql: GraphQLClient,
  metafields: { ownerId: string; namespace: string; key: string }[],
): Promise<void> {
  if (metafields.length === 0) return;
  await graphql<{
    metafieldsDelete: { deletedMetafields: { key: string }[] | null };
  }>(DELETE_METAFIELDS, { metafields });
  // Best-effort delete: ignore userErrors (often "not found"), they're benign.
}

/**
 * Apply one logical operation to the COGS state, with compare-and-swap on
 * `meta.lastWriteAt`. Caller passes the meta they previously read; if it has
 * since advanced, we throw `CogsVersionConflict` (HTTP 409).
 *
 * On success, returns the new meta + entries.
 */
export async function applyCogsWrite(args: {
  graphql: GraphQLClient;
  expectedLastWriteAt: string;
  fallbackCurrency: string;
  op: WriteOp;
}): Promise<WriteResult> {
  const { graphql, expectedLastWriteAt, fallbackCurrency, op } = args;

  // Re-read inside the operation so we always work against fresh state.
  const ownerId = await getShopGid(graphql);
  const current = await readCogsState(graphql, fallbackCurrency);

  if (current.meta.lastWriteAt !== expectedLastWriteAt) {
    throw new CogsVersionConflict();
  }

  const nextEntries = applyOp(current.entries, op);
  const now = new Date().toISOString();
  const nextMeta: CogsMeta = {
    ...current.meta,
    totalCount: nextEntries.length,
    shardCount:
      nextEntries.length > COGS_SHARD_MAX_ENTRIES
        ? Math.ceil(nextEntries.length / COGS_SHARD_MAX_ENTRIES)
        : 0,
    defaultMarginPct:
      op.kind === "default-margin" ? op.defaultMarginPct : current.meta.defaultMarginPct,
    lastWriteAt: now,
  };

  const { sets, deletes } = buildSetInputs({
    ownerId,
    meta: nextMeta,
    entries: nextEntries,
    previousShardCount: current.meta.shardCount,
  });

  await metafieldsSet(graphql, sets);
  await metafieldsDelete(graphql, deletes);

  return { meta: nextMeta, entries: nextEntries };
}

/**
 * Initialise the meta record on first read so subsequent writes have a
 * non-epoch lastWriteAt to compare against. Idempotent.
 */
export async function ensureMetaInitialised(
  graphql: GraphQLClient,
  fallbackCurrency: string,
): Promise<CogsMeta> {
  const state = await readCogsState(graphql, fallbackCurrency);
  if (state.meta.lastWriteAt !== new Date(0).toISOString()) return state.meta;

  const ownerId = await getShopGid(graphql);
  const now = new Date().toISOString();
  const initial: CogsMeta = { ...state.meta, lastWriteAt: now };
  await metafieldsSet(graphql, [
    {
      ownerId,
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEYS.cogsMeta,
      type: "json",
      value: JSON.stringify(initial),
    },
  ]);
  return initial;
}

// Exported for tests.
export const _internal = { applyOp, buildSetInputs };
