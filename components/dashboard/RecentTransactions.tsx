import Link from "next/link";
import { ArrowRight, ArrowDownRight, ArrowUpRight, ReceiptText } from "lucide-react";
import type { Transaction } from "@/lib/types";
import { CardHeader, GlassCard } from "@/components/ui/GlassCard";
import { TxBadge } from "@/components/ui/Badge";
import { cn, fmtDate, fmtDateTime, money } from "@/lib/utils";

const ViewAll = () => (
  <Link
    href="/reports"
    className="flex items-center gap-1 text-xs font-semibold text-brand"
  >
    View all <ArrowRight size={12} />
  </Link>
);

export function RecentList({ tx }: { tx: Transaction[] }) {
  return (
    <GlassCard>
      <CardHeader icon={<ReceiptText size={18} />} title="Recent Activity" action={<ViewAll />} />
      <ul className="space-y-2.5">
        {tx.slice(0, 5).map((t) => (
          <li key={t.id} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white",
                t.type === "IN" ? "bg-emerald-400" : "bg-orange-400"
              )}
            >
              {t.type === "IN" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            </span>
            <span className="hidden sm:block">
              <TxBadge type={t.type} />
            </span>
            <span className="min-w-0 flex-1 truncate">{t.productName}</span>
            <b className={t.type === "IN" ? "text-emerald-600" : "text-red-500"}>
              {t.type === "IN" ? "+" : "-"}
              {t.qty}
            </b>
            <span className="hidden w-28 text-right text-xs text-slate-400 xl:block">
              {fmtDateTime(t.date)}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

export function RecentTable({ tx, currency }: { tx: Transaction[]; currency: string }) {
  return (
    <GlassCard>
      <CardHeader icon={<ReceiptText size={18} />} title="Recent Transactions" action={<ViewAll />} />
      <div className="neu-inset overflow-x-auto rounded-2xl">
        <table className="tbl min-w-[560px]">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Type</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {tx.slice(0, 5).map((t) => (
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
                <td>{money(t.qty * t.unitPrice, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}