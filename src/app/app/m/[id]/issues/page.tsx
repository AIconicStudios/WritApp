"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { IssueDetail } from "@/components/ws/IssueDetail";
import { cx, Empty, ErrorBox, KindBadge, Loading, Modal, SeverityBadge, Spinner, useToast } from "@/components/ui";

const STAGES = [["", "All stages"], ["proofread", "Proofreading"], ["copy", "Copy editing"], ["line", "Line editing"], ["developmental", "Developmental"], ["continuity", "Continuity"]];

function Issues() {
  const { id, data, reload } = useWS();
  const sp = useSearchParams();
  const { toast, node } = useToast();
  const [f, setF] = useState({ stage: sp.get("stage") ?? "", severity: sp.get("severity") ?? "", status: "open", objective: "", chapter: sp.get("chapter") ?? "", source: "", q: "" });
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any);
    q.set("limit", "100");
    q.set("offset", String(page * 100));
    try {
      setRes(await api(`/api/manuscripts/${id}/issues?${q}`));
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [id, f, page]);
  useEffect(() => {
    load();
  }, [load]);
  async function bulk(action: "accept" | "reject") {
    setBusy(true);
    try {
      const r = await api(`/api/manuscripts/${id}/issues/bulk`, { body: { ids: [...sel], action } });
      toast(`${r.ok} ${action === "accept" ? "accepted" : "rejected"}${r.failed.length ? ` · ${r.failed.length} could not be applied automatically (the text had changed)` : ""}.`);
      setSel(new Set());
      load();
      reload();
    } catch (e: any) {
      toast(e.message, "err");
    }
    setBusy(false);
  }
  if (!data) return <Loading />;
  const chapters = data.chapters;
  return (
    <div>
      {node}
      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-7">
        <select className="input py-1.5 text-sm" value={f.stage} onChange={(e) => { setPage(0); setF({ ...f, stage: e.target.value }); }}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="input py-1.5 text-sm" value={f.severity} onChange={(e) => { setPage(0); setF({ ...f, severity: e.target.value }); }}><option value="">All severities</option><option value="critical">Critical</option><option value="major">Major</option><option value="moderate">Moderate</option><option value="minor">Minor</option></select>
        <select className="input py-1.5 text-sm" value={f.objective} onChange={(e) => { setPage(0); setF({ ...f, objective: e.target.value }); }}><option value="">Errors & recommendations</option><option value="1">Objective errors only</option><option value="0">Recommendations only</option></select>
        <select className="input py-1.5 text-sm" value={f.status} onChange={(e) => { setPage(0); setF({ ...f, status: e.target.value }); }}><option value="open">Open</option><option value="accepted">Accepted</option><option value="modified">Modified</option><option value="rejected">Rejected</option><option value="stale">Stale</option><option value="all">All statuses</option></select>
        <select className="input py-1.5 text-sm" value={f.chapter} onChange={(e) => { setPage(0); setF({ ...f, chapter: e.target.value }); }}><option value="">All chapters</option>{chapters.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        <select className="input py-1.5 text-sm" value={f.source} onChange={(e) => { setPage(0); setF({ ...f, source: e.target.value }); }}><option value="">AI & rules</option><option value="ai">AI editor</option><option value="rule">Built-in rules</option></select>
        <input className="input py-1.5 text-sm" placeholder="Search…" value={f.q} onChange={(e) => { setPage(0); setF({ ...f, q: e.target.value }); }} />
      </div>
      <ErrorBox error={err} />
      {!res ? <Loading /> : res.total === 0 ? (
        <Empty title="No findings match">{data.report ? "Try changing the filters." : <>Run an analysis from the <Link className="underline" href={`/app/m/${id}`}>Overview</Link>.</>}</Empty>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-navy-500">
            <span>{res.total.toLocaleString()} findings{sel.size > 0 && ` · ${sel.size} selected`}</span>
            {sel.size > 0 && (
              <div className="flex gap-2">
                <button className="btn-primary btn-sm" disabled={busy} onClick={() => bulk("accept")}>{busy && <Spinner className="h-3 w-3" />} Accept selected suggestions</button>
                <button className="btn-outline btn-sm" disabled={busy} onClick={() => bulk("reject")}>Reject selected</button>
              </div>
            )}
          </div>
          <div className="card divide-y divide-navy-50">
            {res.issues.map((i: any) => (
              <div key={i.id} className="flex gap-3 p-3 hover:bg-navy-50/40">
                <input type="checkbox" className="mt-1.5" checked={sel.has(i.id)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(i.id) : s.delete(i.id); setSel(s); }} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(i)}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge s={i.severity} /><KindBadge objective={i.objective} />
                    <span className="text-sm font-medium text-navy-900">{i.category}</span>
                    <span className="text-xs text-navy-400">{i.chapter_title ?? "Whole manuscript"}{i.paragraph_idx != null && ` · ¶${i.paragraph_idx + 1}`}</span>
                    {i.status !== "open" && <span className="chip border-navy-200 capitalize text-navy-600">{i.status}</span>}
                  </div>
                  {i.original_text && <div className="mt-1 line-clamp-1 font-book text-sm italic text-navy-700">“{i.original_text}”{i.suggestion ? <span className="not-italic text-emerald-700"> → {i.suggestion}</span> : null}</div>}
                  <div className="line-clamp-1 text-xs text-navy-500">{i.explanation}</div>
                </button>
                {i.chapter_id && <Link className="btn-ghost btn-sm self-start" href={`/app/m/${id}/editor?chapter=${i.chapter_id}&issue=${i.id}`}>View in text</Link>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button className="btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Previous</button>
            <span className="text-xs text-navy-400">Page {page + 1} of {Math.max(1, Math.ceil(res.total / 100))}</span>
            <button className="btn-outline btn-sm" disabled={(page + 1) * 100 >= res.total} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Finding">
        {open && <IssueDetail msId={id} issue={open} onDone={() => { setOpen(null); load(); reload(); toast("Updated."); }} />}
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Issues /></Suspense>;
}
