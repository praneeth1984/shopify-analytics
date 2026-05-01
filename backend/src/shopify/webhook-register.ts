/**
 * Post-OAuth webhook registration for the legacy / direct-link install path.
 *
 * For managed installs the webhook subscriptions declared in `shopify.app.toml`
 * are registered automatically by Shopify, so this code path is only exercised
 * by direct-link installs that hit `/auth/callback`.
 *
 * The mutation is idempotent on Shopify's side — registering the same topic +
 * URL twice returns a benign `userErrors` entry that we treat as success.
 */

import type { Env } from "../env.js";
import { log } from "../lib/logger.js";

const REGISTER_WEBHOOK = /* GraphQL */ `
  mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription {
        id
        topic
        callbackUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type Subscription = {
  /** GraphQL enum value, e.g. APP_UNINSTALLED, APP_SUBSCRIPTIONS_UPDATE. */
  topic: string;
  /** Path under SHOPIFY_APP_URL the webhook should POST to. */
  path: string;
};

const REQUIRED_SUBSCRIPTIONS: Subscription[] = [
  { topic: "APP_UNINSTALLED", path: "/webhooks/app/uninstalled" },
  { topic: "APP_SUBSCRIPTIONS_UPDATE", path: "/webhooks/app_subscriptions/update" },
];

/**
 * Register the runtime-required webhooks for a freshly-installed shop.
 * Each call is best-effort: failures are logged but never throw out of the
 * OAuth callback (which would leave the merchant on an error page).
 */
export async function registerRuntimeWebhooks(args: {
  env: Env;
  shopDomain: string;
  accessToken: string;
}): Promise<void> {
  const endpoint = `https://${args.shopDomain}/admin/api/${args.env.SHOPIFY_API_VERSION}/graphql.json`;
  const baseUrl = args.env.SHOPIFY_APP_URL.replace(/\/+$/, "");

  for (const sub of REQUIRED_SUBSCRIPTIONS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-access-token": args.accessToken,
        },
        body: JSON.stringify({
          query: REGISTER_WEBHOOK,
          variables: {
            topic: sub.topic,
            sub: {
              callbackUrl: `${baseUrl}${sub.path}`,
              format: "JSON",
            },
          },
        }),
      });
      if (!res.ok) {
        log.warn("webhook.register_http_error", {
          topic: sub.topic,
          status: res.status,
        });
        continue;
      }
      const body = (await res.json()) as {
        data?: {
          webhookSubscriptionCreate: {
            webhookSubscription: { id: string } | null;
            userErrors: { field: string[]; message: string }[];
          };
        };
        errors?: { message: string }[];
      };
      const errors = body.data?.webhookSubscriptionCreate?.userErrors ?? [];
      if (errors.length > 0) {
        // Common case: "for this topic and address already exists" — benign.
        log.info("webhook.register_userErrors", {
          topic: sub.topic,
          messages: errors.map((e) => e.message),
        });
      } else {
        log.info("webhook.registered", { topic: sub.topic });
      }
    } catch (err) {
      log.warn("webhook.register_failed", {
        topic: sub.topic,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }
}
