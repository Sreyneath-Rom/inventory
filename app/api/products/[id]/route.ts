import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mutate, readDb, deleteProductRow } from "@/lib/server/db";
import type { Product } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  const p = (await readDb()).products.find((x) => x.id === id);
  return p
    ? NextResponse.json(p)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  let body: Partial<Product>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = await readDb();
  const existing = db.products.find((x) => x.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sku = (body.sku ?? existing.sku).trim();
  if (
    body.sku &&
    db.products.some(
      (p) => p.id !== id && p.sku.toLowerCase() === sku.toLowerCase()
    )
  ) {
    return NextResponse.json(
      { error: `SKU "${sku}" already exists.` },
      { status: 409 }
    );
  }

  if (body.categoryId && !db.categories.some((c) => c.id === body.categoryId)) {
    return NextResponse.json({ error: "Category not found." }, { status: 422 });
  }

  const updated: Product = {
    ...existing,
    sku,
    name: (body.name ?? existing.name).trim(),
    categoryId: body.categoryId ?? existing.categoryId,
    unit: body.unit ?? existing.unit,
    cost:
      body.cost !== undefined ? Math.max(0, Number(body.cost) || 0) : existing.cost,
    price:
      body.price !== undefined
        ? Math.max(0, Number(body.price) || 0)
        : existing.price,
    // Stock intentionally NOT changed here — use /api/transactions.
    threshold:
      body.threshold !== undefined
        ? Math.max(0, Math.floor(Number(body.threshold) || 0))
        : existing.threshold,
    image: body.image ?? existing.image,
  };

  await mutate((d) => {
    const i = d.products.findIndex((p) => p.id === id);
    if (i !== -1) d.products[i] = updated;
  });
  return NextResponse.json(updated);
}

/** PATCH is the same as PUT — kept for client convenience. */
export const PATCH = PUT;

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  const db = await readDb();
  if (!db.products.some((p) => p.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (db.transactions.some((t) => t.productId === id)) {
    return NextResponse.json(
      { error: "This product has transaction history and cannot be deleted." },
      { status: 409 }
    );
  }
  await deleteProductRow(id);
  return new NextResponse(null, { status: 204 });
}