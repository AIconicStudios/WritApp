"use client";
import { mhref } from "@/lib/client/href";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MOBILE } from "@/lib/client/href";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { ErrorBox, Notice, PageHeader, Progress, Spinner, cx } from "@/components/ui";
import { ModePicker } from "@/components/ModePicker";
import type { EditMode } from "@/lib/types";

const ACCEPT = ".docx,.pdf,.txt,.md,.markdown,.rtf,.odt,.epub,.html,.htm";

export default function NewManuscript() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [meta, setMeta] = useState({ title: "", author: "", genre: "", audience: "" });
  const [mode, setMode] = useState<EditMode>("full");
  const [startNow, setStartNow] = useState(true);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);
  const [ai, setAi] = useState(false);
  useEffect(() => {
    api("/api/settings/ai").then((r) => setAi(r.settings.provider !== "builtin" && !!r.settings.model)).catch(() => {});
  }, []);

  function pick(f: File | undefined | null) {
    if (!f) return;
    setErr(null);
    setDup(null);
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPT.split(",").includes(ext)) return setErr(`“${ext}” files aren't supported. Use DOCX, PDF, TXT, Markdown, RTF, ODT, EPUB or HTML.`);
    if (f.size > 60 * 1024 * 1024) return setErr("That file is larger than 60 MB.");
    setFile(f);
    if (!meta.title) setMeta((m) => ({ ...m, title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));
  }

  function upload(force = false) {
    if (!file) return;
    setErr(null);
    setPhase("uploading");
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(meta).forEach(([k, v]) => fd.append(k, v));
    if (force) fd.append("force", "1");
    if (MOBILE) {
      // On the phone the file is processed locally — no network upload.
      setPhase("processing");
      api("/api/manuscripts", { form: fd })
        .then(async (r: any) => {
          if (r.duplicateOf && !force) {
            setDup(r.duplicateOf);
            setPhase("idle");
            return;
          }
          if (startNow) await api(`/api/manuscripts/${r.id}/jobs`, { body: { mode } }).catch(() => {});
          router.push(mhref(r.id));
        })
        .catch((e) => {
          setErr(e.message);
          setPhase("idle");
        });
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/manuscripts");
    xhr.upload.onprogress = (e) => e.lengthComputable && setPct(e.loaded / e.total);
    xhr.upload.onload = () => setPhase("processing");
    xhr.onerror = () => {
      setErr("Upload failed — check your connection.");
      setPhase("idle");
    };
    xhr.onload = async () => {
      let r: any = {};
      try {
        r = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 400) {
        setErr(r.error ?? `Upload failed (${xhr.status}).`);
        setPhase("idle");
        return;
      }
      if (r.duplicateOf && !force) {
        setDup(r.duplicateOf);
        setPhase("idle");
        return;
      }
      if (startNow) {
        try {
          await api(`/api/manuscripts/${r.id}/jobs`, { body: { mode } });
        } catch {}
      }
      router.push(mhref(r.id));
    };
    xhr.send(fd);
  }

  return (
    <div className="mx-auto max-w-5xl p-5 sm:p-8">
      <PageHeader eyebrow="New manuscript" title="Upload a manuscript">
        Cashless Edit preserves your chapter order and every paragraph. Your original file is stored encrypted and is never modified.
      </PageHeader>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => input.current?.click()}
        className={cx("card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-14 text-center transition", drag ? "border-gold-400 bg-gold-50" : "border-navy-200 hover:border-gold-300")}
      >
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#c4933a" strokeWidth="1.4"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {file ? (
          <>
            <div className="mt-3 font-serif text-2xl font-semibold text-navy-950">{file.name}</div>
            <div className="text-sm text-navy-500">{(file.size / 1024 / 1024).toFixed(2)} MB · click to choose a different file</div>
          </>
        ) : (
          <>
            <div className="mt-3 font-serif text-2xl font-semibold text-navy-950">Drop your manuscript here</div>
            <div className="text-sm text-navy-500">or click to browse · DOCX, PDF, TXT, MD, RTF, ODT, EPUB, HTML · up to 60 MB · 150,000+ words supported</div>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div><label className="label">Title</label><input className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="Detected from the file if left blank" /></div>
        <div><label className="label">Author name</label><input className="input" value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} placeholder="Used on title pages and exports" /></div>
        <div><label className="label">Genre</label><input className="input" value={meta.genre} onChange={(e) => setMeta({ ...meta, genre: e.target.value })} placeholder="e.g. Literary fiction, Fantasy, Thriller, Memoir" list="genres" />
          <datalist id="genres">{["Literary fiction", "Fantasy", "Science fiction", "Romance", "Thriller", "Mystery", "Horror", "Historical fiction", "Young adult", "Middle grade", "Memoir", "Non-fiction"].map((g) => <option key={g} value={g} />)}</datalist>
        </div>
        <div><label className="label">Audience</label><input className="input" value={meta.audience} onChange={(e) => setMeta({ ...meta, audience: e.target.value })} placeholder="e.g. Adult, YA, Children" /></div>
      </div>

      <h2 className="h-display mb-3 mt-8 text-2xl">Editing mode</h2>
      <ModePicker value={mode} onChange={setMode} aiEnabled={ai} />
      {!ai && (
        <Notice tone="gold" className="mt-4">
          No AI model is connected, so AI-only stages will be skipped and clearly marked in the report. <Link href="/app/settings" className="underline">Connect a free model</Link> any time and re-run.
        </Notice>
      )}
      <label className="mt-5 flex items-center gap-2 text-sm text-navy-700">
        <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} /> Start the analysis immediately after upload
      </label>

      <div className="mt-6 space-y-3">
        <ErrorBox error={err} />
        {dup && (
          <Notice tone="warn">
            This exact manuscript is already in your library.{" "}
            <Link className="font-medium underline" href={mhref(dup)}>Open the existing copy</Link> or{" "}
            <button className="font-medium underline" onClick={() => upload(true)}>upload it again as a separate copy</button>.
          </Notice>
        )}
        {phase !== "idle" && (
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-navy-700"><Spinner /> {phase === "uploading" ? `Uploading… ${Math.round(pct * 100)}%` : "Extracting text and organising chapters…"}</div>
            <Progress value={phase === "uploading" ? pct * 0.7 : 0.85} />
          </div>
        )}
        <button className="btn-primary px-6 py-2.5" disabled={!file || phase !== "idle"} onClick={() => upload(false)}>
          Upload{startNow ? " and start editing" : ""}
        </button>
      </div>
    </div>
  );
}
