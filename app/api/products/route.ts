// app/api/products/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import {
  getCategoryById, insertProduct, listAllProducts, productSkuExists,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import type { Product } from "@/lib/types";

/**
 * Lists every product. `requireUser` (not `requireFeature`) — Staff and
 * Viewer accounts need the product list to browse and (for Staff) to
 * stock in/out. Mutating products is gated by `requireFeature`.
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json(await listAllProducts());
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Coerce a JSON value to a non-negative number, or `NaN` if it isn't one.
 * Strings that parse as finite numbers are accepted (`"10"` → `10`) because
 * HTML form inputs submit numbers as strings. Everything else is rejected
 * at the route — no silent "turn garbage into 0".
 */
function num(v: unknown, fallback = 0): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

export async function POST(req: Request) {
  const auth = await requireFeature("products");
  if (!auth.user) return auth.response;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Untrusted JSON — read every field through a type guard. `Partial<Product>`
  // is a developer promise, not a runtime check: `{"name": 123}` would throw
  // on `.trim()` without these guards.
  const body = (raw ?? {}) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sku  = typeof body.sku  === "string" ? body.sku.trim()  : "";
  if (!name || !sku) {
    return NextResponse.json({ error: "Name and SKU are required." }, { status: 422 });
  }
  if (typeof body.categoryId !== "string" || !body.categoryId) {
    return NextResponse.json({ error: "Category is required." }, { status: 422 });
  }

  const cost      = num(body.cost);
  const price     = num(body.price);
  const stock     = Math.floor(num(body.stock));
  const threshold = Math.floor(num(body.threshold));
  for (const [field, v] of [
    ["cost", cost], ["price", price], ["stock", stock], ["threshold", threshold],
  ] as const) {
    if (Number.isNaN(v)) {
      return NextResponse.json(
        { error: `${field} must be a non-negative number.` },
        { status: 422 },
      );
    }
  }

  const unit  = typeof body.unit  === "string" ? body.unit.trim()  || "pcs" : "pcs";
  const image = typeof body.image === "string" ? body.image              : "";
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  try {
    // Two single-row checks instead of `readDb()`.
    if (await productSkuExists(sku)) {
      return NextResponse.json({ error: `SKU "${sku}" already exists.` }, { status: 409 });
    }
    if (!(await getCategoryById(body.categoryId))) {
      return NextResponse.json({ error: "Category not found." }, { status: 422 });
    }

    const product: Product = {
      id: crypto.randomUUID(),       // was `uid()` (Math.random, 41 bits)
      sku, name,
      categoryId: body.categoryId,
      unit, cost, price, stock, threshold, image,
      ...(isActive !== undefined ? { isActive } : {}),
    };
    return NextResponse.json(await insertProduct(product), { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}