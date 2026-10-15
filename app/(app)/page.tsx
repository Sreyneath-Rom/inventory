"use client";



import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ArrowRightCircle,
  Boxes,
  Hand,
  CalendarDays,
  LineChart,
} from "lucide-react";
import { Guard } from "@/components/ui/Guard";
import { CardHeader, GlassCard } from "@/components/ui/GlassCard";
import { Delta, StatCard } from "@/components/dashboard/StatCard";
import {
  ChartLegend,
  MovementChart,
} from "@/components/dashboard/MovementChart";
import {
  RecentList,
  RecentTable,
} from "@/components/dashboard/RecentTransactions";
import { LowStockAlerts } from "@/components/dashboard/LowStockAlerts";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { TopProducts } from "@/components/dashboard/TopProducts";
import { useStore } from "@/lib/store";
import { dailySeries, periodTotals, topProducts } from "@/lib/stats";
import { pctChange } from "@/lib/utils";

export default function DashboardPage() {
  const { db } = useStore();
  const { products, transactions, settings } = db;
  const [days, setDays] = useState(7);

  const low = products.filter((p) => p.stock <= p.threshold);
  const inT = periodTotals(transactions, "IN", 30);
  const outT = periodTotals(transactions, "OUT", 30);
  const series = useMemo(
    () => dailySeries(transactions, days),
    [transactions, days]
  );
  const top = useMemo(
    () => topProducts(transactions, products),
    [transactions, products]
  );
  const units = products.reduce((s, p) => s + p.stock, 0);
  const h = new Date().getHours();
  const greet =
    h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";

  return (
    <Guard feature="dashboard">
      <div className="mb-5">
        <p className="text-sm text-slate-600">{greet},</p>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          {settings.adminName}
          <Hand size={26} className="text-amber-400" />
        </h1>
        <p className="text-sm text-slate-500">
          Here&apos;s what&apos;s happening with your inventory today.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard
              tone="blue"
              icon={<Boxes size={30} />}
              label="Total Products"
              value={products.length}
              footer={
                <span>
                  <b className="text-emerald-600">{units.toLocaleString()}</b>{" "}
                  units in stock
                </span>
              }
            />
            <StatCard
              tone="green"
              icon={<ArrowUpRight size={32} />}
              label="Total Stock In"
              value={inT.cur.toLocaleString()}
              footer={<Delta pct={pctChange(inT.cur, inT.prev)} />}
            />
            <StatCard
              tone="orange"
              icon={<ArrowRightCircle size={30} />}
              label="Total Stock Out"
              value={outT.cur.toLocaleString()}
              footer={<Delta pct={pctChange(outT.cur, outT.prev)} />}
            />
            <StatCard
              tone="purple"
              icon={<AlertTriangle size={30} />}
              label="Low Stock Items"
              value={low.length}
              footer={
                <Link
                  href="/products?filter=low"
                  className="flex items-center gap-1 font-semibold text-brand"
                >
                  View details <ArrowRight size={12} />
                </Link>
              }
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <GlassCard className="lg:col-span-3">
              <CardHeader
                icon={<LineChart size={18} />}
                title="Stock Movement"
                action={
                  <label className="neu-sm flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs">
                    <CalendarDays size={14} />
                    <select
                      value={days}
                      onChange={(e) => setDays(+e.target.value)}
                      className="bg-transparent outline-none"
                    >
                      <option value={7}>Last 7 days</option>
                      <option value={14}>Last 14 days</option>
                      <option value={30}>Last 30 days</option>
                    </select>
                  </label>
                }
              />
              <ChartLegend />
              <MovementChart data={series} />
            </GlassCard>
            <div className="lg:col-span-2">
              <RecentList tx={transactions} />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <LowStockAlerts items={low} />
            </div>
            <div className="min-w-0 lg:col-span-3">
              <RecentTable tx={transactions} currency={settings.currency} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <QuickActions />
          <TopProducts items={top} />
        </div>
      </div>
    </Guard>
  );
}