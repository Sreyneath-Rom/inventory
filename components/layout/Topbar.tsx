"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLES, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { db, updateSettings } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const low = db.products.filter((p) => p.stock <= p.threshold).length;
  const { adminName, currentRole } = db.settings;

  return (
    <header className="glass relative z-20 flex items-center gap-3 rounded-3xl px-4 py-3">
      <button onClick={onMenu} className="neu-sm grid h-10 w-10 place-items-center rounded-xl lg:hidden"><Menu size={18} /></button>
      <form
        className="neu-inset flex flex-1 items-center gap-2 rounded-2xl px-4 py-2.5"
        onSubmit={(e) => { e.preventDefault(); router.push(`/products?q=${encodeURIComponent(q)}`); }}
      >
        <Search size={16} className="text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, code, or category..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
      </form>

      <Link href="/products?filter=low" className="neu-sm relative grid h-10 w-10 place-items-center rounded-full" title="Low stock">
        <Bell size={18} />
        {low > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{low}</span>}
      </Link>

      <div className="relative">
        <button onClick={() => setMenu(!menu)} className="flex items-center gap-3">
          <span className="neu-sm grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-sky-200 to-blue-400 text-sm font-bold text-white">
            {adminName.slice(0, 1)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold">{adminName}</span>
            <span className="block text-xs text-slate-500">{currentRole}</span>
          </span>
          <ChevronDown size={16} className="text-slate-500" />
        </button>
        {menu && (
          <div className="glass absolute right-0 top-14 w-52 rounded-2xl p-2">
            <p className="px-3 py-1.5 text-xs font-semibold text-slate-500">Switch role (demo)</p>
            {ROLES.map((r: Role) => (
              <button key={r} onClick={() => { updateSettings({ currentRole: r }); setMenu(false); router.push("/"); }}
                className={cn("w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/60", r === currentRole && "bg-white/70 font-semibold")}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}