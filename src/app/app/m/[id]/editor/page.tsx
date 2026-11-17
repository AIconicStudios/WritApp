"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { locateQuote } from "@/lib/text";
import { useWS } from "@/components/ws/context";
import { IssueDetail } from "@/components/ws/IssueDetail";
import { RewriteModal, type RewriteTarget } from "@/components/ws/RewriteModal";
import { cx, ErrorBox, Loading, SeverityBadge, Spinner, useToast } from "@/components/ui";

type Para = { id: string; idx: number; style: string; text: string; changed: boolean; inserted: boolean };

function Highlighted({ text, issues, activeId, onPick }: { text: string; issues: any[]; activeId: string | null; onPick: (id: string) => void }) {
  // Compute non-overlapping highlight ranges (most severe wins).
  const rank: Record<string, number> = { critical: 4, major: 3, moderate: 2, minor: 1 };
  const ranges: { s: number; e: number; issue: any }[] = [];
  for (const i of [...issues].sort((a, b) => rank[b.severity] - rank[a.severity])) {
    if (!i.original_text) continue;
    const loc = locateQuote(text, i.original_text);
    if (!loc) continue;
    if (ranges.some((r) => loc.start < r.e && loc.end > r.s)) continue;
    ranges.push({ s: loc.start, e: loc.end, issue: i });
  }
  ranges.sort((a, b) => a.s - b.s);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.s > pos) out.push(text.slice(pos, r.s));
    out.push(
      <mark key={r.issue.id} data-issue={r.issue.id} className={cx("hl", `sev-${r.issue.severity}`, activeId === r.issue.id && "active")} onClick={(e) => { e.stopPropagation(); onPick(r.issue.id); }} title={r.issue.category}>
        {text.slice(r.s, r.e)}
      </mark>,
    );
    pos = r.e;
  }
  out.push(text.slice(pos));
  return <>{out}</>;
}

function ParagraphEditor({ msId, p, onSaved }: { msId: string; p: Para; onSaved: (text: string) => void }) {
  const [v, setV] = useState(p.text);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(p.text);
  const save = useCallback(async (text: string) => {
    if (text.trim() === last.current.trim() || !text.trim()) return;
    setState("saving");
    try {
      await api(`/api/manuscripts/${msId}/paragraphs/${p.id}`, { method: "PATCH", body: { text } });
      last.current = text;
      setState("saved");
      onSaved(text);
    } catch {
      setState("error");
    }
  }, [msId, p.id, onSaved]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return (
    <div>
      <textarea
        autoFocus
        className="input min-h-[120px] font-book text-[16px] leading-relaxed"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          if (t.current) clearTimeout(t.current);
          t.current = setTimeout(() => save(e.target.value), 1200); // autosave
        }}
        onBlur={() => save(v)}
      />
      <div className="mt-1 text-right text-[11px] text-navy-400">{state === "saving" ? "Saving…" : state === "saved" ? "Saved · version recorded" : state === "error" ? <span className="text-red-600">Could not save — retrying on blur</span> : "Autosaves as you type"}</div>
    </div>
  );
}

function Editor() {
  const { id, data, reload } = useWS();
  const sp = useSearchParams();
  const router = useRouter();
  const { toast, node } = useToast();
  const [chapterId, setChapterId] = useState<string | null>(sp.get("chapter"));
  const [ch, setCh] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(sp.get("issue"));
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ stage: string; status: string }>({ stage: "all", status: "open" });
  const [sel, setSel] = useState<{ text: string; paragraphId: string; x: number; y: number; below?: boolean } | null>(null);
  const [rw, setRw] = useState<RewriteTarget | null>(null);
  const [focusPara, setFocusPara] = useState<string | null>(sp.get("para"));
  const textRef = useRef<HTMLDivElement>(null);

  const chapters = data?.chapters ?? [];
  useEffect(() => {
    if (!chapterId && chapters.length) setChapterId((chapters.find((c: any) => c.kind === "chapter") ?? chapters[0]).id);
  }, [chapters, chapterId]);

  const load = useCallback(async () => {
    if (!chapterId) return;
    try {
      setCh(await api(`/api/manuscripts/${id}/chapters/${chapterId}`));
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [id, chapterId]);
  useEffect(() => {
    setCh(null);
    load();
  }, [load]);

  // Scroll to focused paragraph / active issue after load.
  useEffect(() => {
    if (!ch) return;
    const target = focusPara ? document.getElementById("p-" + focusPara) : active ? document.querySelector(`[data-issue="${active}"]`) ?? document.getElementById("p-" + ch.issues.find((i: any) => i.id === active)?.paragraph_id) : null;
    if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch]);

  const issuesByPara = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const i of ch?.issues ?? []) {
      if (i.status !== "open" || !i.paragraph_id) continue;
      if (!m.has(i.paragraph_id)) m.set(i.paragraph_id, []);
      m.get(i.paragraph_id)!.push(i);
    }
    return m;
  }, [ch]);

  const visibleIssues = useMemo(() => (ch?.issues ?? []).filter((i: any) => (filter.stage === "all" || i.stage === filter.stage) && (filter.status === "all" || i.status === filter.status)), [ch, filter]);
  const activeIssue = ch?.issues.find((i: any) => i.id === active) ?? null;
  const idx = chapters.findIndex((c: any) => c.id === chapterId);

  // Touch devices: text is selected with a long-press, so watch selection changes instead of mouse-up.
  useEffect(() => {
    if (!("ontouchstart" in window)) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const h = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => onMouseUp(true), 500);
    };
    document.addEventListener("selectionchange", h);
    return () => document.removeEventListener("selectionchange", h);
  });

  function onMouseUp(touch = false) {
    const s = window.getSelection();
    if (!s || s.isCollapsed) return setSel(null);
    const text = s.toString().trim();
    if (text.length < 3) return setSel(null);
    const node = s.anchorNode?.parentElement?.closest("[data-para]") as HTMLElement | null;
    const endNode = s.focusNode?.parentElement?.closest("[data-para]") as HTMLElement | null;
    if (!node) return;
    const rect = s.getRangeAt(0).getBoundingClientRect();
    if (endNode && endNode !== node) {
      // Multi-paragraph selection → rewrite the range of whole paragraphs.
      const ids = ch.paragraphs.map((p: Para) => p.id);
      const a = ids.indexOf(node.dataset.para), b = ids.indexOf(endNode.dataset.para);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSel({ text: "__range__" + from + ":" + to, paragraphId: node.dataset.para!, x: rect.left + rect.width / 2, y: touch ? rect.bottom : rect.top, below: touch });
      return;
    }
    setSel({ text, paragraphId: node.dataset.para!, x: rect.left + rect.width / 2, y: touch ? rect.bottom : rect.top, below: touch });
  }

  function openRewriteFromSel() {
    if (!sel) return;
    if (sel.text.startsWith("__range__")) {
      const [from, to] = sel.text.slice(9).split(":").map(Number);
      const ps = ch.paragraphs.slice(from, to + 1).filter((p: Para) => p.style !== "scene_break");
      setRw({ kind: "paragraphs", paragraphs: ps.map((p: Para) => ({ id: p.id, text: p.text })), chapterId: ch.chapter.id, label: `${ps.length} paragraphs` });
    } else setRw({ kind: "selection", text: sel.text, paragraphId: sel.paragraphId, chapterId: ch.chapter.id });
    setSel(null);
  }

  if (!data) return <Loading />;
  return (
    <div onMouseDown={() => sel && setSel(null)}>
      {node}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-outline btn-sm" disabled={idx <= 0} onClick={() => { setChapterId(chapters[idx - 1].id); setActive(null); setFocusPara(null); router.replace(mhref(id, `/editor?chapter=${chapters[idx - 1].id}`)); }}>← Previous</button>
        <select className="input w-auto max-w-[60vw] py-1.5" value={chapterId ?? ""} onChange={(e) => { setChapterId(e.target.value); setActive(null); setFocusPara(null); router.replace(mhref(id, `/editor?chapter=${e.target.value}`)); }}>
          {chapters.map((c: any) => <option key={c.id} value={c.id}>{c.title}{c.openIssues ? ` (${c.openIssues})` : ""}</option>)}
        </select>
        <button className="btn-outline btn-sm" disabled={idx < 0 || idx >= chapters.length - 1} onClick={() => { setChapterId(chapters[idx + 1].id); setActive(null); setFocusPara(null); router.replace(mhref(id, `/editor?chapter=${chapters[idx + 1].id}`)); }}>Next →</button>
        {ch && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-outline btn-sm" onClick={() => setRw({ kind: "paragraphs", paragraphs: ch.paragraphs.filter((p: Para) => p.style !== "scene_break").map((p: Para) => ({ id: p.id, text: p.text })), chapterId: ch.chapter.id, label: "the whole chapter" })}>Rewrite chapter…</button>
            <Link className="btn-gold btn-sm" href={mhref(id, `/companion?anchor=${ch.paragraphs[ch.paragraphs.length - 1]?.id ?? ""}`)}>Help Me Continue</Link>
          </div>
        )}
      </div>
      <ErrorBox error={err} />
      {!ch ? <Loading label="Loading chapter…" /> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <article className="card relative px-5 py-8 sm:px-12" ref={textRef} onMouseUp={() => onMouseUp(false)}>
            <div className="mb-8 text-center">
              {ch.chapter.score != null && <div className="mb-2 text-xs text-navy-400">Chapter rating {ch.chapter.score}/100 · {ch.chapter.word_count.toLocaleString()} words</div>}
              <h2 className="font-serif text-3xl font-semibold text-navy-950">{ch.chapter.title}</h2>
              <div className="mx-auto mt-3 h-px w-12 bg-gold-400" />
            </div>
            {ch.paragraphs.length === 0 && <p className="text-center text-sm italic text-navy-400">This section has no text.</p>}
            <div className="font-book text-[17px] leading-[1.85] text-navy-950">
              {ch.paragraphs.map((p: Para, k: number) => {
                const pi = issuesByPara.get(p.id) ?? [];
                if (p.style === "scene_break") return <div key={p.id} className="my-6 text-center tracking-[0.5em] text-navy-400">* * *</div>;
                return (
                  <div key={p.id} id={"p-" + p.id} data-para={p.id} className={cx("group relative -mx-3 rounded px-3 py-0.5", focusPara === p.id && "bg-gold-50", p.changed && "border-l-2 border-emerald-300")}>
                    <span className="absolute -left-7 top-1 hidden select-none text-[10px] text-navy-300 sm:block">{k + 1}</span>
                    {editing === p.id ? (
                      <ParagraphEditor msId={id} p={p} onSaved={(text) => setCh((c: any) => ({ ...c, paragraphs: c.paragraphs.map((x: Para) => (x.id === p.id ? { ...x, text, changed: true } : x)) }))} />
                    ) : (
                      <p className={cx(p.style === "center" || p.style === "heading" ? "text-center" : p.style === "quote" ? "mx-8 italic" : k > 0 && ch.paragraphs[k - 1]?.style !== "scene_break" ? "indent-8" : "")}>
                        <Highlighted text={p.text} issues={pi} activeId={active} onPick={setActive} />
                      </p>
                    )}
                    <div className="absolute -right-2 top-0 hidden gap-1 rounded-md border border-navy-100 bg-white p-0.5 shadow-sm group-hover:flex">
                      <button className="btn-ghost btn-sm px-1.5" title="Edit paragraph" onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? "Done" : "Edit"}</button>
                      <button className="btn-ghost btn-sm px-1.5" title="Rewrite this paragraph" onClick={() => setRw({ kind: "paragraphs", paragraphs: [{ id: p.id, text: p.text }], chapterId: ch.chapter.id, label: "paragraph" })}>Rewrite</button>
                      <Link className="btn-ghost btn-sm px-1.5" title="Help me continue after this paragraph" href={mhref(id, `/companion?anchor=${p.id}`)}>Continue</Link>
                      <Link className="btn-ghost btn-sm px-1.5" title="Version history" href={mhref(id, `/history?para=${p.id}`)}>History</Link>
                    </div>
                  </div>
                );
              })}
            </div>
            {sel && (
              <div className={cx("fixed z-40 flex -translate-x-1/2 rounded-lg bg-navy-950 p-1 shadow-xl", !sel.below && "-translate-y-full")} style={{ left: Math.min(Math.max(sel.x, 150), (typeof window !== "undefined" ? window.innerWidth : 1000) - 150), top: sel.below ? sel.y + 14 : sel.y - 8 }} onMouseDown={(e) => e.stopPropagation()}>
                <button className="rounded px-2.5 py-1 text-xs text-white hover:bg-navy-800" onClick={openRewriteFromSel}>✦ Rewrite</button>
                {!sel.text.startsWith("__range__") && <Link className="rounded px-2.5 py-1 text-xs text-white hover:bg-navy-800" href={mhref(id, `/companion?anchor=${sel.paragraphId}&selection=${encodeURIComponent(sel.text.slice(0, 500))}`)}>Continue from here</Link>}
                {!sel.text.startsWith("__range__") && <Link className="rounded px-2.5 py-1 text-xs text-white hover:bg-navy-800" href={mhref(id, `/companion?tab=whatif&anchor=${sel.paragraphId}`)}>What if…</Link>}
              </div>
            )}
          </article>
          <aside className={cx("lg:sticky lg:top-[132px] lg:h-[calc(100vh-150px)]", activeIssue && "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:h-[62vh] max-lg:rounded-t-2xl max-lg:shadow-2xl")}>
            <div className="card flex h-full flex-col overflow-hidden">
              {activeIssue ? (
                <div className="flex-1 overflow-y-auto p-4">
                  <button className="mb-3 text-xs text-navy-500 hover:text-navy-900" onClick={() => setActive(null)}>← All findings in this chapter</button>
                  <IssueDetail msId={id} issue={{ ...activeIssue, paragraph_idx: ch.paragraphs.find((p: Para) => p.id === activeIssue.paragraph_id)?.idx }} chapterTitle={ch.chapter.title} paragraphText={ch.paragraphs.find((p: Para) => p.id === activeIssue.paragraph_id)?.text} onDone={async (status) => {
                    toast(status === "rejected" ? "Suggestion rejected." : status === "open" ? "Reopened." : "Change applied — the original is kept in the history.");
                    const next = visibleIssues.find((i: any) => i.id !== activeIssue.id && i.status === "open");
                    await load();
                    reload();
                    setActive(status === "open" ? activeIssue.id : next?.id ?? null);
                  }} />
                </div>
              ) : (
                <>
                  <div className="border-b border-navy-100 p-3">
                    <div className="mb-2 flex items-center justify-between"><span className="font-serif text-lg font-semibold">Findings</span><span className="text-xs text-navy-400">{visibleIssues.length} shown</span></div>
                    <div className="flex gap-2">
                      <select className="input py-1 text-xs" value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })}>
                        <option value="all">All stages</option><option value="proofread">Proofreading</option><option value="copy">Copy editing</option><option value="line">Line editing</option><option value="developmental">Developmental</option><option value="continuity">Continuity</option>
                      </select>
                      <select className="input py-1 text-xs" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                        <option value="open">Open</option><option value="accepted">Accepted</option><option value="modified">Modified</option><option value="rejected">Rejected</option><option value="stale">Stale</option><option value="all">All</option>
                      </select>
                    </div>
                  </div>
                  <div className="scrollbar-thin flex-1 overflow-y-auto">
                    {visibleIssues.length === 0 && <p className="p-4 text-sm italic text-navy-400">No findings match. {ch.issues.length === 0 && "Run an analysis to check this chapter."}</p>}
                    {visibleIssues.map((i: any) => (
                      <button key={i.id} className="block w-full border-b border-navy-50 p-3 text-left hover:bg-navy-50/60" onClick={() => { setActive(i.id); setFocusPara(null); const el = document.querySelector(`[data-issue="${i.id}"]`) ?? (i.paragraph_id && document.getElementById("p-" + i.paragraph_id)); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                        <div className="flex items-center gap-1.5"><SeverityBadge s={i.severity} /><span className="truncate text-sm font-medium text-navy-900">{i.category}</span></div>
                        <div className="mt-1 line-clamp-2 text-xs text-navy-500">{i.original_text ? <span className="font-book italic">“{i.original_text}”</span> : i.explanation}</div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-navy-100 p-3 text-[11px] leading-relaxed text-navy-400">Select any text to rewrite it or continue the story from there. Hover a paragraph to edit it directly — every change is versioned and the original upload is never altered.</div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      <RewriteModal msId={id} target={rw} aiEnabled={!!data.ai.enabled} onClose={() => setRw(null)} onApplied={() => { load(); reload(); toast("Revision applied. The previous text is saved in History."); }} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Editor /></Suspense>;
}
