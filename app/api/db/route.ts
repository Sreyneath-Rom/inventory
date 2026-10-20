import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth";
import { readDb, writeDb } from "@/lib/db-map";
import type { DB } from "@/lib/types";

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const sb = createServerSupabase(); // service role: works with RLS enabled
  try {
    return NextResponse.json(await readDb(sb));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Read failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireRole("Admin"); // replaces ALL data
  if (!auth.user) return auth.response;
  const sb = createServerSupabase();

  let body: DB;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // writeDb wipes every table first, so reject malformed payloads up front.
  const ok =
    body && Array.isArray(body.categories) && Array.isArray(body.products) &&
    Array.isArray(body.transactions) && body.settings && Array.isArray(body.settings.users);
  if (!ok) return NextResponse.json({ error: "Malformed database payload." }, { status: 422 });
  body.employees = Array.isArray(body.employees) ? body.employees : [];

  try {
    await writeDb(sb, body);
    return NextResponse.json(await readDb(sb));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Write failed" },
      { status: 500 },
    );
  }
}