/**
 * Tiny App Bridge toast helper. Falls back to no-op outside the embedded
 * runtime so unit/Playwright tests don't have to mock the global.
 *
 * The `Window.shopify` shape is augmented in `./app-bridge.ts`.
 */

export function showToast(message: string, opts: { isError?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.shopify?.toast?.show(message, opts);
  } catch {
    // App Bridge not initialised — surface in dev.
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.info("[toast]", message);
    }
  }
}
