"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { Logo } from "@/components/Logo";
import { ErrorBox, Spinner } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/auth/${mode}`, { body: { email, name, password } });
      const next = sp.get("next");
      router.replace(next && next.startsWith("/app") ? next : "/app");
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[44%] flex-col justify-between bg-navy-950 p-10 text-white lg:flex">
        <Logo light />
        <div>
          <p className="font-serif text-3xl leading-snug">“The first draft is just you telling yourself the story.”</p>
          <p className="mt-3 text-sm text-gold-300">— Terry Pratchett</p>
          <p className="mt-10 max-w-sm text-sm leading-relaxed text-navy-300">Cashless Edit helps you turn it into the book you meant to write: honest editorial feedback, a living Story Bible, and a creative partner that knows your characters.</p>
        </div>
        <p className="text-xs text-navy-400">Your manuscripts are private to your account and encrypted at rest.</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="h-display text-4xl">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-navy-500">{mode === "login" ? "Sign in to your editorial workspace." : "Free, with no subscription required."}</p>
          <div className="mt-8 space-y-4">
            {mode === "register" && (
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="pw">Password</label>
              <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
              {mode === "register" && <p className="mt-1 text-xs text-navy-400">At least 8 characters.</p>}
            </div>
            <ErrorBox error={err} />
            <button className="btn-primary w-full py-2.5" disabled={busy}>
              {busy && <Spinner />} {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-navy-500">
            {mode === "login" ? (
              <>New to Cashless Edit? <Link href="/register" className="font-medium text-navy-900 underline">Create an account</Link></>
            ) : (
              <>Already have an account? <Link href="/login" className="font-medium text-navy-900 underline">Sign in</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
