// app/api/categories/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import {
  categoryNameExists, insertCategory, listAllCategories,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import type { Category } from "@/lib/types";

/**
 * Must match `categories_color_check` in schema.sql exactly:
 *   CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
 *
 * Anything looser (e.g. 3-digit `#abc`) passes route validation and dies
 * on the DB with 23514 — mapped to a generic "database rule" message that
 * tells the user nothing.
 */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/* ─── GET /api/categories ─────────────────────────────────────────────
 * `requireUser`, not `requireFeature("categories")`: Staff and Viewer
 * accounts have product permissions but not category permissions —
 * they still need the list to render product category names. Mutating
 * categories is gated on `requireFeature`, below.
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json(await listAllCategories());
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* ─── POST /api/categories ──────────────────────────────────────────── */
export async function POST(req: Request) {
  const auth = await requireFeature("categories");
  if (!auth.user) return auth.response;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // An untrusted client can send any JSON — `Partial<Category>` is a
  // developer promise, not a guard. Every field is read through a type
  // check so a non-string (number, null, array) doesn't crash `.trim()`.
  const body = (raw ?? {}) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 422 });
  }

  const rawColor = typeof body.color === "string" ? body.color.trim() : "";
  const color = rawColor === "" ? "#3b82f6" : rawColor;
  if (!HEX_COLOR.test(color)) {
    return NextResponse.json(
      { error: "Color must be a 6-digit hex code like #3b82f6." },
      { status: 422 },
    );
  }

  try {
    // Fast-path feedback. The unique index is what makes this safe under
    // concurrency — `insertCategory` maps 23505 to 409, so a race past
    // this check still gets a clean response on the loser.
    if (await categoryNameExists(name)) {
      return NextResponse.json({ error: "That category already exists." }, { status: 409 });
    }

    // `crypto.randomUUID()`, not `uid()`. Two reasons:
    //   1. Schema default is `gen_random_uuid()::text` — same shape.
    //   2. `uid()` (Math.random, 41 bits) can collide on the PK. The
    //      23505 handler would then say "That category already exists."
    //      even though only the id collided — misleading and unrecoverable
    //      by the user.
    const cat: Category = { id: crypto.randomUUID(), name, color };
    return NextResponse.json(await insertCategory(cat), { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}