// app/api/categories/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import { categoryNameExists, insertCategory, readDb } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { uid } from "@/lib/utils";
import type { Category } from "@/lib/types";

const HEX_COLOR = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json((await readDb()).categories);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireFeature("categories");
  if (!auth.user) return auth.response;

  let body: Partial<Category>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 422 });
  }

  const rawColor = (body.color ?? "").trim();
  const color = rawColor === "" ? "#3b82f6" : rawColor;
  if (!HEX_COLOR.test(color)) {
    return NextResponse.json(
      { error: "Color must be a hex code like #3b82f6." },
      { status: 422 },
    );
  }

  try {
    // Fast-path feedback. The unique index in the DB is what makes this
    // safe under concurrency — insertCategory maps 23505 to 409, so even
    // if two requests race past this check, the loser gets a clean 409.
    if (await categoryNameExists(name)) {
      return NextResponse.json({ error: "That category already exists." }, { status: 409 });
    }

    const cat: Category = { id: uid(), name, color };
    return NextResponse.json(await insertCategory(cat), { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}