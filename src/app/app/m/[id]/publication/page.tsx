"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { cx, Empty, Loading, Notice, ScoreRing, Section, Spinner, useToast } from "@/components/ui";

const ST: Record<string, string> = { pass: "bg-emerald-600", warn: "bg-gold-500", fail: "bg-red-600", info: "bg-navy-300" };
const TG: Record<string, string> = { ready: "border-emerald-200 bg-emerald-50 text-emerald-800", needs_work: "border-gold-200 bg-gold-50 text-gold-800", not_ready: "border-red-200 bg-red-50 text-red-800" };

export default function Publication() {
  const { id, data, reload } = useWS();
  const { toast, node } = useToast();
  const [a, setA] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/manuscripts/${id}/analysis/publication`).then((r) => setA(r.data)); }, [id, data?.job?.status]);
  if (a === undefined || !data) return <Loading />;
  const running = data.job && ["queued", "running"].includes(data.job.status);
  async function runAudit() {
    setBusy(true);
    try { await api(`/api/manuscripts/${id}/jobs`, { body: { mode: "audit", force: true } }); await reload(); toast("Publication audit started."); } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  }
  if (!a) return <Empty title="No publication audit yet" action={<button className="btn-gold" disabled={busy || running} onClick={runAudit}>{busy && <Spinner />} Run Publication Audit</button>}>Checks completeness, chapter organisation, formatting, front and back matter, and readiness for KDP, paperback, hardcover and submission.</Empty>;
  const areas = [...new Set(a.checks.map((c: any) => c.area))] as string[];
  return (
    <div className="space-y-6">
      {node}
      <div className="card flex flex-col gap-5 p-5 md:flex-row md:items-center">
        <ScoreRing score={a.score} size={96} label="Readiness" />
        <div className="flex-1"><h2 className="h-display text-2xl">Publication readiness</h2><p className="mt-1 text-sm text-navy-600">{a.disclaimer}</p></div>
        <div className="flex flex-col gap-2"><button className="btn-outline btn-sm" disabled={busy || running} onClick={runAudit}>{busy && <Spinner className="h-3 w-3" />} Re-run audit</button><Link className="btn-gold btn-sm" href={`/app/m/${id}/exports`}>Prepare files</Link></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {a.targets.map((t: any) => (
          <div key={t.id} className={cx("rounded-xl border p-4", TG[t.status])}>
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{t.status.replace("_", " ")}</div>
            <div className="font-serif text-lg font-semibold">{t.name}</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{t.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {areas.map((area) => (
          <Section key={area} title={area}>
            <ul className="space-y-2.5">
              {a.checks.filter((c: any) => c.area === area).map((c: any) => (
                <li key={c.id} className="flex gap-3 text-sm">
                  <span className={cx("mt-1.5 h-2.5 w-2.5 flex-none rounded-full", ST[c.status])} title={c.status} />
                  <span><span className="font-medium text-navy-900">{c.title}</span>{c.detail && <span className="block text-navy-500">{c.detail}</span>}
                    {c.refs?.map((r: any, i: number) => <Link key={i} href={`/app/m/${id}/editor?chapter=${r.chapterId}`} className="mr-2 text-xs underline">{r.label}</Link>)}</span>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>
      <Section title="Estimated print length">
        <div className="grid grid-cols-3 gap-3">{a.pageEstimates.map((p: any) => <div key={p.trim} className="rounded-md bg-navy-50 p-3 text-center"><div className="text-xs text-navy-500">{p.trim}</div><div className="font-serif text-2xl font-semibold">{p.pages}</div><div className="text-[10px] uppercase tracking-wider text-navy-400">pages</div></div>)}</div>
        {a.genreRange && <p className="mt-3 text-sm text-navy-600">Typical length for {a.genreRange.genre}: {a.genreRange.min.toLocaleString()}–{a.genreRange.max.toLocaleString()} words. This manuscript: {a.wordCount.toLocaleString()}.</p>}
      </Section>
      <Notice>No tool can guarantee that a manuscript will be accepted by an agent, publisher or publishing platform. Use this audit as a technical checklist alongside your own judgement.</Notice>
    </div>
  );
}
