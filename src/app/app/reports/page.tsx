"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ago } from "@/lib/client/api";
import { Empty, ErrorBox, Loading, PageHeader, ScoreRing } from "@/components/ui";

export default function Reports() {
  const [ms, setMs] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api("/api/manuscripts").then((r) => setMs(r.manuscripts)).catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="p-8"><ErrorBox error={err} /></div>;
  if (!ms) return <Loading />;
  const analysed = ms.filter((m) => m.overall_score != null || m.status === "analyzed");
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHeader eyebrow="Reports" title="Editing Reports">Editorial assessments for each analysed manuscript. Open one to see scores, the verdict and every finding, or export it as DOCX/PDF.</PageHeader>
      {!analysed.length ? (
        <Empty title="No reports yet" action={<Link className="btn-gold" href="/app/manuscripts">Choose a manuscript</Link>}>Run an analysis on a manuscript to generate its editorial report.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {analysed.map((m) => (
            <Link key={m.id} href={mhref(m.id, `/report`)} className="card flex items-center gap-4 p-5 transition hover:border-gold-300">
              <ScoreRing score={m.overall_score} size={72} />
              <div className="min-w-0">
                <div className="truncate font-serif text-xl font-semibold">{m.title}</div>
                <div className="text-sm text-navy-500">{m.word_count.toLocaleString()} words · mode: {m.last_mode ?? "—"} · {m.open_issues} open findings</div>
                <div className="text-xs text-navy-400">Updated {ago(m.updated_at)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
