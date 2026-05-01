/**
 * Shop domain validation. Always reject anything that doesn't match the
 * canonical *.myshopify.com pattern before using the value in URL construction.
 */

const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]\.myshopify\.com$/;

export function isValidShopDomain(shop: unknown): shop is string {
  return typeof shop === "string" && SHOP_DOMAIN_REGEX.test(shop);
}

export function assertShopDomain(shop: unknown): asserts shop is string {
  if (!isValidShopDomain(shop)) {
    throw new Error("Invalid shop domain");
  }
}
