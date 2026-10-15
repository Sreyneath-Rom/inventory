import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";
import { uid } from "@/lib/utils";
import { ROLES, type AppUser, type Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json((await readDb()).settings.users);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const role = (body.role as Role) ?? "Staff";
  if (!name || !email) return NextResponse.json({ error: "Name and email are required." }, { status: 422 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 422 });

  const db = await readDb();
  if (db.settings.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return NextResponse.json({ error: "That email already exists." }, { status: 409 });
  }

  const user: AppUser = { id: uid(), name, email, role };
  await mutate((d) => {
    d.settings.users.push(user);
  });
  return NextResponse.json(user, { status: 201 });
}