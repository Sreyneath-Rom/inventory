import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";
import { uid } from "@/lib/utils";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json((await readDb()).categories);
}

export async function POST(req: Request) {
  let body: Partial<Category>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 422 });

  const db = await readDb();
  if (db.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "That category already exists." }, { status: 409 });
  }
  const cat: Category = { id: uid(), name, color: body.color || "#3b82f6" };
  await mutate((d) => {
    d.categories.push(cat);
  });
  return NextResponse.json(cat, { status: 201 });
}