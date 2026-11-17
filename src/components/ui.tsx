"use client";
import { MOBILE } from "@/lib/client/href";
import React, { useEffect, useState } from "react";
import Link from "next/link";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-label="Loading" />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-10 text-sm text-navy-500">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {error}
      {onRetry && (
        <button className="ml-3 underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "info", className }: { children: React.ReactNode; tone?: "info" | "warn" | "success" | "gold"; className?: string }) {
  const t = { info: "border-navy-200 bg-navy-50 text-navy-800", warn: "border-amber-200 bg-amber-50 text-amber-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900", gold: "border-gold-200 bg-gold-50 text-navy-900" }[tone];
  return <div className={cx("rounded-lg border p-3 text-sm leading-relaxed", t, className)}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 h-px w-10 bg-gold-400" />
      <h3 className="h-display text-2xl">{title}</h3>
      {children && <div className="mt-2 max-w-lg text-sm text-navy-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const SEV_STYLE: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  major: "border-orange-200 bg-orange-50 text-orange-800",
  moderate: "border-gold-200 bg-gold-50 text-gold-700",
  minor: "border-navy-200 bg-navy-50 text-navy-600",
};

export function SeverityBadge({ s }: { s: string }) {
  return <span className={cx("chip capitalize", SEV_STYLE[s] ?? SEV_STYLE.minor)}>{s}</span>;
}

export function KindBadge({ objective }: { objective: boolean | number }) {
  return objective ? <span className="chip border-navy-300 bg-white text-navy-800">Objective error</span> : <span className="chip border-gold-200 bg-white text-gold-700">Recommendation</span>;
}

export function scoreColor(s: number | null | undefined) {
  if (s == null) return "#c4d0e4";
  return s >= 80 ? "#2f7a4a" : s >= 65 ? "#c4933a" : s >= 50 ? "#c2410c" : "#b91c1c";
}

export function ScoreRing({ score, size = 88, label }: { score: number | null | undefined; size?: number; label?: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3e9f3" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(score)} strokeWidth={6} strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" className="fill-navy-950 font-serif" style={{ fontSize: size * 0.3, fontWeight: 600 }}>
          {score ?? "—"}
        </text>
      </svg>
      {label && <div className="mt-1 text-center text-[11px] font-medium uppercase tracking-wider text-navy-500">{label}</div>}
    </div>
  );
}

export function ScoreBar({ score }: { score: number | null | undefined }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
      <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, background: scoreColor(score) }} />
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-navy-100">
      <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-700" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/40 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className={cx("card w-full p-0", wide ? "max-w-4xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3">
          <h3 className="h-display text-xl">{title}</h3>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="h-display text-3xl sm:text-4xl">{title}</h1>
        {children && <div className="mt-1 max-w-3xl text-sm text-navy-500">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, actions, className }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cx("card p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="h-display text-xl">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function List({ items, empty = "None identified." }: { items?: (string | null | undefined)[]; empty?: string }) {
  const it = (items ?? []).filter(Boolean) as string[];
  if (!it.length) return <p className="text-sm italic text-navy-400">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm text-navy-800">
      {it.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1 w-1 flex-none rounded-full bg-gold-500" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

export function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  const notEst = typeof v === "string" && /^not established/i.test(v);
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-navy-50 py-2 text-sm sm:grid-cols-[180px_1fr] sm:gap-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">{k}</div>
      <div className={cx(notEst ? "italic text-navy-400" : "text-navy-900")}>{v || <span className="italic text-navy-300">—</span>}</div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className={cx("fixed bottom-5 right-5 z-[60] max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg", msg.tone === "ok" ? "bg-navy-900 text-white" : "bg-red-700 text-white")}>{msg.text}</div>
  ) : null;
  return { toast: (text: string, tone: "ok" | "err" = "ok") => setMsg({ text, tone }), node };
}

export function AINeeded({ feature }: { feature: string }) {
  return (
    <Notice tone="gold">
      <strong>{feature}</strong> needs an AI model to read your story. {MOBILE ? <>On your phone the easiest free option is a Google Gemini free-tier key (or Groq / OpenRouter). </> : null}Cashless Edit works with free options — a local model through{" "}
      <a className="underline" href="https://ollama.com" target="_blank" rel="noreferrer">
        Ollama
      </a>{" "}
      (free and unlimited, nothing leaves your computer) or free-tier APIs.{" "}
      <Link href="/app/settings" className="font-medium underline">
        Connect one in Settings
      </Link>
      .
    </Notice>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="scrollbar-thin -mx-1 mb-4 flex overflow-x-auto border-b border-navy-100">
      {tabs.map((t) => (
        <button key={t.id} className={cx("tab", value === t.id && "tab-active")} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-navy-50 px-1.5 text-[10px] text-navy-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
