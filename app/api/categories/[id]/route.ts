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

const HEX_COLOR = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

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
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const existing = await getCategoryById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const name = (body.name ?? existing.name).trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 422 });
    }

    const rawColor = (body.color ?? existing.color).trim();
    const color = rawColor || existing.color;
    if (!HEX_COLOR.test(color)) {
      return NextResponse.json(
        { error: "Color must be a hex code like #3b82f6." },
        { status: 422 },
      );
    }

    // Same race-safe pattern as POST: check for a fast 409, and rely on
    // the unique index (mapped to 409 in updateCategoryRow) for the
    // concurrent case.
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

    // Fast-path check: catches the common case with a clear message. If a
    // product is inserted between here and the delete, `deleteCategoryRow`
    // maps Postgres 23503 (FK restrict) to the same 409 — either way the
    // user sees the same thing and no orphaned product is possible.
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