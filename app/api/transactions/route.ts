import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mutate, readDb } from "@/lib/server/db";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { nextRef, uid } from "@/lib/utils";
import type { Transaction, TxType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as TxType | null;
  const productId = url.searchParams.get("productId");
  const limit = Math.max(0, Math.floor(Number(url.searchParams.get("limit")) || 0));

  let list = (await readDb()).transactions;
  if (type === "IN" || type === "OUT") list = list.filter((t) => t.type === type);
  if (productId) list = list.filter((t) => t.productId === productId);
  if (limit > 0) list = list.slice(0, limit);
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type = body.type as TxType;
  const productId = typeof body.productId === "string" ? body.productId : "";
  const qty = Number(body.qty);

  if (type !== "IN" && type !== "OUT") {
    return NextResponse.json({ error: "type must be 'IN' or 'OUT'." }, { status: 422 });
  }
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
    const tx = await mutate<Transaction>((d) => {
      const p = d.products.find((x) => x.id === productId);
      if (!p) throw new HttpError(404, "Product not found.");

      // Re-check stock INSIDE the mutator — prevents concurrent OUTs
      // from both passing the pre-check and driving stock negative.
      if (type === "OUT" && qty > p.stock) {
        throw new HttpError(
          409,
          `Insufficient stock. Only ${p.stock} ${p.unit} of ${p.name} available.`,
        );
      }

      const record: Transaction = {
        id: uid(),
        ref: nextRef(type, d.transactions, date),
        type,
        productId,
        productName: p.name,
        qty,
        unitPrice: Math.max(0, Number(body.unitPrice) || 0),
        party: typeof body.party === "string" ? body.party : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
        date,
      };
      p.stock += type === "IN" ? qty : -qty;
      d.transactions.unshift(record);
      return record;
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}