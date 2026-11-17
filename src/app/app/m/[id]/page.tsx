"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { cx, ErrorBox, Loading, Modal, Notice, Progress, ScoreRing, Section, Spinner, useToast } from "@/components/ui";
import { ModePicker } from "@/components/ModePicker";
import { MODES, type EditMode } from "@/lib/types";

export default function Overview() {
  const { id, data, reload } = useWS();
  const router = useRouter();
  const { toast, node } = useToast();
  const [mode, setMode] = useState<EditMode>("full");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dupMsg, setDupMsg] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [edit, setEdit] = useState(false);
  const [meta, setMeta] = useState<any>({});
  const job = data?.job;
  useEffect(() => {
    api(`/api/manuscripts/${id}/jobs`).then((r) => setJobs(r.jobs)).catch(() => {});
  }, [id, job?.status]);
  if (!data) return <Loading />;
  const ms = data.manuscript;
  const running = job && ["queued", "running"].includes(job.status);
  const resumable = job && ["interrupted", "failed", "paused"].includes(job.status);
  const plan = jobs?.find((j) => j.id === job?.id)?.plan ?? [];
  const chapters = data.chapters.filter((c: any) => c.kind === "chapter");

  async function start(force = false) {
    setBusy(true);
    setErr(null);
    setDupMsg(null);
    try {
      await api(`/api/manuscripts/${id}/jobs`, { body: { mode, force } });
      await reload();
    } catch (e: any) {
      if (/^DUPLICATE:/.test(e.message)) setDupMsg(e.message.replace(/^DUPLICATE:\s*/, ""));
      else setErr(e.message);
    }
    setBusy(false);
  }
  async function act(action: string) {
    try {
      await api(`/api/jobs/${job.id}`, { body: { action } });
      await reload();
    } catch (e: any) {
      toast(e.message, "err");
    }
  }

  return (
    <div className="space-y-6">
      {node}
      {data.warnings?.length > 0 && <Notice tone="warn">{data.warnings.join(" ")}</Notice>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Analysis" className="lg:col-span-2">
          {job ? (
            <div className="mb-5 rounded-lg border border-navy-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-navy-900">{MODES.find((m) => m.id === job.mode)?.name} — <span className={cx(job.status === "completed" ? "text-emerald-700" : job.status === "failed" ? "text-red-700" : "text-gold-700")}>{job.status}</span></div>
                  <div className="text-xs text-navy-500">{job.message} · started {fmtDate(job.started_at ?? job.created_at)}{job.ai_used ? ` · AI: ${data.ai.model}` : " · built-in engine"}</div>
                </div>
                <div className="flex gap-2">
                  {running && <button className="btn-outline btn-sm" onClick={() => act("pause")}>Pause</button>}
                  {running && <button className="btn-ghost btn-sm" onClick={() => act("cancel")}>Cancel</button>}
                  {resumable && <button className="btn-gold btn-sm" onClick={() => act("resume")}>Resume from where it stopped</button>}
                </div>
              </div>
              <div className="mt-3"><Progress value={job.status === "completed" ? 1 : job.progress} /></div>
              {job.error && <ErrorBox error={job.error} />}
              {plan.length > 0 && (
                <ol className="mt-4 grid gap-1.5 sm:grid-cols-2">
                  {plan.map((s: any, i: number) => {
                    const done = job.status === "completed" || i < job.stage_index;
                    const cur = i === job.stage_index && job.status !== "completed";
                    return (
                      <li key={s.id} className={cx("flex items-start gap-2 rounded-md px-2 py-1.5 text-sm", cur && "bg-gold-50")}>
                        <span className={cx("mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold", done ? "bg-emerald-600 text-white" : cur ? "bg-gold-500 text-navy-950" : "bg-navy-100 text-navy-400")}>{done ? "✓" : s.n}</span>
                        <span><span className={cx("font-medium", done || cur ? "text-navy-900" : "text-navy-400")}>{s.name}</span>{cur && running && <Spinner className="ml-2 h-3 w-3 text-gold-600" />}<span className="block text-xs text-navy-400">{s.desc}</span></span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {job.status === "completed" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="btn-primary btn-sm" href={mhref(id, `/report`)}>Open the editorial report</Link>
                  <Link className="btn-outline btn-sm" href={mhref(id, `/editor`)}>Open the revision workspace</Link>
                  <Link className="btn-outline btn-sm" href={mhref(id, `/intelligence`)}>Story Intelligence</Link>
                </div>
              )}
              {job.log?.length > 0 && (
                <details className="mt-3 text-xs text-navy-500">
                  <summary className="cursor-pointer">Processing log ({job.log.length})</summary>
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded bg-navy-50 p-2 font-mono">
                    {job.log.map((l: any, i: number) => <div key={i} className={l.level === "error" ? "text-red-700" : l.level === "warn" ? "text-amber-700" : ""}>{new Date(l.t).toLocaleTimeString()} {l.msg}</div>)}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <Notice className="mb-5">This manuscript has been organised into {chapters.length} chapters and is ready for analysis.</Notice>
          )}
          {!running && (
            <>
              <h3 className="mb-3 font-medium text-navy-900">{job ? "Run another analysis" : "Choose an editing mode"}</h3>
              <ModePicker value={mode} onChange={setMode} aiEnabled={data.ai.enabled} />
              <div className="mt-4 space-y-3">
                <ErrorBox error={err} />
                {dupMsg && <Notice tone="warn">{dupMsg} <button className="ml-1 font-medium underline" onClick={() => start(true)}>Run again anyway</button></Notice>}
                <button className="btn-primary" disabled={busy} onClick={() => start(false)}>{busy && <Spinner />} Start {MODES.find((m) => m.id === mode)?.name}</button>
                <p className="text-xs text-navy-400">Large manuscripts are processed in the background, chapter by chapter. You can close this page; progress is saved and an interrupted analysis resumes where it stopped.</p>
              </div>
            </>
          )}
        </Section>
        <div className="space-y-6">
          <Section title="Manuscript" actions={<button className="btn-ghost btn-sm" onClick={() => { setMeta({ title: ms.title, author: ms.author ?? "", genre: ms.genre ?? "", audience: ms.audience ?? "" }); setEdit(true); }}>Edit</button>}>
            <div className="flex items-center gap-4">
              <ScoreRing score={ms.overall_score} label="Overall" />
              <div className="space-y-0.5 text-sm text-navy-700">
                <div>{ms.author || <span className="text-navy-400">No author set</span>}</div>
                <div>{ms.genre || <span className="text-navy-400">No genre set</span>}</div>
                <div>{ms.word_count.toLocaleString()} words · {chapters.length} chapters</div>
                <div className="text-xs text-navy-400">{ms.file_name} · uploaded {fmtDate(ms.created_at)}</div>
              </div>
            </div>
            {data.report && (
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {(["critical", "major", "moderate", "minor"] as const).map((s) => (
                  <Link key={s} href={mhref(id, `/issues?severity=${s}`)} className="rounded-md bg-navy-50 py-2 hover:bg-navy-100">
                    <div className="font-serif text-xl font-semibold">{data.report.counts[s]}</div>
                    <div className="text-[10px] uppercase tracking-wider text-navy-500">{s}</div>
                  </Link>
                ))}
              </div>
            )}
          </Section>
          <Section title="AI">
            <p className="text-sm text-navy-600">{data.ai.enabled ? <>Connected: <strong>{data.ai.model}</strong> ({data.ai.provider === "ollama" ? "Ollama" : "OpenAI-compatible"}).</> : <>Built-in engine only. Story-level analysis and creative tools are unavailable until you <Link className="underline" href="/app/settings">connect a free model</Link>.</>}</p>
          </Section>
        </div>
      </div>
      <Section title="Chapters" actions={<Link href={mhref(id, `/chapters`)} className="text-sm text-navy-500 hover:text-navy-900">Chapter-by-chapter →</Link>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.chapters.map((c: any) => (
            <Link key={c.id} href={mhref(id, `/editor?chapter=${c.id}`)} className="flex items-center justify-between gap-2 rounded-md border border-navy-50 px-3 py-2 text-sm hover:border-gold-300">
              <span className="min-w-0"><span className="block truncate font-medium text-navy-900">{c.title}</span><span className="text-xs text-navy-400">{c.kind === "chapter" ? `${c.wordCount.toLocaleString()} words` : c.matterType?.replace(/_/g, " ") ?? c.kind}{c.openIssues ? ` · ${c.openIssues} findings` : ""}</span></span>
              {c.score != null && <span className="font-serif text-lg font-semibold text-navy-700">{c.score}</span>}
            </Link>
          ))}
        </div>
      </Section>
      <Modal open={edit} onClose={() => setEdit(false)} title="Edit manuscript details">
        <div className="space-y-3">
          {["title", "author", "genre", "audience"].map((k) => (
            <div key={k}><label className="label">{k}</label><input className="input" value={meta[k] ?? ""} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></div>
          ))}
          <div className="flex justify-between pt-2">
            <button className="btn-danger" onClick={async () => { if (!confirm(`Delete “${ms.title}” permanently, including its reports, Story Bible and exports?`)) return; await api(`/api/manuscripts/${id}`, { method: "DELETE" }); router.replace("/app/manuscripts"); }}>Delete manuscript</button>
            <button className="btn-primary" onClick={async () => { try { await api(`/api/manuscripts/${id}`, { method: "PATCH", body: meta }); setEdit(false); reload(); } catch (e: any) { toast(e.message, "err"); } }}>Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
