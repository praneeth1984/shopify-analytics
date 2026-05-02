/**
 * DEV ONLY — POST /api/dev/seed-orders
 * Creates realistic test orders via the authenticated Admin GraphQL client.
 * Only mounted when ENVIRONMENT !== "production".
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { requireSessionToken } from "../middleware/auth.js";

const CUSTOMERS = [
  { firstName: "Alice", lastName: "Smith", email: "alice@example.com", city: "New York", province: "New York", country: "US", zip: "10001" },
  { firstName: "Bob", lastName: "Jones", email: "bob@example.com", city: "Los Angeles", province: "California", country: "US", zip: "90001" },
  { firstName: "Carol", lastName: "White", email: "carol@example.com", city: "Toronto", province: "Ontario", country: "CA", zip: "M5V2T6" },
  { firstName: "David", lastName: "Brown", email: "david@example.com", city: "Chicago", province: "Illinois", country: "US", zip: "60601" },
  { firstName: "Emma", lastName: "Davis", email: "emma@example.com", city: "Austin", province: "Texas", country: "US", zip: "78701" },
  { firstName: "Frank", lastName: "Wilson", email: "frank@example.com", city: "Seattle", province: "Washington", country: "US", zip: "98101" },
];

const DISCOUNTS = [null, null, null, "SAVE10", "SUMMER20", null, null, "SAVE10"];

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function devSeedRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", requireSessionToken());

  app.post("/seed-orders", async (c) => {
    if (c.env.ENVIRONMENT === "production") {
      return c.json({ error: "not_found" }, 404);
    }
    const graphql = c.get("graphql");

    // 1. Fetch available variants
    const { data: productsData } = await graphql<{
      products: { nodes: Array<{ id: string; title: string; variants: { nodes: Array<{ id: string }> } }> };
    }>(`{
      products(first: 10) {
        nodes {
          id title
          variants(first: 1) { nodes { id } }
        }
      }
    }`);

    const variants = productsData.products.nodes
      .flatMap((p) => p.variants.nodes.map((v) => ({ variantId: v.id, title: p.title })))
      .filter((v) => v.variantId);

    if (variants.length === 0) {
      return c.json({ ok: false, error: "No products found. Create at least one product in your dev store first." }, 400);
    }

    const PLAN = [
      { daysAgo: 1, qty: 2, customer: 0, discount: 3 },
      { daysAgo: 2, qty: 1, customer: 1, discount: 4 },
      { daysAgo: 4, qty: 3, customer: 2, discount: 0 },
      { daysAgo: 6, qty: 1, customer: 3, discount: 0 },
      { daysAgo: 9, qty: 2, customer: 4, discount: 0 },
      { daysAgo: 14, qty: 1, customer: 5, discount: 3 },
      { daysAgo: 18, qty: 4, customer: 0, discount: 4 },
      { daysAgo: 22, qty: 2, customer: 1, discount: 0 },
      { daysAgo: 27, qty: 1, customer: 2, discount: 0 },
      { daysAgo: 31, qty: 3, customer: 3, discount: 3 },
      { daysAgo: 45, qty: 2, customer: 4, discount: 0 },
      { daysAgo: 60, qty: 1, customer: 5, discount: 4 },
      { daysAgo: 72, qty: 2, customer: 0, discount: 0 },
      { daysAgo: 80, qty: 1, customer: 1, discount: 0 },
      { daysAgo: 85, qty: 3, customer: 2, discount: 3 },
    ];

    const results: Array<{ name: string; ok: boolean; error?: string }> = [];

    for (const order of PLAN) {
      const customer = CUSTOMERS[order.customer % CUSTOMERS.length]!;
      const variant = variants[Math.floor(Math.random() * variants.length)]!;
      const discount = DISCOUNTS[order.discount % DISCOUNTS.length] ?? null;

      try {
        // Create draft order
        const { data: createData } = await graphql<{
          draftOrderCreate: {
            draftOrder: { id: string } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(`
          mutation CreateDraft($input: DraftOrderInput!) {
            draftOrderCreate(input: $input) {
              draftOrder { id }
              userErrors { field message }
            }
          }
        `, {
          input: {
            email: customer.email,
            lineItems: [{ variantId: variant.variantId, quantity: order.qty }],
            shippingAddress: {
              firstName: customer.firstName,
              lastName: customer.lastName,
              address1: "123 Test Street",
              city: customer.city,
              province: customer.province,
              country: customer.country,
              zip: customer.zip,
            },
            ...(discount ? { appliedDiscount: { value: 10, valueType: "PERCENTAGE", title: discount } } : {}),
          },
        });

        const createErrs = createData.draftOrderCreate.userErrors;
        if (createErrs.length > 0) {
          results.push({ name: "?", ok: false, error: createErrs.map((e) => e.message).join("; ") });
          continue;
        }

        const draftId = createData.draftOrderCreate.draftOrder!.id;

        // Complete the draft (marks as paid)
        const { data: completeData } = await graphql<{
          draftOrderComplete: {
            draftOrder: { order: { id: string; name: string } | null } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(`
          mutation CompleteDraft($id: ID!) {
            draftOrderComplete(id: $id) {
              draftOrder { order { id name } }
              userErrors { field message }
            }
          }
        `, { id: draftId });

        const completeErrs = completeData.draftOrderComplete?.userErrors ?? [];
        if (completeErrs.length > 0) {
          results.push({ name: draftId, ok: false, error: completeErrs.map((e) => e.message).join("; ") });
          continue;
        }

        const orderName = completeData.draftOrderComplete?.draftOrder?.order?.name ?? "?";
        results.push({ name: orderName, ok: true });
      } catch (err) {
        results.push({ name: "?", ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const created = results.filter((r) => r.ok).length;
    return c.json({ ok: true, created, total: PLAN.length, results });
  });

  return app;
}
