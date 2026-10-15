import type { Product, Transaction, TxType } from "./types";

export const cn = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");
export const uid = () => Math.random().toString(36).slice(2, 10);
export const money = (n: number, cur = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(
    n,
  );
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};
export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const pad = (n: number, l = 2) => String(n).padStart(l, "0");
export const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const pctChange = (cur: number, prev: number) =>
  prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

export const stockStatus = (p: Product): "out" | "low" | "ok" =>
  p.stock <= 0 ? "out" : p.stock <= p.threshold ? "low" : "ok";

/** SI-2026-001 / SO-2026-001 */
export function nextRef(type: TxType, tx: Transaction[], date: string) {
  const y = new Date(date).getFullYear();
  const n =
    tx.filter((t) => t.type === type && new Date(t.date).getFullYear() === y)
      .length + 1;
  return `${type === "IN" ? "SI" : "SO"}-${y}-${pad(n, 3)}`;
}
