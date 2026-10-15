import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readDb();
  const p = db.products.find((x) => x.id === id);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Partial<Product>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = await readDb();
  const existing = db.products.find((x) => x.id === id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sku = (body.sku ?? existing.sku).trim();
  if (body.sku && db.products.some((p) => p.id !== id && p.sku.toLowerCase() === sku.toLowerCase())) {
    return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
  }

  const updated: Product = {
    ...existing,
    sku,
    name: (body.name ?? existing.name).trim(),
    categoryId: body.categoryId ?? existing.categoryId,
    unit: body.unit ?? existing.unit,
    cost: body.cost !== undefined ? Math.max(0, Number(body.cost) || 0) : existing.cost,
    price: body.price !== undefined ? Math.max(0, Number(body.price) || 0) : existing.price,
    // Stock is intentionally NOT changed via PUT — use /api/transactions.
    threshold: body.threshold !== undefined ? Math.max(0, Math.floor(Number(body.threshold) || 0)) : existing.threshold,
    emoji: body.emoji ?? existing.emoji,
  };

  await mutate((d) => {
    const i = d.products.findIndex((p) => p.id === id);
    if (i !== -1) d.products[i] = updated;
  });
  return NextResponse.json(updated);
}

/** PATCH is the same as PUT here — kept for client convenience. */
export const PATCH = PUT;

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readDb();
  if (!db.products.some((p) => p.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await mutate((d) => {
    d.products = d.products.filter((p) => p.id !== id);
  });
  return new NextResponse(null, { status: 204 });
}