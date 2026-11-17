"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, bytes, fmtDate } from "@/lib/client/api";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";

export default function Exports() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api("/api/exports").then((r) => setRows(r.exports)).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);
  if (err) return <div className="p-8"><ErrorBox error={err} /></div>;
  if (!rows) return <Loading />;
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHeader eyebrow="Files" title="Exported Documents">Generated manuscripts and reports. Files are stored encrypted and only downloadable from your account.</PageHeader>
      {!rows.length ? <Empty title="Nothing exported yet">Open a manuscript and choose <strong>Exports</strong> to create DOCX, PDF or EPUB files.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-navy-100 text-left text-xs uppercase tracking-wider text-navy-400"><tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Manuscript</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Created</th><th /></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-b border-navy-50 last:border-0">
                  <td className="px-4 py-3"><span className="mr-2 rounded bg-navy-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-300">{x.format}</span>{x.file_name}</td>
                  <td className="px-4 py-3"><Link className="hover:underline" href={`/app/m/${x.manuscript_id}/exports`}>{x.title}</Link></td>
                  <td className="px-4 py-3 text-navy-500">{bytes(x.size)}</td>
                  <td className="px-4 py-3 text-navy-500">{fmtDate(x.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <a className="btn-outline btn-sm" href={`/api/exports/${x.id}`}>Download</a>{" "}
                    <button className="btn-ghost btn-sm" onClick={async () => { await api(`/api/exports/${x.id}`, { method: "DELETE" }); load(); }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
