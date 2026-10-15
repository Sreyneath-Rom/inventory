import { NextResponse } from "next/server";
import { readDb, deleteTransactionRow } from "@/lib/server/db";
import { createServerSupabase } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tx = (await readDb()).transactions.find((t) => t.id === id);
  return tx
    ? NextResponse.json(tx)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Deleting a transaction reverses its stock impact. If the reversal would
 * push a product below zero (because later OUTs already consumed the
 * stock), the request is rejected.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readDb();

  const tx = db.transactions.find((t) => t.id === id);
  if (!tx) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const p = db.products.find((x) => x.id === tx.productId);
  if (p) {
    const delta = tx.type === "IN" ? -tx.qty : tx.qty;
    if (p.stock + delta < 0) {
      return NextResponse.json(
        { error: "Cannot reverse: stock would go negative." },
        { status: 409 }
      );
    }

    // Narrow update on the one product row — do NOT call mutate() here,
    // because that would re-upsert the transaction we're deleting.
    const sb = createServerSupabase();
    const { error: stockErr } = await sb
      .from("products")
      .update({ stock: p.stock + delta })
      .eq("id", tx.productId);
    if (stockErr) {
      return NextResponse.json({ error: stockErr.message }, { status: 500 });
    }
  }

  await deleteTransactionRow(id);
  return new NextResponse(null, { status: 204 });
}