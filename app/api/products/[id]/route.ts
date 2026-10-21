// app/api/products/[id]/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import {
  deleteProductRow, getProductById, readDb, updateProductRow,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import type { Product } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  try {
    const p = await getProductById(id);
    return p
      ? NextResponse.json(p)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

async function handlePut(req: Request, ctx: Ctx) {
  const auth = await requireFeature("products");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  let body: Partial<Product>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const existing = await getProductById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sku = (body.sku ?? existing.sku).trim();
    if (!sku) {
      return NextResponse.json({ error: "SKU cannot be empty." }, { status: 422 });
    }

    const db = await readDb();
    if (
      body.sku &&
      db.products.some(
        (p) => p.id !== id && p.sku.toLowerCase() === sku.toLowerCase(),
      )
    ) {
      return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
    }
    if (body.categoryId && !db.categories.some((c) => c.id === body.categoryId)) {
      return NextResponse.json({ error: "Category not found." }, { status: 422 });
    }

    // NOTE: `stock` is intentionally not writable here — use /api/transactions.
    const updated: Product = {
      ...existing,
      sku,
      name: (body.name ?? existing.name).trim() || existing.name,
      categoryId: body.categoryId ?? existing.categoryId,
      unit: (body.unit ?? existing.unit).trim() || existing.unit,
      cost: body.cost !== undefined ? Math.max(0, Number(body.cost) || 0) : existing.cost,
      price: body.price !== undefined ? Math.max(0, Number(body.price) || 0) : existing.price,
      threshold:
        body.threshold !== undefined
          ? Math.max(0, Math.floor(Number(body.threshold) || 0))
          : existing.threshold,
      image: body.image ?? existing.image,
    };
    return NextResponse.json(await updateProductRow(updated));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const PUT = handlePut;
/** PATCH is an alias of PUT. */
export const PATCH = handlePut;

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("products");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  try {
    const existing = await getProductById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const db = await readDb();
    if (db.transactions.some((t) => t.productId === id)) {
      return NextResponse.json(
        { error: "This product has transaction history and cannot be deleted." },
        { status: 409 },
      );
    }

    await deleteProductRow(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}