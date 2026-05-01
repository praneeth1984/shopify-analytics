/**
 * Shop metafield read/write helpers — our "database" for per-shop config and
 * cached snapshots. Namespace + key conventions live in @fbc/shared.
 *
 * All values are JSON. Always upsert (idempotent set), never insert-then-update.
 */

import type { GraphQLClient } from "../shopify/graphql-client.js";
import { METAFIELD_NAMESPACE } from "@fbc/shared";

const GET_SHOP_ID = /* GraphQL */ `
  query ShopId {
    shop {
      id
    }
  }
`;

const GET_METAFIELD = /* GraphQL */ `
  query GetMetafield($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) {
        id
        value
        type
        updatedAt
      }
    }
  }
`;

const SET_METAFIELD = /* GraphQL */ `
  mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
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

const DELETE_METAFIELD = /* GraphQL */ `
  mutation DeleteMetafield($id: ID!) {
    metafieldDelete(input: { id: $id }) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

export async function getShopGid(graphql: GraphQLClient): Promise<string> {
  const { data } = await graphql<{ shop: { id: string } }>(GET_SHOP_ID);
  return data.shop.id;
}

export async function readMetafield<T>(graphql: GraphQLClient, key: string): Promise<T | null> {
  const { data } = await graphql<{
    shop: { metafield: { id: string; value: string; type: string } | null };
  }>(GET_METAFIELD, { namespace: METAFIELD_NAMESPACE, key });
  const m = data.shop.metafield;
  if (!m) return null;
  try {
    return JSON.parse(m.value) as T;
  } catch {
    return null;
  }
}

export async function writeMetafield<T>(
  graphql: GraphQLClient,
  ownerGid: string,
  key: string,
  value: T,
): Promise<void> {
  const { data } = await graphql<{
    metafieldsSet: {
      metafields: { id: string }[] | null;
      userErrors: { field: string[]; message: string; code: string }[];
    };
  }>(SET_METAFIELD, {
    metafields: [
      {
        ownerId: ownerGid,
        namespace: METAFIELD_NAMESPACE,
        key,
        type: "json",
        value: JSON.stringify(value),
      },
    ],
  });
  if (data.metafieldsSet.userErrors.length > 0) {
    const msg = data.metafieldsSet.userErrors.map((e) => e.message).join("; ");
    throw new Error(`metafieldsSet failed: ${msg}`);
  }
}

export async function deleteMetafield(graphql: GraphQLClient, metafieldId: string): Promise<void> {
  await graphql<{ metafieldDelete: { deletedId: string | null } }>(DELETE_METAFIELD, {
    id: metafieldId,
  });
}
