"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { ago } from "@/lib/client/api";
import { cx, ScoreRing } from "./ui";

export const STATUS: Record<string, { label: string; cls: string }> = {
  uploaded: { label: "Uploaded", cls: "bg-navy-50 text-navy-600" },
  organized: { label: "Ready to analyse", cls: "bg-navy-50 text-navy-700" },
  queued: { label: "Queued", cls: "bg-gold-50 text-gold-700" },
  processing: { label: "Processing…", cls: "bg-gold-100 text-gold-700" },
  analyzed: { label: "Analysed", cls: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Needs attention", cls: "bg-red-50 text-red-700" },
  paused: { label: "Paused", cls: "bg-amber-50 text-amber-800" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-navy-50 text-navy-600" };
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>{s.label}</span>;
}

export function ManuscriptCard({ m }: { m: any }) {
  return (
    <Link href={mhref(m.id)} className="card group flex items-center gap-4 p-4 transition hover:border-gold-300">
      <div className="flex h-16 w-12 flex-none flex-col justify-between rounded-sm bg-navy-900 p-1.5 shadow-md ring-1 ring-gold-500/40">
        <div className="h-0.5 w-6 bg-gold-400" />
        <div className="line-clamp-3 font-serif text-[7px] leading-tight text-white">{m.title}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif text-lg font-semibold text-navy-950 group-hover:text-navy-700">{m.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-500">
          <span>{m.word_count.toLocaleString()} words</span>
          <span>{m.chapters} chapters</span>
          <StatusPill status={m.status} />
          {m.open_issues > 0 && <span>{m.open_issues} open findings</span>}
          <span>Edited {ago(m.updated_at)}</span>
        </div>
      </div>
      <ScoreRing score={m.overall_score} size={52} />
    </Link>
  );
}
