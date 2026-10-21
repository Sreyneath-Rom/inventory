// app/api/db/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, replaceDb } from "@/lib/server/db";
import { isHttpError } from "@/lib/server/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { DB, Role } from "@/lib/types";

export async function GET() {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  try {
    return NextResponse.json(await readDb());
  } catch (e) {
    const status = isHttpError(e) ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Read failed" },
      { status },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  let body: DB;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const problem = validateDbPayload(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  if (!Array.isArray(body.employees)) body.employees = [];

  // Best-effort snapshot before wiping.
  try {
    const sb = createAdminSupabase();
    const backup = await readDb();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const { error: bkErr } = await sb.storage
      .from("db-backups")
      .upload(`db-${stamp}.json`, JSON.stringify(backup), {
        contentType: "application/json",
        upsert: false,
      });
    if (bkErr) console.warn("[db] backup upload failed:", bkErr.message);
  } catch (bkErr) {
    console.warn("[db] backup read/upload failed:", bkErr);
  }

  try {
    await replaceDb(body);
    console.info(
      `[db] PUT by user=${auth.user.id} role=${auth.role} at ${new Date().toISOString()}`,
    );
    return NextResponse.json(await readDb());
  } catch (e) {
    const status = isHttpError(e) ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Write failed" },
      { status },
    );
  }
}

function validateDbPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Body must be an object.";
  const b = body as Record<string, unknown>;

  for (const key of ["categories", "products", "transactions"]) {
    if (!Array.isArray(b[key])) return `"${key}" must be an array.`;
  }
  if (!b.settings || typeof b.settings !== "object")
    return `"settings" must be an object.`;
  const s = b.settings as Record<string, unknown>;
  if (!Array.isArray(s.users)) return `"settings.users" must be an array.`;

  const checkIds = (arr: unknown[], label: string) => {
    for (const row of arr) {
      if (!row || typeof row !== "object" || typeof (row as { id?: unknown }).id !== "string")
        return `Each entry in "${label}" must have a string id.`;
    }
    return null;
  };

  for (const key of ["categories", "products", "transactions"]) {
    const err = checkIds(b[key] as unknown[], key);
    if (err) return err;
  }
  const usersErr = checkIds(s.users as unknown[], "settings.users");
  if (usersErr) return usersErr;

  if (!(s.users as { role?: Role }[]).some((u) => u.role === "Admin"))
    return "At least one Admin must remain in settings.users.";

  return null;
}