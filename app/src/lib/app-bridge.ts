/**
 * App Bridge integration. The script loaded via index.html exposes a global
 * `shopify` object on embedded pages. We use it to mint session tokens and
 * read the host context.
 *
 * Reference: https://shopify.dev/docs/api/app-bridge-library
 */

declare global {
  interface Window {
    shopify?: {
      idToken: () => Promise<string>;
      config: { apiKey: string; host: string; shop?: string };
      toast?: {
        show: (
          message: string,
          opts?: { isError?: boolean; duration?: number },
        ) => void;
      };
    };
  }
}

export function isEmbedded(): boolean {
  return typeof window !== "undefined" && Boolean(window.shopify);
}

export async function getSessionToken(): Promise<string | null> {
  if (typeof window === "undefined" || !window.shopify) return null;
  return window.shopify.idToken();
}
