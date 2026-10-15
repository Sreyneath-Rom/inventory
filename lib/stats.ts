import type { Product, Transaction, TxType } from "./types";
import { addDays, dayKey, endOfDay, startOfDay } from "./utils";

export interface Point {
  label: string;
  in: number;
  out: number;
}

export function rangeSeries(tx: Transaction[], from: Date, to: Date): Point[] {
  const map = new Map<string, Point>();
  const out: Point[] = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    const p = {
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      in: 0,
      out: 0,
    };
    map.set(dayKey(d), p);
    out.push(p);
  }
  tx.forEach((t) => {
    const p = map.get(dayKey(t.date));
    if (p) t.type === "IN" ? (p.in += t.qty) : (p.out += t.qty);
  });
  return out;
}

export const dailySeries = (tx: Transaction[], days: number) => {
  const end = new Date();
  return rangeSeries(tx, addDays(end, -(days - 1)), endOfDay(end));
};

/** Total qty in the last `days` days vs the `days` before that. */
export function periodTotals(tx: Transaction[], type: TxType, days: number) {
  const now = new Date();
  const curFrom = startOfDay(addDays(now, -(days - 1)));
  const prevFrom = addDays(curFrom, -days);
  let cur = 0,
    prev = 0;
  tx.forEach((t) => {
    if (t.type !== type) return;
    const d = new Date(t.date);
    if (d >= curFrom) cur += t.qty;
    else if (d >= prevFrom) prev += t.qty;
  });
  return { cur, prev };
}

export function topProducts(
  tx: Transaction[],
  products: Product[],
  days = 30,
  n = 5,
) {
  const from = startOfDay(addDays(new Date(), -(days - 1)));
  const sums = new Map<string, number>();
  tx.forEach((t) => {
    if (t.type === "OUT" && new Date(t.date) >= from)
      sums.set(t.productId, (sums.get(t.productId) ?? 0) + t.qty);
  });
  return [...sums.entries()]
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((x): x is { product: Product; qty: number } => !!x.product)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, n);
}
