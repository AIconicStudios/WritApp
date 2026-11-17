"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { DiffView } from "@/components/ws/Diff";
import { Empty, Loading, useToast } from "@/components/ui";

const SRC: Record<string, string> = { author: "Your edit", suggestion: "Accepted suggestion", rewrite: "AI rewrite", restore: "Restore", continuation: "Incorporated draft", branch: "Merged branch" };

function History() {
  const { id, reload } = useWS();
  const sp = useSearchParams();
  const para = sp.get("para");
  const { toast, node } = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => (para ? api(`/api/manuscripts/${id}/paragraphs/${para}`).then((r) => setRows(r.versions.map((v: any) => ({ ...v, current_text: r.paragraph.current_text })))) : api(`/api/manuscripts/${id}/versions?limit=300`).then((r) => setRows(r.versions)));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, para]);
  if (!rows) return <Loading />;
  async function restore(versionId: string, which: string) {
    try { await api(`/api/manuscripts/${id}/versions`, { body: { versionId, which } }); toast("Restored — this is recorded as a new version."); load(); reload(); } catch (e: any) { toast(e.message, "err"); }
  }
  return (
    <div>
      {node}
      <div className="mb-4 flex items-center justify-between"><p className="text-sm text-navy-500">{para ? "Version history for one paragraph." : "Every change to the working text, newest first. Your original upload is never modified."}</p>{para && <Link href={mhref(id, `/history`)} className="text-sm underline">Show all changes</Link>}</div>
      {!rows.length ? <Empty title="No changes yet">Accepted suggestions, rewrites and your own edits will appear here.</Empty> : (
        <div className="space-y-3">
          {rows.map((v) => (
            <div key={v.id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-navy-500">
                <span><span className="chip mr-2 border-navy-200 text-navy-700">{SRC[v.source] ?? v.source}</span>{v.note}{v.chapter_title && <> · <Link className="underline" href={mhref(id, `/editor?chapter=${v.chapter_id}&para=${v.paragraph_id}`)}>{v.chapter_title}, ¶{v.paragraph_idx + 1}</Link></>}</span>
                <span>{fmtDate(v.created_at)}</span>
              </div>
              <div className="rounded-md bg-navy-50/50 p-3"><DiffView a={v.previous_text ?? ""} b={v.text} /></div>
              <div className="mt-2 flex flex-wrap gap-2">
                {v.previous_text != null && <button className="btn-outline btn-sm" onClick={() => restore(v.id, "previous")}>Restore text before this change</button>}
                {v.text && <button className="btn-ghost btn-sm" onClick={() => restore(v.id, "text")}>Restore this version</button>}
                <button className="btn-ghost btn-sm" onClick={() => restore(v.id, "original")}>Restore original upload</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><History /></Suspense>;
}
