// app/api/transactions/[id]/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import { deleteTransactionRow, getTransactionById } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const tx = await getTransactionById(id);
    return tx
      ? NextResponse.json(tx)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Deleting a transaction reverses its stock. `deleteTransactionRow` calls
 * the atomic `delete_transaction(p_id)` RPC (stock reversal + delete in a
 * single PG transaction). Do NOT reverse stock here first — the RPC does
 * it, and reversing twice would corrupt inventory.
 *
 * Intentionally no PUT/PATCH: editing a transaction means reversing the
 * old stock impact and applying a new one, which is easy to get wrong.
 * Delete + recreate is the safe path.
 *
 * ── Auth-before-fetch order ──────────────────────────────────────────
 * The feature check (`stockIn` OR `stockOut`) runs **before**
 * `getTransactionById`. This returns 403 for unauthorized callers even
 * when the id doesn't exist — a trade-off deliberately chosen to prevent
 * id enumeration: an attacker cannot distinguish "transaction 42 exists
 * but you can't see it" (404) from "no such transaction" (404).
 *
 * Today this OR-check is safe: every role that has one of these features
 * has the other (Staff and Manager have both; Viewer has neither). If
 * you ever introduce a direction-specific role (e.g. "Receiver" with
 * only `stockIn`), fetch first and gate on `exists.type` instead — at
 * the cost of a 404-then-403 information leak.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("stockIn", "stockOut");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    // Existence check gives a clean 404 instead of a silent 204 on a
    // missing row. `deleteTransactionRow` is idempotent at the DB level
    // (DELETE with zero rows affected is a no-op), but returning 404
    // makes the client's state synchronisation unambiguous.
    const exists = await getTransactionById(id);
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await deleteTransactionRow(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}