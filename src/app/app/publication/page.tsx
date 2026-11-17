"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { cx, Empty, ErrorBox, Loading, PageHeader, ScoreRing } from "@/components/ui";

const T: Record<string, string> = { ready: "bg-emerald-50 text-emerald-700 border-emerald-200", needs_work: "bg-gold-50 text-gold-700 border-gold-200", not_ready: "bg-red-50 text-red-700 border-red-200" };

export default function Publication() {
  const [ms, setMs] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api("/api/manuscripts").then((r) => setMs(r.manuscripts)).catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="p-8"><ErrorBox error={err} /></div>;
  if (!ms) return <Loading />;
  const audited = ms.filter((m) => m.targets);
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHeader eyebrow="Publishing" title="Publication Readiness">Technical and editorial readiness for Kindle (KDP), paperback, hardcover and agent/publisher submission. These checks follow common industry conventions — they can't guarantee acceptance by any publisher or platform.</PageHeader>
      {!audited.length ? (
        <Empty title="No audits yet">Every analysis ends with a publication audit. Run a <strong>Publication Audit</strong> or <strong>Full Editorial Review</strong> on a manuscript.</Empty>
      ) : (
        <div className="space-y-4">
          {audited.map((m) => (
            <Link key={m.id} href={`/app/m/${m.id}/publication`} className="card flex flex-col gap-4 p-5 transition hover:border-gold-300 sm:flex-row sm:items-center">
              <ScoreRing score={m.publicationScore} size={64} label="Readiness" />
              <div className="flex-1">
                <div className="font-serif text-xl font-semibold">{m.title}</div>
                <div className="mt-2 flex flex-wrap gap-2">{m.targets.map((t: any) => <span key={t.id} className={cx("chip", T[t.status])}>{t.name}: {t.status.replace("_", " ")}</span>)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
