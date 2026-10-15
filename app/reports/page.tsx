"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Guard } from "@/components/ui/Guard";
import { GlassCard } from "@/components/ui/GlassCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TxBadge } from "@/components/ui/Badge";
import { ChartLegend, MovementChart } from "@/components/dashboard/MovementChart";
import { useStore } from "@/lib/store";
import { download, toCSV } from "@/lib/csv";
import { rangeSeries } from "@/lib/stats";
import { addDays, cn, dayKey, endOfDay, fmtDate, money, startOfDay } from "@/lib/utils";

export default function ReportsPage() {
  const { db } = useStore();
  const cur = db.settings.currency;
  const [from, setFrom] = useState(dayKey(addDays(new Date(), -29)));
  const [to, setTo] = useState(dayKey(new Date()));
  const [type, setType] = useState("ALL");
  const [cat, setCat] = useState("ALL");

  const tx = useMemo(() => {
    const a = startOfDay(new Date(`${from}T00:00:00`));
    const b = endOfDay(new Date(`${to}T00:00:00`));
    return db.transactions.filter((t) => {
      const d = new Date(t.date);
      if (d < a || d > b) return false;
      if (type !== "ALL" && t.type !== type) return false;
      if (cat !== "ALL" && db.products.find((p) => p.id === t.productId)?.categoryId !== cat)
        return false;
      return true;
    });
  }, [db, from, to, type, cat]);

  const sum = (ty: "IN" | "OUT", asMoney = false) =>
    tx.filter((t) => t.type === ty).reduce((s, t) => s + (asMoney ? t.qty * t.unitPrice : t.qty), 0);

  const inQty = sum("IN");
  const outQty = sum("OUT");
  const inVal = sum("IN", true);
  const outVal = sum("OUT", true);

  const series = useMemo(
    () => rangeSeries(tx, new Date(`${from}T00:00:00`), endOfDay(new Date(`${to}T00:00:00`))),
    [tx, from, to]
  );

  const byProduct = useMemo(() => {
    const m = new Map<string, { name: string; in: number; out: number; stock: number | null }>();
    tx.forEach((t) => {
      const row = m.get(t.productId) ?? {
        name: t.productName,
        in: 0,
        out: 0,
        stock: db.products.find((p) => p.id === t.productId)?.stock ?? null,
      };
      t.type === "IN" ? (row.in += t.qty) : (row.out += t.qty);
      m.set(t.productId, row);
    });
    return [...m.values()].sort((a, b) => b.out + b.in - (a.out + a.in));
  }, [tx, db.products]);

  const exportTx = () =>
    download(
      `transactions_${from}_${to}.csv`,
      toCSV([
        ["Date", "Reference", "Type", "Product", "Quantity", "Unit price", "Total", "Party", "Note"],
        ...tx.map((t) => [
          fmtDate(t.date),
          t.ref,
          t.type === "IN" ? "Stock In" : "Stock Out",
          t.productName,
          t.qty,
          t.unitPrice,
          +(t.qty * t.unitPrice).toFixed(2),
          t.party ?? "",
          t.note ?? "",
        ]),
      ])
    );

  const exportSummary = () =>
    download(
      `product_summary_${from}_${to}.csv`,
      toCSV([
        ["Product", "Stock In", "Stock Out", "Net", "Current stock"],
        ...byProduct.map((r) => [r.name, r.in, r.out, r.in - r.out, r.stock ?? "deleted"]),
      ])
    );

  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <GlassCard className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone)}>{value}</p>
    </GlassCard>
  );

  return (
    <Guard feature="reports">
      <PageHeader
        title="Reports"
        subtitle="Movement statistics and exportable records"
        actions={
          <>
            <Button variant="ghost" onClick={exportSummary} disabled={!byProduct.length}>
              <Download size={16} /> Product summary
            </Button>
            <Button onClick={exportTx} disabled={!tx.length}>
              <Download size={16} /> Export transactions
            </Button>
          </>
        }
      />

      <GlassCard className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From">
            <input type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className="field" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Type">
            <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="ALL">All</option>
              <option value="IN">Stock In</option>
              <option value="OUT">Stock Out</option>
            </select>
          </Field>
          <Field label="Category">
            <select className="field" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="ALL">All</option>
              {db.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </GlassCard>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Units received" value={inQty.toLocaleString()} tone="text-emerald-600" />
        <Stat label="Units issued" value={outQty.toLocaleString()} tone="text-orange-600" />
        <Stat
          label="Net movement"
          value={`${inQty - outQty >= 0 ? "+" : ""}${(inQty - outQty).toLocaleString()}`}
        />
        <Stat label="Purchase value" value={money(inVal, cur)} />
        <Stat label="Sales value" value={money(outVal, cur)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <GlassCard>
          <h3 className="mb-2 font-semibold">Daily movement</h3>
          <ChartLegend />
          <MovementChart data={series} />
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 font-semibold">By product</h3>
          <div className="neu-inset max-h-72 overflow-auto rounded-2xl">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Net</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="text-emerald-600">{r.in}</td>
                    <td className="text-orange-600">{r.out}</td>
                    <td className="font-semibold">{r.in - r.out}</td>
                    <td>{r.stock ?? "—"}</td>
                  </tr>
                ))}
                {!byProduct.length && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No data for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="mt-5">
        <h3 className="mb-3 font-semibold">Transactions ({tx.length})</h3>
        <div className="neu-inset max-h-[480px] overflow-auto rounded-2xl">
          <table className="tbl min-w-[720px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Party</th>
              </tr>
            </thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)}</td>
                  <td className="text-slate-500">{t.ref}</td>
                  <td>
                    <TxBadge type={t.type} />
                  </td>
                  <td>{t.productName}</td>
                  <td className={cn("font-semibold", t.type === "IN" ? "text-emerald-600" : "text-red-500")}>
                    {t.type === "IN" ? "+" : "-"}
                    {t.qty}
                  </td>
                  <td>{money(t.qty * t.unitPrice, cur)}</td>
                  <td className="text-slate-500">{t.party ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </Guard>
  );
}