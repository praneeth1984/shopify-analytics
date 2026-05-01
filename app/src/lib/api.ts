/**
 * Authenticated fetch helper. Every backend call attaches a fresh App Bridge
 * session token so the backend can verify the merchant and token-exchange.
 */

import { getSessionToken } from "./app-bridge.js";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getSessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const url = BACKEND_URL ? `${BACKEND_URL}${path}` : path;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const errBody = body as { error?: string; message?: string } | null;
    throw new ApiError(
      res.status,
      errBody?.error ?? "request_failed",
      errBody?.message ?? `Request failed: ${res.status}`,
    );
  }
  return body as T;
}
