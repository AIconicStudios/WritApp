"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, ago } from "@/lib/client/api";
import { Empty, ErrorBox, Loading, PageHeader, ScoreRing } from "@/components/ui";
import { StatusPill } from "@/components/ManuscriptCard";

export default function Manuscripts() {
  const [ms, setMs] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"updated" | "title" | "score" | "words">("updated");
  useEffect(() => {
    api("/api/manuscripts").then((r) => setMs(r.manuscripts)).catch((e) => setErr(e.message));
  }, []);
  const list = useMemo(() => {
    const l = (ms ?? []).filter((m) => !q || (m.title + " " + (m.author ?? "")).toLowerCase().includes(q.toLowerCase()));
    return [...l].sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "score" ? (b.overall_score ?? -1) - (a.overall_score ?? -1) : sort === "words" ? b.word_count - a.word_count : b.updated_at - a.updated_at));
  }, [ms, q, sort]);
  if (err) return <div className="p-8"><ErrorBox error={err} /></div>;
  if (!ms) return <Loading />;
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHeader eyebrow="Library" title="My Manuscripts" actions={<Link href="/app/new" className="btn-gold">+ New Manuscript</Link>} />
      {ms.length === 0 ? (
        <Empty title="Your library is empty" action={<Link href="/app/new" className="btn-gold">Upload a manuscript</Link>} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <input className="input max-w-xs" placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="updated">Last edited</option><option value="title">Title</option><option value="score">Score</option><option value="words">Word count</option>
            </select>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-navy-100 text-left text-xs uppercase tracking-wider text-navy-400">
                <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Words</th><th className="px-4 py-3">Chapters</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Open findings</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Last edited</th></tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/40">
                    <td className="px-4 py-3"><Link href={`/app/m/${m.id}`} className="font-serif text-base font-semibold text-navy-950 hover:underline">{m.title}</Link><div className="text-xs text-navy-400">{m.author || "—"} · {m.file_name}</div></td>
                    <td className="px-4 py-3 tabular-nums">{m.word_count.toLocaleString()}</td>
                    <td className="px-4 py-3">{m.chapters}</td>
                    <td className="px-4 py-3"><StatusPill status={m.status} /></td>
                    <td className="px-4 py-3">{m.open_issues}</td>
                    <td className="px-4 py-3"><ScoreRing score={m.overall_score} size={40} /></td>
                    <td className="px-4 py-3 text-navy-500">{ago(m.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
