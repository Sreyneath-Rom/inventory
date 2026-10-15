import { NextResponse } from "next/server";
import { mutate, readDb, deleteUserRow } from "@/lib/server/db";
import { ROLES, type Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = (await readDb()).settings.users.find((u) => u.id === id);
  return user
    ? NextResponse.json(user)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = await readDb();
  const existing = db.settings.users.find((u) => u.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = (body.role as Role) ?? existing.role;
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 422 });
  }

  const updated = {
    ...existing,
    name: (body.name ?? existing.name).trim(),
    email: (body.email ?? existing.email).trim(),
    role,
  };

  await mutate((d) => {
    const i = d.settings.users.findIndex((u) => u.id === id);
    if (i !== -1) d.settings.users[i] = updated;
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readDb();
  if (!db.settings.users.some((u) => u.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteUserRow(id);
  return new NextResponse(null, { status: 204 });
}