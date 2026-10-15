import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";
import { nextRef, uid } from "@/lib/utils";
import type { Transaction, TxType } from "@/lib/types";


export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as TxType | null;
  const productId = url.searchParams.get("productId");
  const limit = Number(url.searchParams.get("limit")) || 0;

  let list = (await readDb()).transactions;
  if (type === "IN" || type === "OUT") list = list.filter((t) => t.type === type);
  if (productId) list = list.filter((t) => t.productId === productId);
  if (limit > 0) list = list.slice(0, limit);
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const type = body.type as TxType;
  const productId = body.productId as string;
  const qty = Number(body.qty);

  if (type !== "IN" && type !== "OUT") {
    return NextResponse.json({ error: "type must be 'IN' or 'OUT'." }, { status: 422 });
  }
  if (!productId) return NextResponse.json({ error: "productId is required." }, { status: 422 });
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: "Quantity must be a whole number greater than 0." }, { status: 422 });
  }

  const db = await readDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  if (type === "OUT" && qty > product.stock) {
    return NextResponse.json(
      { error: `Insufficient stock. Only ${product.stock} ${product.unit} of ${product.name} available.` },
      { status: 409 }
    );
  }

  const date = (body.date as string) || new Date().toISOString();

  const tx = await mutate<Transaction>((d) => {
    const p = d.products.find((x) => x.id === productId)!;
    const record: Transaction = {
      id: uid(),
      ref: nextRef(type, d.transactions, date),
      type,
      productId,
      productName: p.name,
      qty,
      unitPrice: Number(body.unitPrice) || 0,
      party: body.party || undefined,
      note: body.note || undefined,
      date,
    };
    p.stock += type === "IN" ? qty : -qty;
    d.transactions.unshift(record);
    return record;
  });

  return NextResponse.json(tx, { status: 201 });
}