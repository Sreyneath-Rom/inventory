import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Name, email, and password are required." },
      { status: 422 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 422 }
    );
  }

  const admin = createServerSupabase();

  // Check first: if this query fails we must not fall through to "first user = Admin".
  const { count, error: countErr } = await admin
    .from("app_users")
    .select("*", { count: "exact", head: true });
  if (countErr) {
    return NextResponse.json({ error: "Could not verify existing users." }, { status: 500 });
  }

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }

  const role = count === 0 ? "Admin" : "Staff";

  const { error: insertErr } = await admin.from("app_users").insert({
    id: authUser.user.id,
    name,
    email,
    role,
  });

  if (insertErr) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: authUser.user.id, email, name, role },
    { status: 201 }
  );
}