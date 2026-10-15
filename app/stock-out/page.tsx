"use client";
import { Guard } from "@/components/ui/Guard";
import { PageHeader } from "@/components/ui/PageHeader";
import { MovementForm } from "@/components/stock/MovementForm";
import { MovementHistory } from "@/components/stock/MovementHistory";
import { useStore } from "@/lib/store";

export default function StockOutPage() {
  const { db } = useStore();
  return (
    <Guard feature="stockOut">
      <PageHeader title="Stock Out" subtitle="Issue goods — quantity is validated against available stock" />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3"><MovementForm type="OUT" /></div>
        <div className="lg:col-span-2"><MovementHistory tx={db.transactions} type="OUT" /></div>
      </div>
    </Guard>
  );
}