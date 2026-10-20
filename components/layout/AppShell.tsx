"use client";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen p-3 lg:p-5 lg:pl-74">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="min-w-0">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mt-5">{children}</main>
      </div>
    </div>
  );
}