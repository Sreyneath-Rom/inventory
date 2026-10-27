// lib/server/errors.ts
/**
 * Typed error for HTTP routes. `toErrorResponse` translates it (and anything
 * else) into a JSON `Response` with the right status code, so routes can
 * `try { … } catch (e) { return toErrorResponse(e); }` uniformly.
 *
 * Nothing here is schema-aware. The DB layer (`lib/server/db.ts`) is the
 * one place that converts Postgres/PostgREST failures into `HttpError`,
 * which keeps raw SQL messages (table names, column names, values) out of
 * the response body.
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const isHttpError = (e: unknown): e is HttpError => e instanceof HttpError;

/**
 * Last-resort translator for unexpected throws.
 *
 * ⚠ Any non-`HttpError` is serialised with its `.message` at status 500.
 * That's fine for local/dev, but in production you should ensure that
 * anything the DB layer can throw is wrapped as `HttpError` first — a
 * stray `PostgrestError` message would otherwise leak SQL details
 * (e.g. `duplicate key value violates unique constraint "categories_name_key"`).
 */
export function toErrorResponse(e: unknown): Response {
  if (isHttpError(e)) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  return Response.json(
    { error: e instanceof Error ? e.message : "Server error" },
    { status: 500 },
  );
}