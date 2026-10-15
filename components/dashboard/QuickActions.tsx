import Link from "next/link";
import { ChevronRight, Minus, Plus } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

export function QuickActions() {
  return (
    <GlassCard>
      <h3 className="mb-4 font-semibold">Quick Actions</h3>
      <div className="space-y-3">
        <Link href="/stock-in" className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-200/80 to-emerald-100/60 p-3 shadow-glass transition hover:scale-[1.02]">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-emerald-300 to-emerald-500 text-white shadow-lg shadow-emerald-500/40"><Plus /></span>
          <span className="flex-1"><b className="block text-sm">Stock In</b><span className="text-xs text-slate-500">Add new items to inventory</span></span>
          <ChevronRight size={16} className="text-slate-400" />
        </Link>
        <Link href="/stock-out" className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-200/80 to-orange-100/60 p-3 shadow-glass transition hover:scale-[1.02]">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-orange-300 to-red-500 text-white shadow-lg shadow-orange-500/40"><Minus /></span>
          <span className="flex-1"><b className="block text-sm">Stock Out</b><span className="text-xs text-slate-500">Remove items from inventory</span></span>
          <ChevronRight size={16} className="text-slate-400" />
        </Link>
      </div>
    </GlassCard>
  );
}