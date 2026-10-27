// app/api/categories/[id]/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import {
  categoryHasProducts, categoryNameExists,
  deleteCategoryRow, getCategoryById, updateCategoryRow,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import type { Category } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Must match `categories_color_check` — see note in `../route.ts`. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  try {
    const cat = await getCategoryById(id);
    return cat
      ? NextResponse.json(cat)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireFeature("categories");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // `typeof null === "object"` and `typeof [] === "object"` — both would
  // pass a naive `typeof === "object"` check. Reject explicitly so a
  // malformed body gets a clean 400 instead of silently merging with
  // `existing` below.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  try {
    const existing = await getCategoryById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Type-check before `.trim()` — a non-string here would throw
    // `TypeError: ….trim is not a function` and escape as a 500.
    // Non-strings fall through to "keep existing", matching `?? undefined`.
    const name = typeof body.name === "string" ? body.name.trim() : existing.name;
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 422 });
    }

    const rawColor = typeof body.color === "string" ? body.color.trim() : "";
    const color = rawColor === "" ? existing.color : rawColor;
    if (!HEX_COLOR.test(color)) {
      return NextResponse.json(
        { error: "Color must be a 6-digit hex code like #3b82f6." },
        { status: 422 },
      );
    }

    // Race-safe duplicate check (same pattern as POST).
    if (name !== existing.name && (await categoryNameExists(name, id))) {
      return NextResponse.json({ error: "That category already exists." }, { status: 409 });
    }

    const updated: Category = { ...existing, name, color };
    return NextResponse.json(await updateCategoryRow(updated));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("categories");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  try {
    const existing = await getCategoryById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fast-path: clear message for the common case. A race between this
    // check and the delete still produces the same 409 via `deleteCategoryRow`
    // (Postgres 23503 → HttpError(409)), so the user sees the same result.
    if (await categoryHasProducts(id)) {
      return NextResponse.json(
        { error: "This category still has products. Move or delete them first." },
        { status: 409 },
      );
    }

    await deleteCategoryRow(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}