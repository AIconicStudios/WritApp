"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { KV, List, Loading, ScoreRing, SeverityBadge, Spinner, cx } from "@/components/ui";

function ChapterDetail({ msId, chapterId }: { msId: string; chapterId: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!d && !err) api(`/api/manuscripts/${msId}/chapters/${chapterId}`).then(setD).catch((e) => setErr(e.message));
  if (err) return <div className="text-sm text-red-700">{err}</div>;
  if (!d) return <div className="flex items-center gap-2 p-4 text-sm text-navy-500"><Spinner /> Loading chapter…</div>;
  const { chapter, issues } = d;
  const intel = chapter.intel ?? {};
  const notes = chapter.notes ?? {};
  const open = issues.filter((i: any) => i.status === "open");
  const by = (s: string) => open.filter((i: any) => i.stage === s);
  const pIdx = new Map(d.paragraphs.map((p: any) => [p.id, p.idx]));
  const groups: [string, any[]][] = [["Errors identified (proofreading & copy editing)", [...by("proofread"), ...by("copy")]], ["Line editing & weak paragraphs", by("line")], ["Plot, pacing & developmental", by("developmental")], ["Character & continuity", by("continuity")]];
  return (
    <div className="grid gap-6 border-t border-navy-100 p-5 lg:grid-cols-2">
      <div>
        <h4 className="eyebrow mb-2">Chapter intelligence</h4>
        <p className="text-sm leading-relaxed text-navy-800">{intel.summary || <span className="italic text-navy-400">Summary not generated yet (requires an AI reading — Developmental Edit or Full Review).</span>}</p>
        <div className="mt-3">
          {notes.score_explanation && <KV k="Rating rationale" v={notes.score_explanation} />}
          {intel.characters?.length > 0 && <KV k="Characters appearing" v={intel.characters.join(", ")} />}
          {intel.locations?.length > 0 && <KV k="Locations" v={intel.locations.join(", ")} />}
          {intel.pov && <KV k="Point of view" v={intel.pov} />}
          {intel.tone && <KV k="Atmosphere" v={intel.tone} />}
          {notes.pacing && <KV k="Pacing" v={notes.pacing} />}
          {(intel.connection || notes.connection_to_story) && <KV k="Connection to the story" v={intel.connection || notes.connection_to_story} />}
          {chapter.stats && <KV k="Statistics" v={`${chapter.stats.avgSentence} words/sentence · ${chapter.stats.dialoguePct}% dialogue · Flesch ${chapter.stats.fleschEase}`} />}
        </div>
        {intel.events?.length > 0 && <><h5 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-navy-500">Important events</h5><List items={intel.events.map((e: any) => e.title + (e.description ? ` — ${e.description}` : ""))} /></>}
        {intel.conflicts?.length > 0 && <><h5 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-navy-500">Conflicts introduced or developed</h5><List items={intel.conflicts.map((c: any) => c.description)} /></>}
        {(intel.developments?.length > 0 || notes.character_developments?.length > 0) && <><h5 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-navy-500">Character developments</h5><List items={notes.character_developments?.length ? notes.character_developments : intel.developments} /></>}
        {intel.revelations?.length > 0 && <><h5 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-navy-500">Revelations</h5><List items={intel.revelations} /></>}
        {intel.themes?.length > 0 && <><h5 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-navy-500">Themes explored</h5><List items={intel.themes} /></>}
        {intel.unresolved?.length > 0 && <><h5 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-navy-500">Unresolved questions</h5><List items={intel.unresolved} /></>}
        {notes.strengths?.length > 0 && <><h5 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-navy-500">Strengths</h5><List items={notes.strengths} /></>}
      </div>
      <div className="space-y-5">
        {groups.map(([title, list]) => (
          <div key={title}>
            <h4 className="eyebrow mb-2">{title} <span className="text-navy-400">({list.length})</span></h4>
            {list.length === 0 ? <p className="text-sm italic text-navy-400">None open.</p> : (
              <ul className="space-y-1.5">
                {list.slice(0, 12).map((i: any) => (
                  <li key={i.id}>
                    <Link href={mhref(msId, `/editor?chapter=${chapter.id}&issue=${i.id}`)} className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-navy-50">
                      <SeverityBadge s={i.severity} />
                      <span className="min-w-0"><span className="font-medium text-navy-900">{i.category}</span>{i.paragraph_id && <span className="text-xs text-navy-400"> · ¶{(pIdx.get(i.paragraph_id) as number) + 1}</span>}<span className="block truncate text-xs text-navy-500">{i.original_text ? `“${i.original_text}”` : i.explanation}</span></span>
                    </Link>
                  </li>
                ))}
                {list.length > 12 && <li><Link className="text-xs text-navy-500 underline" href={mhref(msId, `/issues?chapter=${chapter.id}`)}>+{list.length - 12} more</Link></li>}
              </ul>
            )}
          </div>
        ))}
        <Link href={mhref(msId, `/editor?chapter=${chapter.id}`)} className="btn-primary btn-sm">Open this chapter in the revision workspace</Link>
      </div>
    </div>
  );
}

export default function Chapters() {
  const { id, data } = useWS();
  const [open, setOpen] = useState<string | null>(typeof window !== "undefined" ? window.location.hash.slice(1) || null : null);
  if (!data) return <Loading />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-500">Every chapter with its rating, findings and chapter intelligence. Click a chapter to expand it; click a finding to jump to the exact passage.</p>
      {data.chapters.map((c: any) => (
        <div key={c.id} id={c.id} className="card overflow-hidden">
          <button className="flex w-full items-center gap-4 p-4 text-left hover:bg-navy-50/40" onClick={() => setOpen(open === c.id ? null : c.id)}>
            {c.kind === "chapter" ? <ScoreRing score={c.score} size={48} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-[10px] uppercase text-navy-400">{c.kind}</span>}
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-lg font-semibold">{c.title}</div>
              <div className="text-xs text-navy-500">{c.kind === "chapter" ? `${c.number != null ? `No. ${c.number} · ` : ""}${c.wordCount.toLocaleString()} words` : c.matterType?.replace(/_/g, " ")} · {c.openIssues} open findings{c.seriousIssues ? ` (${c.seriousIssues} serious)` : ""}</div>
              {c.summary && <div className="mt-1 line-clamp-1 text-sm text-navy-600">{c.summary}</div>}
            </div>
            <span className={cx("text-navy-400 transition", open === c.id && "rotate-180")}>▾</span>
          </button>
          {open === c.id && <ChapterDetail msId={id} chapterId={c.id} />}
        </div>
      ))}
    </div>
  );
}
