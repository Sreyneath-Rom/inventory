import { cn } from "@/lib/utils";
import type { TxType } from "@/lib/types";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function Badge({ tone, children }: { tone: "green" | "orange" | "red" | "blue" | "slate"; children: React.ReactNode }) {
  const t = {
    green: "bg-emerald-100/80 text-emerald-700", orange: "bg-orange-100/80 text-orange-700",
    red: "bg-red-100/80 text-red-600", blue: "bg-blue-100/80 text-blue-700", slate: "bg-slate-100/80 text-slate-600",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", t)}>{children}</span>;
}

export const TxBadge = ({ type }: { type: TxType }) =>
  type === "IN"
    ? <Badge tone="green"><ArrowUpRight size={12} />Stock In</Badge>
    : <Badge tone="orange"><ArrowDownRight size={12} />Stock Out</Badge>;