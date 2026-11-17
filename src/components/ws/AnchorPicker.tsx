"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

/** Choose the point in the manuscript where the story continues (chapter → paragraph). */
export function AnchorPicker({ msId, chapters, value, onChange }: { msId: string; chapters: any[]; value: string | null; onChange: (paragraphId: string | null, label: string) => void }) {
  const [chapterId, setChapterId] = useState<string>("");
  const [paras, setParas] = useState<any[]>([]);
  useEffect(() => {
    if (value && !chapterId) api(`/api/manuscripts/${msId}/paragraphs/${value}`).then((r) => setChapterId(r.paragraph?.chapter_id ?? "")).catch(() => {});
    else if (!value && !chapterId) {
      const body = chapters.filter((c) => c.kind === "chapter");
      if (body.length) setChapterId(body[body.length - 1].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, chapters]);
  useEffect(() => {
    if (!chapterId) return;
    api(`/api/manuscripts/${msId}/chapters/${chapterId}`).then((r) => {
      const ps = r.paragraphs.filter((p: any) => p.style !== "scene_break");
      setParas(ps);
      if (!value || !ps.some((p: any) => p.id === value)) {
        const last = ps[ps.length - 1];
        if (last) onChange(last.id, `end of ${r.chapter.title}`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);
  const ch = chapters.find((c) => c.id === chapterId);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label className="label">Chapter</label>
        <select className="input" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Continue after paragraph</label>
        <select className="input" value={value ?? ""} onChange={(e) => { const p = paras.find((x) => x.id === e.target.value); onChange(e.target.value, `after ¶${(p?.idx ?? 0) + 1} of ${ch?.title}`); }}>
          {paras.map((p, i) => <option key={p.id} value={p.id}>{i === paras.length - 1 ? "End of chapter — " : `¶${p.idx + 1} — `}{p.text.slice(0, 70)}…</option>)}
        </select>
      </div>
    </div>
  );
}
