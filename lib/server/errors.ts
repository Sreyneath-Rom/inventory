// lib/server/errors.ts
/**
 * Typed error for HTTP routes. `toErrorResponse` translates it (and anything
 * else) into a JSON `Response` with the right status code, so routes can
 * `try { … } catch (e) { return toErrorResponse(e); }` uniformly.
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const isHttpError = (e: unknown): e is HttpError => e instanceof HttpError;

export function toErrorResponse(e: unknown): Response {
  if (isHttpError(e)) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  return Response.json(
    { error: e instanceof Error ? e.message : "Server error" },
    { status: 500 },
  );
}