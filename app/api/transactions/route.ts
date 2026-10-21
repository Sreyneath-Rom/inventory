// app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import { moveStock, readDb } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import type { TxType } from "@/lib/types";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") as TxType | null;
  const productId = url.searchParams.get("productId");
  const limit = Math.max(0, Math.floor(Number(url.searchParams.get("limit")) || 0));

  try {
    let list = (await readDb()).transactions;
    if (type === "IN" || type === "OUT") list = list.filter((t) => t.type === type);
    if (productId) list = list.filter((t) => t.productId === productId);
    if (limit > 0) list = list.slice(0, limit);
    return NextResponse.json(list);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type = body.type as TxType;
  if (type !== "IN" && type !== "OUT") {
    return NextResponse.json({ error: "type must be 'IN' or 'OUT'." }, { status: 422 });
  }

  // Feature check depends on direction.
  const auth = await requireFeature(type === "IN" ? "stockIn" : "stockOut");
  if (!auth.user) return auth.response;

  const productId = typeof body.productId === "string" ? body.productId : "";
  const qty = Number(body.qty);

  if (!productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 422 });
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json(
      { error: "Quantity must be a whole number greater than 0." },
      { status: 422 },
    );
  }

  const parsed = body.date ? new Date(body.date) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 422 });
  }
  const date = parsed.toISOString();

  try {
    // Atomic: insert + stock update in one PG transaction via move_stock RPC.
    const tx = await moveStock({
      type,
      productId,
      qty,
      unitPrice: Math.max(0, Number(body.unitPrice) || 0),
      party: typeof body.party === "string" ? body.party : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      date,
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}