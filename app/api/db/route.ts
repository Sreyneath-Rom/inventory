import { NextResponse } from "next/server";
import { readDb, replaceDb } from "@/lib/server/db";
import type { DB } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readDb());
}

export async function PUT(req: Request) {
  let body: Partial<DB>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || !Array.isArray(body.products) || !Array.isArray(body.categories)) {
    return NextResponse.json({ error: "Body must contain products[], categories[], transactions[], settings" }, { status: 400 });
  }
  await replaceDb(body as DB);
  return NextResponse.json(await readDb());
}