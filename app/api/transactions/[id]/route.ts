import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readDb, deleteTransactionRow } from "@/lib/server/db";
import { createServerSupabase } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const tx = (await readDb()).transactions.find((t) => t.id === id);
  return tx
    ? NextResponse.json(tx)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Deleting a transaction reverses its stock impact. If the reversal would
 * push a product below zero, the request is rejected.
 *
 * Order of operations:
 *   1. Reverse stock (Supabase)   — saveable rollback target
 *   2. Delete the transaction     — if this fails, undo step 1
 *
 * For true atomicity across both writes, replace this with a single RPC,
 * e.g. `reverse_transaction(p_tx_id)` that does both in one PG transaction.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const db = await readDb();
  const tx = db.transactions.find((t) => t.id === id);
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = db.products.find((x) => x.id === tx.productId);
  const delta = tx.type === "IN" ? -tx.qty : tx.qty;
  const newStock = p ? p.stock + delta : null;

  if (p && newStock !== null && newStock < 0) {
    return NextResponse.json(
      { error: "Cannot reverse: stock would go negative." },
      { status: 409 },
    );
  }

  const sb = createServerSupabase();

  // 1. Reverse stock first. This is the operation we can roll back cheaply.
  if (p && newStock !== null) {
    const { error: stockErr } = await sb
      .from("products")
      .update({ stock: newStock })
      .eq("id", tx.productId);
    if (stockErr) {
      return NextResponse.json({ error: stockErr.message }, { status: 500 });
    }
  }

  // 2. Delete the transaction. If this fails, restore stock.
  try {
    await deleteTransactionRow(id);
  } catch (e) {
    if (p && newStock !== null) {
      const { error: rollbackErr } = await sb
        .from("products")
        .update({ stock: p.stock })
        .eq("id", tx.productId);
      if (rollbackErr) {
        console.error("[transactions] stock rollback failed:", rollbackErr);
      }
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed." },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}