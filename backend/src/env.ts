/**
 * Worker environment bindings. Mirrors wrangler.toml + secrets.
 * Secrets are injected at runtime via `wrangler secret put`:
 *   SHOPIFY_API_KEY        — public client_id from Shopify Partners
 *   SHOPIFY_API_SECRET     — server-only signing secret
 *   SHOPIFY_APP_URL        — public URL of the deployed Worker
 *   ANTHROPIC_API_KEY      — Phase 3 only
 */
export type Env = {
  // Public config from wrangler.toml [vars]
  SHOPIFY_API_VERSION: string;

  // Secrets
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  ANTHROPIC_API_KEY?: string;

  // Bindings — see wrangler.toml. Used for ephemeral cross-request state only:
  //   - plan:{shop_domain}        30s Billing-API plan cache
  //   - bulk:{shop_domain}:{...}  bulk-operation polling cursors (Phase 1.5)
  BULK_OPS_KV: KVNamespace;
};
