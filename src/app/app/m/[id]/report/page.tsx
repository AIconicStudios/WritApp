"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { cx, Empty, List, Loading, Notice, ScoreBar, ScoreRing, Section } from "@/components/ui";

const LABELS: Record<string, string> = { overall: "Overall manuscript quality", plot: "Plot & story structure", character: "Character development", dialogue: "Dialogue", grammar: "Grammar & mechanics", sentence: "Sentence construction", vocabulary: "Vocabulary", pacing: "Pacing", readability: "Readability", emotional: "Emotional impact", originality: "Originality", consistency: "Narrative consistency", publication: "Professional publication readiness" };
const BASIS: Record<string, [string, string]> = { ai: ["AI editorial judgement", "border-gold-200 text-gold-700"], measured: ["Measured from the text", "border-navy-200 text-navy-600"], combined: ["Combined", "border-navy-200 text-navy-600"], not_assessed: ["Not assessed", "border-navy-100 text-navy-400"] };

export default function Report() {
  const { id, data } = useWS();
  const [r, setR] = useState<any>(undefined);
  useEffect(() => {
    api(`/api/manuscripts/${id}/analysis/report`).then((x) => setR(x.data));
  }, [id, data?.job?.status]);
  if (r === undefined || !data) return <Loading />;
  if (!r) return <Empty title="No report yet" action={<Link className="btn-gold" href={mhref(id)}>Run an analysis</Link>}>The editorial report is generated at the end of every analysis.</Empty>;
  const chapters = data.chapters.filter((c: any) => c.kind === "chapter");
  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-6 bg-navy-950 p-6 text-white md:flex-row md:items-center">
          <div className="self-start rounded-full bg-white p-2 md:self-auto"><ScoreRing score={r.scores.overall?.score} size={110} /></div>
          <div className="flex-1">
            <div className="eyebrow text-gold-300">Editorial verdict</div>
            <p className="mt-2 font-serif text-xl leading-relaxed text-navy-50">{r.verdict}</p>
            <div className="mt-3 text-xs text-navy-300">{r.aiUsed ? `AI reading by ${r.model}` : "Built-in engine only"} · {r.mode} mode · {fmtDate(r.generatedAt)}</div>
          </div>
          <div className="flex flex-col gap-2">
            <Link href={mhref(id, `/exports`)} className="btn-gold btn-sm">Export report (DOCX / PDF)</Link>
            <Link href={mhref(id, `/editor`)} className="btn btn-sm border border-navy-600 text-white hover:bg-navy-800">Work through findings</Link>
          </div>
        </div>
        <p className="px-6 py-3 text-xs text-navy-500">{r.scores.overall?.explanation}</p>
      </div>
      {!r.aiUsed && <Notice tone="gold">Story-level scores (plot, character, dialogue, emotional impact, originality) are marked <em>Not assessed</em> rather than guessed. Connect a free AI model in <Link href="/app/settings" className="underline">Settings</Link> and run a Developmental Edit to complete them.</Notice>}
      <Section title="Scores">
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          {Object.keys(LABELS).filter((k) => k !== "overall").map((k) => {
            const s = r.scores[k];
            if (!s) return null;
            const [bl, bc] = BASIS[s.basis] ?? BASIS.measured;
            return (
              <div key={k}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-navy-900">{LABELS[k]}</span>
                  <span className="flex items-center gap-2"><span className={cx("chip", bc)}>{bl}</span><span className="w-10 text-right font-serif text-xl font-semibold">{s.score ?? "—"}</span></span>
                </div>
                <ScoreBar score={s.score} />
                <p className="mt-1.5 text-xs leading-relaxed text-navy-500">{s.explanation}</p>
              </div>
            );
          })}
        </div>
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Strengths"><List items={r.strengths} /></Section>
        <Section title="Major weaknesses"><List items={r.majorWeaknesses} /></Section>
        <Section title="Minor weaknesses"><List items={r.minorWeaknesses} /></Section>
        <Section title="Critical corrections required"><List items={r.criticalCorrections} empty="None flagged as critical." /></Section>
      </div>
      <Section title="Recommended improvements"><List items={r.recommendations} /></Section>
      {(r.opening || r.ending) && (
        <div className="grid gap-6 md:grid-cols-2">
          {r.opening && <Section title="The opening"><p className="text-sm leading-relaxed text-navy-800">{r.opening}</p></Section>}
          {r.ending && <Section title="The ending"><p className="text-sm leading-relaxed text-navy-800">{r.ending}</p></Section>}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Findings" className="lg:col-span-1">
          <div className="space-y-2 text-sm">
            {Object.entries(r.counts.byStage as Record<string, number>).map(([k, v]) => (
              <Link key={k} href={mhref(id, `/issues?stage=${k}`)} className="flex justify-between rounded px-2 py-1 hover:bg-navy-50"><span className="capitalize">{k === "copy" ? "Copy editing" : k === "line" ? "Line editing" : k === "proofread" ? "Proofreading" : k}</span><span className="font-medium">{v}</span></Link>
            ))}
            <div className="border-t border-navy-100 pt-2 text-xs text-navy-500">{r.counts.objective} objective errors · {r.counts.subjective} editorial recommendations</div>
          </div>
        </Section>
        <Section title="Text statistics" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[["Words", r.metrics.words.toLocaleString()], ["Sentences", r.metrics.sentences.toLocaleString()], ["Avg. sentence", `${r.metrics.avgSentence} words`], ["Long sentences", `${r.metrics.longSentencePct}%`], ["Dialogue", `${r.metrics.dialoguePct}%`], ["Flesch ease", r.metrics.fleschEase], ["Grade level", r.metrics.fkGrade], ["Vocabulary (MATTR)", r.metrics.mattr]].map(([k, v]) => (
              <div key={k as string} className="rounded-md bg-navy-50 p-3"><div className="text-[10px] uppercase tracking-wider text-navy-500">{k}</div><div className="font-serif text-xl font-semibold">{v}</div></div>
            ))}
          </div>
        </Section>
      </div>
      <Section title="Chapter scores">
        <div className="space-y-2">
          {chapters.map((c: any) => (
            <Link key={c.id} href={mhref(id, `/chapters#${c.id}`)} className="grid grid-cols-[1fr_120px_40px] items-center gap-3 rounded px-2 py-1 text-sm hover:bg-navy-50">
              <span className="truncate">{c.title}</span><ScoreBar score={c.score} /><span className="text-right font-medium">{c.score ?? "—"}</span>
            </Link>
          ))}
        </div>
      </Section>
      <Section title="Limitations & honesty notes"><List items={r.limitations} /></Section>
    </div>
  );
}
