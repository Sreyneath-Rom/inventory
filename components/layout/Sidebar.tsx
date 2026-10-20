"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  LayoutGrid,
  Package,
  PackageMinus,
  PackagePlus,
  Settings,
  Users,
} from "lucide-react";
import type { Feature } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV: {
  href: string;
  label: string;
  icon: typeof Package;
  feature: Feature;
}[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    feature: "dashboard",
  },
  {
    href: "/stock-in",
    label: "Stock In",
    icon: PackagePlus,
    feature: "stockIn",
  },
  {
    href: "/stock-out",
    label: "Stock Out",
    icon: PackageMinus,
    feature: "stockOut",
  },
  { href: "/products", label: "Products", icon: Package, feature: "products" },
  {
    href: "/categories",
    label: "Categories",
    icon: LayoutGrid,
    feature: "categories",
  },
  {
    href: "/employees",
    label: "Employees",
    icon: Users,
    feature: "employees",
  },
  { href: "/reports", label: "Reports", icon: BarChart3, feature: "reports" },
  { href: "/settings", label: "Settings", icon: Settings, feature: "settings" },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const path = usePathname();
  const { can, db } = useStore();
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "glass fixed bottom-3 left-3 top-3 z-40 flex w-64 flex-col rounded-3xl p-4 transition-transform lg:bottom-5 lg:left-5 lg:top-5",
          open ? "translate-x-0" : "translate-x-[-120%] lg:translate-x-0",
        )}
      >
        <div className="mb-6 flex items-center gap-3 px-1">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Boxes size={22} />
          </span>
          <div className="leading-tight">
            <div className="font-bold">Inventory</div>
            <div className="text-xs text-slate-500">Management System</div>
          </div>
        </div>

        <nav className="space-y-1.5">
          {NAV.filter((n) => can(n.feature)).map(
            ({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                    active
                      ? "bg-linear-to-r from-blue-500 to-sky-400 text-white shadow-[0_8px_18px_rgba(59,130,246,.4),inset_0_1px_0_rgba(255,255,255,.5)]"
                      : "text-slate-600 hover:bg-white/50",
                  )}
                >
                  <Icon size={18} /> {label}
                </Link>
              );
            },
          )}
        </nav>
      </aside>
    </>
  );
}
