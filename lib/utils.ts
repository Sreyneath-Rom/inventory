// lib/utils.ts
import type { Product, Transaction, TxType } from "./types";

export const cn = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

export const uid = () => Math.random().toString(36).slice(2, 10);

export const money = (n: number, cur = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);

/**
 * Parse either "YYYY-MM-DD" or a full ISO timestamp as a **local** Date.
 * Bare `new Date("2024-01-15")` is UTC midnight, which shifts the day for
 * anyone west of UTC. Always use this when reading `Transaction.date`.
 */
export function parseLocal(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T00:00:00`);
  return new Date(iso);
}

export const fmtDate = (iso: string) =>
  parseLocal(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

export const fmtDateTime = (iso: string) => {
  const d = parseLocal(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

export const startOfDay = (d: Date) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
};
export const endOfDay = (d: Date) => {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
};

const pad = (n: number, l = 2) => String(n).padStart(l, "0");

export const dayKey = (d: Date | string) => {
  const x = d instanceof Date ? d : parseLocal(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export const pctChange = (cur: number, prev: number) =>
  prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

export const stockStatus = (p: Product): "out" | "low" | "ok" =>
  p.stock <= 0 ? "out" : p.stock <= p.threshold ? "low" : "ok";

/**
 * Client-side best-effort ref. Server regenerates on POST /api/transactions
 * (the `move_stock` RPC owns the authoritative sequence), so this value is
 * only visible in the optimistic row for a fraction of a second.
 *
 * Computed from the **maximum existing number** for this (type, year) — not
 * from `filter(...).length`. Counting would reuse a number after a delete:
 * `[SI-2024-001, SI-2024-002]` → delete `001` → next would be `002`, which
 * already exists.
 */
export function nextRef(type: TxType, tx: Transaction[], date: string) {
  const y = parseLocal(date).getFullYear();
  const prefix = `${type === "IN" ? "SI" : "SO"}-${y}-`;

  let max = 0;
  for (const t of tx) {
    if (!t.ref.startsWith(prefix)) continue;
    const n = Number(t.ref.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${pad(max + 1, 3)}`;
}