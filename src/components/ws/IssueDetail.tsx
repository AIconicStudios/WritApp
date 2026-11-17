"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { ErrorBox, KindBadge, SeverityBadge, Spinner } from "@/components/ui";
import { DiffView } from "./Diff";

const STAGE: Record<string, string> = { proofread: "Proofreading", copy: "Copy editing", line: "Line editing", developmental: "Developmental", continuity: "Continuity", publication: "Publication" };

export function IssueDetail({ msId, issue, paragraphText, onDone, chapterTitle }: { msId: string; issue: any; paragraphText?: string; onDone: (status: string) => void; chapterTitle?: string }) {
  const [mod, setMod] = useState(false);
  const [text, setText] = useState(issue.suggestion ?? "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setMod(false);
    setText(issue.suggestion ?? issue.original_text ?? "");
    setErr(null);
  }, [issue.id, issue.suggestion, issue.original_text]);
  async function act(action: string) {
    setBusy(action);
    setErr(null);
    try {
      const r = await api(`/api/manuscripts/${msId}/issues/${issue.id}`, { body: { action, text: action === "modify" ? text : undefined } });
      onDone(r.status);
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy("");
  }
  const canApply = issue.original_text && issue.paragraph_id;
  const revised = issue.revised_text ?? null;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge s={issue.severity} />
        <KindBadge objective={issue.objective} />
        <span className="chip border-navy-100 text-navy-500">{STAGE[issue.stage] ?? issue.stage}</span>
        <span className="chip border-navy-100 text-navy-400">{issue.source === "ai" ? "AI editor" : "Built-in rule"}</span>
        {issue.status !== "open" && <span className="chip border-navy-300 capitalize text-navy-700">{issue.status}</span>}
      </div>
      <div>
        <div className="font-serif text-lg font-semibold text-navy-950">{issue.category}</div>
        <div className="text-xs text-navy-400">{chapterTitle ?? issue.chapter_title ?? "Whole manuscript"}{issue.paragraph_idx != null ? ` · paragraph ${issue.paragraph_idx + 1}` : ""}{issue.confidence != null ? ` · confidence ${Math.round(issue.confidence * 100)}%` : ""}</div>
      </div>
      {issue.original_text && (
        <div>
          <div className="label">Original</div>
          <blockquote className="border-l-2 border-gold-400 pl-3 font-book italic text-navy-800">{issue.original_text}</blockquote>
        </div>
      )}
      <div>
        <div className="label">The problem</div>
        <p className="leading-relaxed text-navy-800">{issue.explanation}</p>
      </div>
      {issue.suggestion != null && issue.suggestion !== "" && (
        <div>
          <div className="label">Suggested correction</div>
          <div className="rounded-md bg-emerald-50 px-3 py-2 font-book text-emerald-900">{issue.suggestion}</div>
        </div>
      )}
      {revised && issue.original_text && (
        <div>
          <div className="label">Suggested revised version</div>
          <div className="rounded-md border border-navy-100 p-2.5"><DiffView a={issue.suggestion ? revised.replace(issue.suggestion, issue.original_text) : issue.original_text} b={revised} /></div>
        </div>
      )}
      {issue.reason && (
        <div>
          <div className="label">{issue.suggestion ? "Why this revision" : "Recommendation"}</div>
          <p className="leading-relaxed text-navy-700">{issue.reason}</p>
        </div>
      )}
      {issue.refs?.length > 0 && (
        <div>
          <div className="label">References in the manuscript</div>
          <ul className="space-y-1.5">
            {issue.refs.map((r: any, i: number) => (
              <li key={i}>
                <Link className="block rounded-md bg-navy-50 px-2.5 py-1.5 text-xs hover:bg-navy-100" href={`/app/m/${msId}/editor?chapter=${r.chapterId}${r.paragraphId ? `&para=${r.paragraphId}` : ""}`}>
                  <span className="font-medium text-navy-700">{r.label}</span>
                  {r.quote && <span className="block font-book italic text-navy-600">“{r.quote}”</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mod && (
        <div>
          <div className="label">Your version (replaces the original text)</div>
          <textarea className="input min-h-[80px] font-book" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      <ErrorBox error={err} />
      {issue.status === "open" || issue.status === "stale" ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {canApply && issue.suggestion != null && !mod && <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => act("accept")}>{busy === "accept" && <Spinner className="h-3 w-3" />} Accept</button>}
          {!canApply || issue.suggestion == null ? <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => act("accept")}>Mark as addressed</button> : null}
          {canApply && !mod && <button className="btn-outline btn-sm" onClick={() => setMod(true)}>Modify</button>}
          {mod && <button className="btn-gold btn-sm" disabled={!!busy} onClick={() => act("modify")}>{busy === "modify" && <Spinner className="h-3 w-3" />} Apply my version</button>}
          {mod && <button className="btn-ghost btn-sm" onClick={() => setMod(false)}>Cancel</button>}
          <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => act("reject")}>Reject</button>
        </div>
      ) : (
        <button className="btn-ghost btn-sm" onClick={() => act("reopen")}>Reopen</button>
      )}
    </div>
  );
}

