import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";
import { uid } from "@/lib/utils";
import type { Product } from "@/lib/types";


export async function GET() {
  const db = await readDb();
  return NextResponse.json(db.products);
}

export async function POST(req: Request) {
  let body: Partial<Product>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const sku = (body.sku ?? "").trim();
  if (!name || !sku) return NextResponse.json({ error: "Name and SKU are required." }, { status: 422 });
  if (!body.categoryId) return NextResponse.json({ error: "Category is required." }, { status: 422 });

  const db = await readDb();
  if (db.products.some((p) => p.sku.toLowerCase() === sku.toLowerCase())) {
    return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
  }
  if (!db.categories.some((c) => c.id === body.categoryId)) {
    return NextResponse.json({ error: "Category not found." }, { status: 422 });
  }

  const product: Product = {
    id: uid(),
    sku,
    name,
    categoryId: body.categoryId,
    unit: body.unit ?? "pcs",
    cost: Math.max(0, Number(body.cost) || 0),
    price: Math.max(0, Number(body.price) || 0),
    stock: Math.max(0, Math.floor(Number(body.stock) || 0)),
    threshold: Math.max(0, Math.floor(Number(body.threshold) || 0)),
    emoji: body.emoji || "📦",
  };

  await mutate((d) => {
    d.products.unshift(product);
  });
  return NextResponse.json(product, { status: 201 });
}