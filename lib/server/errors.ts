// lib/server/errors.ts
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