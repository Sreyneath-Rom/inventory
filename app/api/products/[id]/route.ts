// app/api/products/[id]/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import {
  deleteProductRow, getCategoryById, getProductById,
  productHasTransactions, productSkuExists, updateProductRow,
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

/** Same coercion rule as `POST /api/products` — see the doc comment there. */
function num(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

async function handlePut(req: Request, ctx: Ctx) {
  const auth = await requireFeature("products");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  try {
    const existing = await getProductById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // --- Strings: only override when the client provided a *string*. -----
    const sku = typeof body.sku === "string" ? body.sku.trim() : existing.sku;
    if (!sku) {
      return NextResponse.json({ error: "SKU cannot be empty." }, { status: 422 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : existing.name;
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 422 });
    }
    const unit =
      typeof body.unit === "string" ? body.unit.trim() || existing.unit : existing.unit;
    const image =
      typeof body.image === "string" ? body.image : existing.image;

    // --- Numbers: coerce, reject NaN. -------------------------------------
    const cost      = num(body.cost,      existing.cost);
    const price     = num(body.price,     existing.price);
    const threshold = Math.floor(num(body.threshold, existing.threshold));
    for (const [field, v] of [
      ["cost", cost], ["price", price], ["threshold", threshold],
    ] as const) {
      if (Number.isNaN(v)) {
        return NextResponse.json(
          { error: `${field} must be a non-negative number.` },
          { status: 422 },
        );
      }
    }

    // --- categoryId: must exist and be a string. --------------------------
    const categoryId =
      typeof body.categoryId === "string" && body.categoryId
        ? body.categoryId
        : existing.categoryId;
    if (categoryId !== existing.categoryId) {
      if (!(await getCategoryById(categoryId))) {
        return NextResponse.json({ error: "Category not found." }, { status: 422 });
      }
    }

    // --- Uniqueness: only check when the SKU actually changed. -----------
    if (sku !== existing.sku && (await productSkuExists(sku, id))) {
      return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
    }

    // --- isActive: allow archive/unarchive via PUT/PATCH. ----------------
    // Without this, `updateProductRow(updated)` would re-send
    // `existing.isActive` (from the spread below), silently dropping the
    // client's intended change.
    const isActive =
      typeof body.isActive === "boolean" ? body.isActive : undefined;

    // NOTE: `stock` is intentionally not writable here — use /api/transactions.
    const updated: Product = {
      ...existing,
      sku, name, categoryId, unit, cost, price, threshold, image,
      ...(isActive !== undefined ? { isActive } : {}),
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

    // Single indexed count instead of `readDb()`.
    if (await productHasTransactions(id)) {
      return NextResponse.json(
        { error: "This product has transaction history and cannot be deleted. Archive it instead." },
        { status: 409 },
      );
    }

    await deleteProductRow(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}