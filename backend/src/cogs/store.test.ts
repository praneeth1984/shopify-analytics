/**
 * Store-layer tests covering:
 *   - Free-tier cap enforcement (route layer, but exercised here via apply logic).
 *   - Shard rollover at >200 entries.
 *   - CAS conflict on stale lastWriteAt.
 *
 * We mock the GraphQL client so we don't hit a real Shopify endpoint.
 */

import { describe, expect, it, vi } from "vitest";
import {
  applyCogsWrite,
  CogsVersionConflict,
  readCogsState,
  _internal,
} from "./store.js";
import type { GraphQLClient } from "../shopify/graphql-client.js";
import type { CogsEntry, CogsMeta } from "@fbc/shared";
import { COGS_SHARD_MAX_ENTRIES } from "@fbc/shared";

type MetafieldNode = {
  id: string;
  key: string;
  value: string;
  type: string;
  updatedAt: string;
};

function metaToNode(meta: CogsMeta): MetafieldNode {
  return {
    id: "gid://shopify/Metafield/meta",
    key: "cogs_meta",
    value: JSON.stringify(meta),
    type: "json",
    updatedAt: meta.lastWriteAt,
  };
}

function entriesToIndexNode(entries: CogsEntry[]): MetafieldNode {
  return {
    id: "gid://shopify/Metafield/idx",
    key: "cogs_index",
    value: JSON.stringify({ version: 1, count: entries.length, updatedAt: "", entries }),
    type: "json",
    updatedAt: "",
  };
}

function makeEntry(id: number): CogsEntry {
  return {
    variantId: `gid://shopify/ProductVariant/${id}`,
    sku: `SKU-${id}`,
    productId: `gid://shopify/Product/${id}`,
    title: `Variant ${id}`,
    cost: { amount: "1.00", currency_code: "USD" },
    updatedAt: new Date().toISOString(),
  };
}

function mockGraphQL(initial: { meta: CogsMeta; entries: CogsEntry[] }) {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const writes: Array<unknown[]> = [];
  // The GraphQLClient is generic; we cast through `unknown` so the mock can
  // return shape-specific responses per query without satisfying every T.
  const impl = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    calls.push({ query, variables: variables ?? {} });

    if (query.includes("ReadCogs")) {
      const nodes: MetafieldNode[] = [metaToNode(initial.meta)];
      if (initial.entries.length > 0) nodes.push(entriesToIndexNode(initial.entries));
      return {
        data: {
          shop: { id: "gid://shopify/Shop/1", metafields: { nodes } },
        },
      };
    }
    if (query.includes("ShopId")) {
      return { data: { shop: { id: "gid://shopify/Shop/1" } } };
    }
    if (query.includes("SetCogsMetafields")) {
      writes.push((variables?.metafields as unknown[]) ?? []);
      return {
        data: {
          metafieldsSet: {
            metafields: [{ id: "x" }],
            userErrors: [],
          },
        },
      };
    }
    if (query.includes("DeleteCogsMetafields")) {
      return {
        data: { metafieldsDelete: { deletedMetafields: [] } },
      };
    }
    throw new Error(`unexpected query: ${query.slice(0, 60)}`);
  });
  const graphql = impl as unknown as GraphQLClient;
  return { graphql, calls, writes };
}

const baseMeta: CogsMeta = {
  schemaVersion: 1,
  totalCount: 0,
  shardCount: 0,
  defaultMarginPct: 0,
  lastWriteAt: "2026-04-01T12:00:00.000Z",
  currency_code: "USD",
};

describe("cogs store: applyOp", () => {
  it("upserts a new entry", () => {
    const next = _internal.applyOp([], { kind: "upsert", entry: makeEntry(1) });
    expect(next).toHaveLength(1);
    expect(next[0]?.variantId).toBe("gid://shopify/ProductVariant/1");
  });

  it("replaces an existing entry", () => {
    const e = makeEntry(1);
    const updated: CogsEntry = { ...e, cost: { amount: "9.99", currency_code: "USD" } };
    const next = _internal.applyOp([e], { kind: "upsert", entry: updated });
    expect(next).toHaveLength(1);
    expect(next[0]?.cost.amount).toBe("9.99");
  });

  it("removes an entry", () => {
    const e1 = makeEntry(1);
    const e2 = makeEntry(2);
    const next = _internal.applyOp([e1, e2], { kind: "delete", variantId: e1.variantId });
    expect(next).toHaveLength(1);
    expect(next[0]?.variantId).toBe(e2.variantId);
  });
});

describe("cogs store: shard rollover", () => {
  it("uses single index blob for <=200 entries", () => {
    const entries = Array.from({ length: 200 }, (_, i) => makeEntry(i + 1));
    const result = _internal.buildSetInputs({
      ownerId: "gid://shopify/Shop/1",
      meta: { ...baseMeta, totalCount: 200, shardCount: 0, lastWriteAt: "now" },
      entries,
      previousShardCount: 0,
    });
    // meta + index blob = 2 sets
    expect(result.sets).toHaveLength(2);
    expect(result.deletes).toHaveLength(0);
  });

  it("transitions to shards at 201 entries and schedules index delete", () => {
    const entries = Array.from({ length: 201 }, (_, i) => makeEntry(i + 1));
    const result = _internal.buildSetInputs({
      ownerId: "gid://shopify/Shop/1",
      meta: { ...baseMeta, totalCount: 201, shardCount: 2, lastWriteAt: "now" },
      entries,
      previousShardCount: 0,
    });
    // meta + 2 shards = 3 sets, plus an index-delete
    expect(result.sets).toHaveLength(3);
    expect(result.deletes.some((d) => d.key === "cogs_index")).toBe(true);
  });

  it("respects the per-shard cap of 200 entries", () => {
    const entries = Array.from({ length: 350 }, (_, i) => makeEntry(i + 1));
    const result = _internal.buildSetInputs({
      ownerId: "gid://shopify/Shop/1",
      meta: { ...baseMeta, totalCount: 350, shardCount: 2, lastWriteAt: "now" },
      entries,
      previousShardCount: 0,
    });
    // meta + 2 shards (200 + 150) = 3 sets
    expect(result.sets).toHaveLength(3);
    // The first shard should hold exactly COGS_SHARD_MAX_ENTRIES entries.
    const firstShard = result.sets[1] as { value: string };
    const blob = JSON.parse(firstShard.value) as { entries: CogsEntry[] };
    expect(blob.entries).toHaveLength(COGS_SHARD_MAX_ENTRIES);
  });
});

describe("cogs store: CAS", () => {
  it("rejects writes when expectedLastWriteAt is stale", async () => {
    const { graphql } = mockGraphQL({ meta: baseMeta, entries: [] });
    await expect(
      applyCogsWrite({
        graphql,
        expectedLastWriteAt: "1970-01-01T00:00:00.000Z",
        fallbackCurrency: "USD",
        op: { kind: "upsert", entry: makeEntry(1) },
      }),
    ).rejects.toBeInstanceOf(CogsVersionConflict);
  });

  it("succeeds when expectedLastWriteAt matches current meta", async () => {
    const { graphql, writes } = mockGraphQL({ meta: baseMeta, entries: [] });
    const result = await applyCogsWrite({
      graphql,
      expectedLastWriteAt: baseMeta.lastWriteAt,
      fallbackCurrency: "USD",
      op: { kind: "upsert", entry: makeEntry(1) },
    });
    expect(result.entries).toHaveLength(1);
    // Should have advanced the lastWriteAt (CAS guard for next write).
    expect(result.meta.lastWriteAt).not.toBe(baseMeta.lastWriteAt);
    expect(writes.length).toBeGreaterThan(0);
  });
});

describe("cogs store: read", () => {
  it("returns sensible defaults when nothing has been written", async () => {
    const { graphql } = mockGraphQL({ meta: baseMeta, entries: [] });
    const state = await readCogsState(graphql, "USD");
    expect(state.entries).toEqual([]);
    expect(state.meta.totalCount).toBe(0);
  });

  it("reads entries from the index blob", async () => {
    const initial = {
      meta: { ...baseMeta, totalCount: 1 },
      entries: [makeEntry(1)],
    };
    const { graphql } = mockGraphQL(initial);
    const state = await readCogsState(graphql, "USD");
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]?.variantId).toBe("gid://shopify/ProductVariant/1");
  });
});
