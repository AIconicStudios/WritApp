"use client";
import { mhref, MOBILE } from "@/lib/client/href";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { ManuscriptCard } from "@/components/ManuscriptCard";
import { Empty, ErrorBox, Loading, Notice, PageHeader } from "@/components/ui";

export default function Dashboard() {
  const [ms, setMs] = useState<any[] | null>(null);
  const [ai, setAi] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api("/api/manuscripts").then((r) => setMs(r.manuscripts)).catch((e) => setErr(e.message));
    api("/api/settings/ai").then((r) => setAi(r.settings)).catch(() => {});
  }, []);
  if (err) return <div className="p-8"><ErrorBox error={err} /></div>;
  if (!ms) return <Loading />;
  const words = ms.reduce((n, m) => n + m.word_count, 0);
  const open = ms.reduce((n, m) => n + m.open_issues, 0);
  const scored = ms.filter((m) => m.overall_score != null);
  const avg = scored.length ? Math.round(scored.reduce((n, m) => n + m.overall_score, 0) / scored.length) : null;
  const processing = ms.filter((m) => ["processing", "queued"].includes(m.status));
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHeader eyebrow="Dashboard" title="Your editorial desk" actions={<Link href="/app/new" className="btn-gold">+ New Manuscript</Link>}>
        Upload a manuscript, choose an editing mode, and work through the findings chapter by chapter.
      </PageHeader>
      {ai && ai.provider === "builtin" && (
        <Notice tone="gold" className="mb-6">
          <strong>Built-in engine active.</strong> Proofreading, copy-edit and line-edit rules, spelling, continuity of names/ages/descriptions and the publication audit work now, free and offline. To unlock developmental editing, Story Intelligence and the Creative Companion, <Link href="/app/settings" className="font-medium underline">connect a free AI model</Link>{MOBILE ? " — a free Google Gemini key takes two minutes to set up on your phone." : " (Ollama runs locally with no limits)."}
        </Notice>
      )}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Manuscripts", ms.length.toLocaleString()], ["Words under edit", words.toLocaleString()], ["Open findings", open.toLocaleString()], ["Average score", avg == null ? "—" : `${avg}/100`]].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">{k}</div>
            <div className="mt-1 font-serif text-3xl font-semibold text-navy-950">{v}</div>
          </div>
        ))}
      </div>
      {processing.length > 0 && (
        <div className="mb-6 space-y-2">
          {processing.map((m) => (
            <Link key={m.id} href={mhref(m.id)} className="card flex items-center justify-between gap-3 border-gold-200 bg-gold-50/40 p-3 text-sm">
              <span><strong>{m.title}</strong> is being analysed…</span>
              <span className="text-gold-700">{Math.round((m.job_progress ?? 0) * 100)}%</span>
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h-display text-2xl">Recent projects</h2>
            <Link href="/app/manuscripts" className="text-sm text-navy-500 hover:text-navy-900">All manuscripts →</Link>
          </div>
          {ms.length === 0 ? (
            <Empty title="No manuscripts yet" action={<Link href="/app/new" className="btn-gold">Upload your first manuscript</Link>}>
              Upload a DOCX, PDF, TXT, Markdown, RTF, ODT or EPUB file. A sample novel is included in the project's <code>samples/</code> folder if you want to try the workflow first.
            </Empty>
          ) : (
            <div className="space-y-3">{ms.slice(0, 6).map((m) => <ManuscriptCard key={m.id} m={m} />)}</div>
          )}
        </div>
        <div className="space-y-4">
          <h2 className="h-display text-2xl">Workspace</h2>
          {[
            ["/app/reports", "Editing Reports", "Scores, verdicts and findings for every manuscript."],
            ["/app/publication", "Publication Readiness", "KDP, paperback, hardcover and submission checks."],
            ["/app/revisions", "Saved Revisions", "Every accepted change, with one-click restore."],
            ["/app/exports", "Exported Documents", "DOCX, PDF and EPUB files you have generated."],
            ["/app/settings", "AI Provider", ai ? (ai.provider === "builtin" ? "Built-in engine (no AI)" : `${ai.provider === "ollama" ? "Ollama" : "OpenAI-compatible"} · ${ai.model}`) : "…"],
          ].map(([h, t, d]) => (
            <Link key={h} href={h} className="card block p-4 transition hover:border-gold-300">
              <div className="font-medium text-navy-900">{t}</div>
              <div className="text-sm text-navy-500">{d}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
