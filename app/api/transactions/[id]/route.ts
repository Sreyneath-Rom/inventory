import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tx = (await readDb()).transactions.find((t) => t.id === id);
  return tx ? NextResponse.json(tx) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Deleting a transaction reverses its stock impact. If the reversal would push
 * a product below zero (because later OUTs already consumed the stock), the
 * request is rejected.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readDb();
  const tx = db.transactions.find((t) => t.id === id);
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = db.products.find((x) => x.id === tx.productId);
  if (p) {
    const delta = tx.type === "IN" ? -tx.qty : tx.qty;
    if (p.stock + delta < 0) {
      return NextResponse.json(
        { error: "Cannot reverse: stock would go negative." },
        { status: 409 }
      );
    }
  }

  await mutate((d) => {
    const product = d.products.find((x) => x.id === tx.productId);
    if (product) product.stock += tx.type === "IN" ? -tx.qty : tx.qty;
    d.transactions = d.transactions.filter((t) => t.id !== id);
  });
  return new NextResponse(null, { status: 204 });
}