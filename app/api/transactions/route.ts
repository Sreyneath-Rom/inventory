// app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import { listTransactions, moveStock } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import type { TxType } from "@/lib/types";

/** Transactions bodies are tiny (a handful of fields). */
const MAX_BODY_BYTES = 64_000;

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  const url = new URL(req.url);

  // Do NOT cast the query string. `?type=foo` should behave like "no type
  // filter", not like a corrupt TxType flowing through the rest of the app.
  const typeParam = url.searchParams.get("type");
  const type: TxType | undefined =
    typeParam === "IN" || typeParam === "OUT" ? typeParam : undefined;

  const productId = url.searchParams.get("productId") ?? undefined;

  const limitRaw = Number(url.searchParams.get("limit"));
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : undefined;

  try {
    // Server-side filtering — previously this ran `readDb()` and filtered
    // in JS, shipping the whole transactions table to the server process
    // just to slice 10 rows off it.
    return NextResponse.json(await listTransactions({ type, productId, limit }));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  // Auth **before** body parse. An unauthenticated POST would otherwise
  // parse an arbitrarily large JSON body just to hit a 401 afterwards.
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const type = body.type;
  if (type !== "IN" && type !== "OUT") {
    return NextResponse.json({ error: "type must be 'IN' or 'OUT'." }, { status: 422 });
  }

  // Direction-specific feature check. Re-checks the auth user internally,
  // but the cookie read is free (no DB query), so the only extra cost is
  // the second `getAppRole` lookup — one extra indexed SELECT.
  const feat = await requireFeature(type === "IN" ? "stockIn" : "stockOut");
  if (!feat.user) return feat.response;

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 422 });
  }

  const qty =
    typeof body.qty === "number" ? body.qty :
    typeof body.qty === "string" && body.qty.trim() ? Number(body.qty) :
    Number.NaN;
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json(
      { error: "Quantity must be a whole number greater than 0." },
      { status: 422 },
    );
  }

  // Reject `"abc"`, `-1`, and `NaN` for unitPrice — previously these all
  // silently stored 0, making pricing typos unrecoverable from the UI.
  let unitPrice = 0;
  if (body.unitPrice !== undefined && body.unitPrice !== null && body.unitPrice !== "") {
    const n = typeof body.unitPrice === "number" ? body.unitPrice : Number(body.unitPrice);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "unitPrice must be a non-negative number." },
        { status: 422 },
      );
    }
    unitPrice = n;
  }

  // ── Date: require `YYYY-MM-DD` ───────────────────────────────────────
  // `transactions.date` is a `date` column. The previous code converted
  // `"2024-01-15"` to `"2024-01-15T00:00:00Z"` and let the RPC cast it —
  // on any non-UTC DB session, that lands on `2024-01-14`. Requiring a
  // date-only string eliminates the timezone round-trip entirely. The
  // client (`store.tsx → move`) already sends `dayKey(new Date())`.
  const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD." },
      { status: 422 },
    );
  }
  // Reject real-world impossible dates (`"2024-02-30"`) before the DB does
  // so with a generic CHECK failure.
  const probe = new Date(`${dateRaw}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== dateRaw) {
    return NextResponse.json({ error: "Invalid date." }, { status: 422 });
  }

  const party = typeof body.party === "string" && body.party.trim()
    ? body.party.trim()
    : undefined;
  const note = typeof body.note === "string" && body.note.trim()
    ? body.note.trim()
    : undefined;

  try {
    // Atomic: insert + stock update in one PG transaction via move_stock RPC.
    //
    // ⚠ No idempotency yet. `transactions.idempotency_key` exists in the
    // schema but is never populated — a retried POST creates a duplicate
    // movement. Fixing this needs the RPC to accept `p_idempotency_key`
    // and short-circuit on conflict; until then, the client should not
    // auto-retry POSTs.
    const tx = await moveStock({
      type, productId, qty, unitPrice, party, note,
      date: dateRaw,
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}