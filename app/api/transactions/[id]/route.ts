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
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("stockIn", "stockOut");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const exists = await getTransactionById(id);
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await deleteTransactionRow(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}