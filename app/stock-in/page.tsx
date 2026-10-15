"use client";
import { Guard } from "@/components/ui/Guard";
import { PageHeader } from "@/components/ui/PageHeader";
import { MovementForm } from "@/components/stock/MovementForm";
import { MovementHistory } from "@/components/stock/MovementHistory";
import { useStore } from "@/lib/store";

export default function StockInPage() {
  const { db } = useStore();
  return (
    <Guard feature="stockIn">
      <PageHeader title="Stock In" subtitle="Receive goods and increase inventory" />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3"><MovementForm type="IN" /></div>
        <div className="lg:col-span-2"><MovementHistory tx={db.transactions} type="IN" /></div>
      </div>
    </Guard>
  );
}