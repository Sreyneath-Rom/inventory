// app/api/employees/[id]/route.ts
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth";
import {
  deleteEmployeeRow, getEmployeeById, updateEmployeeRow,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { normalizeEmployee, validateEmployeeFields } from "@/lib/employees";
import type { EmployeeFormData } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const emp = await getEmployeeById(id);
    return emp
      ? NextResponse.json(emp)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

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
    return NextResponse.json(await updateEmployeeRow({ id, ...data }));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    await deleteEmployeeRow(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}