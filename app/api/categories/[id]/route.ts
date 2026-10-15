import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const cat = (await readDb()).categories.find((c) => c.id === id);
  return cat ? NextResponse.json(cat) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const db = await readDb();
  const existing = db.categories.find((c) => c.id === id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const name = (body.name ?? existing.name).trim();
  if (db.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "That category already exists." }, { status: 409 });
  }
  const updated = { ...existing, name, color: body.color ?? existing.color };
  await mutate((d) => {
    const i = d.categories.findIndex((c) => c.id === id);
    if (i !== -1) d.categories[i] = updated;
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readDb();
  if (!db.categories.some((c) => c.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (db.products.some((p) => p.categoryId === id)) {
    return NextResponse.json(
      { error: "This category still has products. Move or delete them first." },
      { status: 409 }
    );
  }
  await mutate((d) => {
    d.categories = d.categories.filter((c) => c.id !== id);
  });
  return new NextResponse(null, { status: 204 });
}