/**
 * Seed test orders into a Shopify dev store.
 *
 * Usage:
 *   SHOPIFY_STORE=fbc-dev-ft0sobbo.myshopify.com \
 *   SHOPIFY_TOKEN=shpat_xxxx \
 *   node scripts/seed-orders.mjs
 *
 * How to get a token (one-time):
 *   1. Go to your dev store admin → Settings → Apps and sales channels
 *   2. Click "Develop apps" → "Create an app"
 *   3. Name it "Seed Script", click Configure Admin API scopes
 *   4. Enable: write_orders, read_orders, read_products, write_draft_orders, read_draft_orders
 *   5. Click "Install app" → copy the Admin API access token (starts with shpat_)
 */

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_TOKEN;
const API_VERSION = "2026-04";

if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_STORE or SHOPIFY_TOKEN env vars.");
  console.error("See usage at the top of this file.");
  process.exit(1);
}

const endpoint = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// Fetch first available product variants to use in orders
async function getVariants() {
  const data = await gql(`{
    products(first: 5) {
      nodes {
        id
        title
        variants(first: 3) {
          nodes { id price sku }
        }
      }
    }
  }`);
  const variants = [];
  for (const p of data.products.nodes) {
    for (const v of p.variants.nodes) {
      variants.push({ id: v.id, price: v.price, title: p.title, sku: v.sku });
    }
  }
  return variants;
}

const CUSTOMERS = [
  { firstName: "Alice", lastName: "Smith", email: "alice.smith@example.com", city: "New York", province: "New York", country: "US", zip: "10001" },
  { firstName: "Bob", lastName: "Jones", email: "bob.jones@example.com", city: "Los Angeles", province: "California", country: "US", zip: "90001" },
  { firstName: "Carol", lastName: "White", email: "carol.white@example.com", city: "Toronto", province: "Ontario", country: "CA", zip: "M5V2T6" },
  { firstName: "David", lastName: "Brown", email: "david.brown@example.com", city: "Chicago", province: "Illinois", country: "US", zip: "60601" },
  { firstName: "Emma", lastName: "Davis", email: "emma.davis@example.com", city: "London", province: "", country: "GB", zip: "EC1A1BB" },
  { firstName: "Frank", lastName: "Wilson", email: "frank.wilson@example.com", city: "Sydney", province: "New South Wales", country: "AU", zip: "2000" },
  { firstName: "Grace", lastName: "Moore", email: "grace.moore@example.com", city: "Houston", province: "Texas", country: "US", zip: "77001" },
  { firstName: "Henry", lastName: "Taylor", email: "henry.taylor@example.com", city: "Phoenix", province: "Arizona", country: "US", zip: "85001" },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function createDraftOrder(customer, lineItems, discountCode, processedAt) {
  const input = {
    email: customer.email,
    lineItems,
    shippingAddress: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      address1: "123 Test Street",
      city: customer.city,
      province: customer.province || undefined,
      country: customer.country,
      zip: customer.zip,
    },
    ...(discountCode ? { appliedDiscount: { value: 10, valueType: "PERCENTAGE", title: discountCode } } : {}),
  };

  const create = await gql(`
    mutation CreateDraft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }
  `, { input });

  const errs = create.draftOrderCreate.userErrors;
  if (errs.length > 0) throw new Error(`draftOrderCreate: ${JSON.stringify(errs)}`);

  const draftId = create.draftOrderCreate.draftOrder.id;

  const complete = await gql(`
    mutation CompleteDraft($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { order { id name } }
        userErrors { field message }
      }
    }
  `, { id: draftId });

  const completeErrs = complete.draftOrderComplete.userErrors;
  if (completeErrs.length > 0) throw new Error(`draftOrderComplete: ${JSON.stringify(completeErrs)}`);

  const orderId = complete.draftOrderComplete.draftOrder?.order?.id;
  const orderName = complete.draftOrderComplete.draftOrder?.order?.name;
  return { orderId, orderName };
}

async function main() {
  console.log(`Connecting to ${STORE}...`);

  const variants = await getVariants();
  if (variants.length === 0) {
    console.error("No products found in this store. Create at least one product first.");
    process.exit(1);
  }
  console.log(`Found ${variants.length} variant(s): ${variants.map(v => v.title).join(", ")}`);

  const ORDERS = [
    // Recent orders (last 7 days)
    { daysAgo: 1, qty: 2, customer: 0, discount: null },
    { daysAgo: 2, qty: 1, customer: 1, discount: "SAVE10" },
    { daysAgo: 3, qty: 3, customer: 2, discount: null },
    { daysAgo: 5, qty: 1, customer: 3, discount: "SUMMER20" },
    { daysAgo: 6, qty: 2, customer: 4, discount: null },
    // Older orders (last 30 days)
    { daysAgo: 10, qty: 1, customer: 5, discount: null },
    { daysAgo: 15, qty: 4, customer: 6, discount: "SAVE10" },
    { daysAgo: 20, qty: 2, customer: 0, discount: null },
    { daysAgo: 25, qty: 1, customer: 7, discount: null },
    { daysAgo: 28, qty: 3, customer: 1, discount: "SUMMER20" },
    // Older (60+ days)
    { daysAgo: 45, qty: 2, customer: 2, discount: null },
    { daysAgo: 60, qty: 1, customer: 3, discount: null },
    { daysAgo: 75, qty: 5, customer: 4, discount: "SAVE10" },
    { daysAgo: 80, qty: 1, customer: 5, discount: null },
    { daysAgo: 85, qty: 2, customer: 6, discount: null },
  ];

  let created = 0;
  for (const o of ORDERS) {
    const customer = CUSTOMERS[o.customer % CUSTOMERS.length];
    const variant = pickRandom(variants);
    const lineItems = [{ variantId: variant.id, quantity: o.qty }];

    try {
      const { orderName } = await createDraftOrder(
        customer, lineItems, o.discount, daysAgo(o.daysAgo)
      );
      console.log(`  ✓ ${orderName} — ${customer.firstName} ${customer.lastName}, qty ${o.qty}, ${o.daysAgo}d ago${o.discount ? ` (${o.discount})` : ""}`);
      created++;
    } catch (err) {
      console.warn(`  ✗ Failed: ${err.message}`);
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone — created ${created}/${ORDERS.length} orders.`);
  console.log("Reload the FirstBridge Analytics app to see the data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
