/**
 * Typed errors for the backend. Hono error handler maps these to HTTP responses
 * without leaking internal detail to clients.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;
  constructor(status: number, code: string, publicMessage: string, internal?: string) {
    super(internal ?? publicMessage);
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export const Unauthorized = (msg = "Unauthorized") =>
  new HttpError(401, "unauthorized", msg);

export const Forbidden = (msg = "Forbidden") =>
  new HttpError(403, "forbidden", msg);

export const BadRequest = (msg = "Bad request", internal?: string) =>
  new HttpError(400, "bad_request", msg, internal);

export const Upstream = (msg = "Upstream error", internal?: string) =>
  new HttpError(502, "upstream_error", msg, internal);

export const Internal = (internal: string) =>
  new HttpError(500, "internal_error", "Internal server error", internal);
