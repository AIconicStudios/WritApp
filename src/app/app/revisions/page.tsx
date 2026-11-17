"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";

export default function Revisions() {
  const [ms, setMs] = useState<any[] | null>(null);
  const [counts, setCounts] = useState<Record<string, { versions: number; drafts: number; branches: number }>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api("/api/manuscripts")
      .then(async (r) => {
        setMs(r.manuscripts);
        const out: any = {};
        await Promise.all(r.manuscripts.map(async (m: any) => {
          const [v, d, b] = await Promise.all([api(`/api/manuscripts/${m.id}/versions?limit=500`), api(`/api/manuscripts/${m.id}/drafts`), api(`/api/manuscripts/${m.id}/branches`)]);
          out[m.id] = { versions: v.versions.length, drafts: d.drafts.length, branches: b.branches.length };
        }));
        setCounts(out);
      })
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="p-8"><ErrorBox error={err} /></div>;
  if (!ms) return <Loading />;
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHeader eyebrow="History" title="Saved Revisions">Every accepted suggestion, rewrite and manual edit is saved as a version you can restore. Drafts and story branches are kept separately until you choose to add them to the manuscript.</PageHeader>
      {!ms.length ? <Empty title="No manuscripts yet" /> : (
        <div className="card divide-y divide-navy-50">
          {ms.map((m) => (
            <div key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-serif text-lg font-semibold">{m.title}</div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link className="btn-outline btn-sm" href={`/app/m/${m.id}/history`}>{counts[m.id]?.versions ?? "…"} versions</Link>
                <Link className="btn-outline btn-sm" href={`/app/m/${m.id}/companion?tab=drafts`}>{counts[m.id]?.drafts ?? "…"} drafts</Link>
                <Link className="btn-outline btn-sm" href={`/app/m/${m.id}/branches`}>{counts[m.id]?.branches ?? "…"} story branches</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
