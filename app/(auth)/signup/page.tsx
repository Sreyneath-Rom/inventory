// app/(auth)/signup/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxes, UserPlus, Mail, Lock, User, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const signup = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const signupBody = await signup.json().catch(() => null) as { error?: string } | null;
      if (!signup.ok) {
        setErr(signupBody?.error ?? "Could not create account.");
        setBusy(false);
        return;
      }

      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await login.json().catch(() => null) as { error?: string } | null;
      if (!login.ok) {
        setErr(loginBody?.error ?? "Account created, but could not sign in. Please sign in.");
        setBusy(false);
        return;
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not create account.");
      setBusy(false);
      return;
    }

    router.push("/");
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

        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          The first account becomes the administrator.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Full name">
            <div className="neu-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
              <User size={16} className="text-slate-400" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </div>
          </Field>

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

          <Field label="Password" hint="At least 8 characters">
            <div className="neu-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
              <Lock size={16} className="text-slate-400" />
              <input
                type="password"
                className="w-full bg-transparent text-sm outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
          </Field>

          <Field label="Confirm password">
            <div className="neu-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
              <Lock size={16} className="text-slate-400" />
              <input
                type="password"
                className="w-full bg-transparent text-sm outline-none"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
          </Field>

          {err && (
            <p className="rounded-xl bg-red-100/80 px-3 py-2 text-sm text-red-600">{err}</p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            <UserPlus size={16} />
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
          >
            <ArrowLeft size={12} /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}