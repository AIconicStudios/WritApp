"use client";
import { diffWords } from "diff";

export function DiffView({ a, b }: { a: string; b: string }) {
  const parts = diffWords(a, b);
  return (
    <div className="whitespace-pre-wrap font-book text-[15px] leading-relaxed text-navy-900">
      {parts.map((p, i) => (p.added ? <span key={i} className="diff-ins">{p.value}</span> : p.removed ? <span key={i} className="diff-del">{p.value}</span> : <span key={i}>{p.value}</span>))}
    </div>
  );
}

export function SideBySide({ a, b, labelA = "Original", labelB = "Revised" }: { a: string; b: string; labelA?: string; labelB?: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-navy-100 bg-white p-4">
        <div className="eyebrow mb-2 text-navy-400">{labelA}</div>
        <div className="whitespace-pre-wrap font-book text-[15px] leading-relaxed text-navy-800">{a}</div>
      </div>
      <div className="rounded-lg border border-gold-200 bg-gold-50/30 p-4">
        <div className="eyebrow mb-2">{labelB}</div>
        <div className="whitespace-pre-wrap font-book text-[15px] leading-relaxed text-navy-900">{b}</div>
      </div>
    </div>
  );
}
