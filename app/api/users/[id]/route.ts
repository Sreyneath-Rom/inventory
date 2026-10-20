import { NextResponse } from "next/server";
import { requireRole, requireUser } from "@/lib/auth";
import { mutate, readDb, deleteUserRow } from "@/lib/server/db";
import { ROLES, type Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  const user = (await readDb()).settings.users.find((u) => u.id === id);
  return user
    ? NextResponse.json(user)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;
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
    name: String(body.name ?? existing.name).trim(),
    email: String(body.email ?? existing.email).trim(),
    role,
  };
  if (!updated.name || !updated.email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 422 });
  }
  if (db.settings.users.some((u) => u.id !== id && u.email.toLowerCase() === updated.email.toLowerCase())) {
    return NextResponse.json({ error: "That email already exists." }, { status: 409 });
  }
  const admins = db.settings.users.filter((u) => u.role === "Admin").length;
  if (existing.role === "Admin" && role !== "Admin" && admins <= 1) {
    return NextResponse.json({ error: "At least one Admin is required." }, { status: 409 });
  }

  await mutate((d) => {
    const i = d.settings.users.findIndex((u) => u.id === id);
    if (i !== -1) d.settings.users[i] = updated;
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  const db = await readDb();
  if (!db.settings.users.some((u) => u.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const target = db.settings.users.find((u) => u.id === id)!;
  if (target.role === "Admin" && db.settings.users.filter((u) => u.role === "Admin").length <= 1) {
    return NextResponse.json({ error: "At least one Admin is required." }, { status: 409 });
  }
  await deleteUserRow(id);
  return new NextResponse(null, { status: 204 });
}