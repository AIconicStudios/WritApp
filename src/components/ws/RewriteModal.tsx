"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { countWords } from "@/lib/text";
import { ErrorBox, Modal, Notice, Spinner, Tabs, cx } from "@/components/ui";
import { DiffView, SideBySide } from "./Diff";

export const ACTIONS: [string, string][] = [
  ["improve", "Improve the writing"],
  ["professional", "More professional"],
  ["engaging", "More engaging"],
  ["emotional", "Deepen emotion"],
  ["dialogue", "Strengthen dialogue"],
  ["description", "Improve descriptions"],
  ["concise", "Remove unnecessary words"],
  ["readability", "Improve readability"],
  ["natural", "More natural"],
  ["flow", "Improve narrative flow"],
  ["voice", "Light polish, preserve my voice"],
];

export type RewriteTarget = { kind: "selection"; text: string; paragraphId: string; chapterId: string } | { kind: "paragraphs"; paragraphs: { id: string; text: string }[]; chapterId: string; label: string };

/**
 * Rewrite tool. Shows original and revised side by side; nothing changes until the author clicks Apply.
 * Long ranges (e.g. a whole chapter) are rewritten in sections so each request stays reviewable.
 */
export function RewriteModal({ msId, target, onClose, onApplied, aiEnabled }: { msId: string; target: RewriteTarget | null; onClose: () => void; onApplied: () => void; aiEnabled: boolean }) {
  const [action, setAction] = useState("improve");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ revised: string; explanation: string; changes: string[] } | null>(null);
  const [edited, setEdited] = useState("");
  const [view, setView] = useState<"side" | "diff" | "edit">("side");
  if (!target) return null;
  const original = target.kind === "selection" ? target.text : target.paragraphs.map((p) => p.text).join("\n\n");
  const words = countWords(original);

  async function run() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      if (target!.kind === "selection" || words <= 1200) {
        const r = await api(`/api/manuscripts/${msId}/rewrite`, { body: { text: original, action, instructions: (instructions + (target!.kind === "paragraphs" ? " Keep the same number of paragraphs, separated by blank lines." : "")).trim(), paragraphId: target!.kind === "selection" ? target!.paragraphId : target!.paragraphs[0].id, chapterId: target!.chapterId } });
        setResult(r);
        setEdited(r.revised);
      } else {
        // Section-by-section for long ranges.
        const paras = target!.paragraphs;
        const chunks: { id: string; text: string }[][] = [];
        let cur: { id: string; text: string }[] = [];
        let w = 0;
        for (const p of paras) {
          const pw = countWords(p.text);
          if (cur.length && w + pw > 900) {
            chunks.push(cur);
            cur = [];
            w = 0;
          }
          cur.push(p);
          w += pw;
        }
        if (cur.length) chunks.push(cur);
        const outs: string[] = [];
        const expl: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          setProg(`Section ${i + 1} of ${chunks.length}…`);
          const r = await api(`/api/manuscripts/${msId}/rewrite`, { body: { text: chunks[i].map((p) => p.text).join("\n\n"), action, instructions: (instructions + " Keep the same number of paragraphs, separated by blank lines.").trim(), paragraphId: chunks[i][0].id, chapterId: target!.chapterId } });
          outs.push(r.revised);
          expl.push(r.explanation);
        }
        const revised = outs.join("\n\n");
        setResult({ revised, explanation: expl.join(" "), changes: [] });
        setEdited(revised);
      }
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
    setProg("");
  }

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      if (target!.kind === "selection") {
        const p = await api(`/api/manuscripts/${msId}/paragraphs/${target!.paragraphId}`);
        const cur: string = p.paragraph.current_text;
        const at = cur.indexOf(target!.text);
        if (at < 0) throw new Error("The paragraph changed since you selected this text. Select it again.");
        const next = cur.slice(0, at) + edited.replace(/\s*\n\s*/g, " ").trim() + cur.slice(at + target!.text.length);
        await api(`/api/manuscripts/${msId}/paragraphs/${target!.paragraphId}`, { method: "PATCH", body: { text: next, source: "rewrite", note: `Rewrite: ${ACTIONS.find((a) => a[0] === action)?.[1]}` } });
      } else {
        await api(`/api/manuscripts/${msId}/paragraphs/apply`, { body: { paragraphIds: target!.paragraphs.map((p) => p.id), texts: edited.split(/\n\s*\n/), note: `Rewrite: ${ACTIONS.find((a) => a[0] === action)?.[1]}` } });
      }
      onApplied();
      close();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }
  function close() {
    setResult(null);
    setErr(null);
    setInstructions("");
    onClose();
  }

  const revCount = edited.split(/\n\s*\n/).filter((x) => x.trim()).length;
  return (
    <Modal open onClose={close} title={target.kind === "selection" ? "Rewrite selection" : `Rewrite ${target.label}`} wide>
      {!aiEnabled ? (
        <Notice tone="gold">Rewriting needs an AI model. Connect a free one in Settings → AI Provider.</Notice>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.map(([k, l]) => (
              <button key={k} onClick={() => setAction(k)} className={cx("rounded-full border px-3 py-1 text-xs", action === k ? "border-gold-400 bg-gold-100 text-navy-950" : "border-navy-200 text-navy-600 hover:border-navy-400")}>{l}</button>
            ))}
          </div>
          <input className="input" placeholder="Optional instructions (e.g. “keep it under 100 words”, “more tension”, “Mara should sound defiant”)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={run} disabled={busy}>{busy && !result && <Spinner />} {result ? "Generate again" : "Generate revision"}</button>
            <span className="text-xs text-navy-400">{words.toLocaleString()} words selected{prog && ` · ${prog}`}</span>
          </div>
          <ErrorBox error={err} />
          {!result && <SideBySide a={original} b="(The revision will appear here. Your manuscript is not changed until you apply it.)" />}
          {result && (
            <>
              <Tabs tabs={[{ id: "side", label: "Side by side" }, { id: "diff", label: "Changes" }, { id: "edit", label: "Edit before applying" }]} value={view} onChange={setView} />
              {view === "side" && <SideBySide a={original} b={edited} />}
              {view === "diff" && <div className="rounded-lg border border-navy-100 p-4"><DiffView a={original} b={edited} /></div>}
              {view === "edit" && <textarea className="input min-h-[260px] font-book text-[15px] leading-relaxed" value={edited} onChange={(e) => setEdited(e.target.value)} />}
              <div className="rounded-lg bg-navy-50 p-3 text-sm text-navy-700"><strong>What changed:</strong> {result.explanation}{result.changes?.length > 0 && <ul className="mt-1 list-disc pl-5">{result.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}</div>
              {target.kind === "paragraphs" && revCount !== target.paragraphs.length && <Notice tone="warn">The revision has {revCount} paragraphs instead of {target.paragraphs.length}. Applying it will {revCount > target.paragraphs.length ? "insert the extra paragraphs" : "remove the surplus original paragraphs"} — every change is saved in the history and can be restored.</Notice>}
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" onClick={close}>Discard</button>
                <button className="btn-gold" onClick={apply} disabled={busy}>{busy && <Spinner />} Apply to manuscript</button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
