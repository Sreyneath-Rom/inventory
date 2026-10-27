// app/(auth)/login/page.tsx
"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Boxes, LogIn, Mail, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) {
        setErr(body?.error ?? "Could not sign in.");
        setBusy(false);
        return;
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not sign in.");
      setBusy(false);
      return;
    }

    router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Boxes size={24} />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold">Inventory</div>
            <div className="text-xs text-slate-500">Management System</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your account to continue.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email">
            <div className="neu-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
              <Mail size={16} className="text-slate-400" />
              <input
                type="email"
                className="w-full bg-transparent text-sm outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
          </Field>

          <Field label="Password">
            <div className="neu-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
              <Lock size={16} className="text-slate-400" />
              <input
                type="password"
                className="w-full bg-transparent text-sm outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </Field>

          {err && (
            <p className="rounded-xl bg-red-100/80 px-3 py-2 text-sm text-red-600">{err}</p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            <LogIn size={16} />
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
          >
            Create one <ArrowRight size={12} />
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}