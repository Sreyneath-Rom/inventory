// app/api/products/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import { insertProduct, readDb } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { uid } from "@/lib/utils";
import type { Product } from "@/lib/types";

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json((await readDb()).products);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireFeature("products");
  if (!auth.user) return auth.response;

  let body: Partial<Product>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const sku = (body.sku ?? "").trim();
  if (!name || !sku) {
    return NextResponse.json({ error: "Name and SKU are required." }, { status: 422 });
  }
  if (!body.categoryId) {
    return NextResponse.json({ error: "Category is required." }, { status: 422 });
  }

  try {
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
      unit: (body.unit ?? "pcs").trim() || "pcs",
      cost: Math.max(0, Number(body.cost) || 0),
      price: Math.max(0, Number(body.price) || 0),
      stock: Math.max(0, Math.floor(Number(body.stock) || 0)),
      threshold: Math.max(0, Math.floor(Number(body.threshold) || 0)),
      image: body.image ?? "",
    };
    return NextResponse.json(await insertProduct(product), { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}