import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createEmployeeRow, EmployeeError, readDb } from "@/lib/server/db";
import { normalizeEmployee, validateEmployeeFields } from "@/lib/employees";
import type { EmployeeFormData } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json((await readDb()).employees);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  let body: EmployeeFormData;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = normalizeEmployee(body);
  const problem = validateEmployeeFields(data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    return NextResponse.json(await createEmployeeRow(data), { status: 201 });
  } catch (e) {
    const status = e instanceof EmployeeError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status });
  }
}