"use client";
import { useEffect, useState } from "react";
import { api, bytes, fmtDate } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { Loading, Notice, Section, Spinner, useToast } from "@/components/ui";

export default function Exports() {
  const { id } = useWS();
  const { toast, node } = useToast();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [trim, setTrim] = useState("6x9");
  const load = () => api(`/api/manuscripts/${id}/exports`).then(setD);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  if (!d) return <Loading />;
  async function gen(kind: string, format: string) {
    setBusy(kind + format);
    try {
      const r = await api(`/api/manuscripts/${id}/exports`, { body: { kind, format, trim } });
      window.location.href = `/api/exports/${r.id}`;
      toast(`${r.fileName} generated (${bytes(r.size)}).`);
      load();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(null);
  }
  const groups: [string, string][] = [["manuscript", "Manuscript files"], ["report", "Editorial reports"], ["book", "Book reports & Story Bible"]];
  return (
    <div className="space-y-6">
      {node}
      <Notice>Exports use your current approved text. Your original upload is always preserved — use “Original manuscript” to download it exactly as uploaded.</Notice>
      {groups.map(([g, title]) => (
        <Section key={g} title={title}>
          <div className="divide-y divide-navy-50">
            {d.available.filter((e: any) => e.group === g).map((e: any) => (
              <div key={e.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="font-medium text-navy-900">{e.name}</div><div className="text-xs text-navy-500">{e.desc}</div></div>
                <div className="flex flex-none items-center gap-2">
                  {e.id === "ms_print" && <select className="input w-auto py-1 text-xs" value={trim} onChange={(x) => setTrim(x.target.value)}><option value="5x8">5 × 8 in</option><option value="5.5x8.5">5.5 × 8.5 in</option><option value="6x9">6 × 9 in</option></select>}
                  {e.formats.map((f: string) => <button key={f} className="btn-outline btn-sm uppercase" disabled={!!busy} onClick={() => gen(e.id, f)}>{busy === e.id + f ? <Spinner className="h-3 w-3" /> : null} {f}</button>)}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}
      <Section title="Previously exported">
        {!d.exports.length ? <p className="text-sm italic text-navy-400">Nothing yet.</p> : (
          <ul className="divide-y divide-navy-50 text-sm">{d.exports.map((x: any) => <li key={x.id} className="flex items-center justify-between gap-2 py-2"><span><span className="mr-2 rounded bg-navy-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-300">{x.format}</span>{x.file_name} <span className="text-xs text-navy-400">· {bytes(x.size)} · {fmtDate(x.created_at)}</span></span><a className="btn-ghost btn-sm" href={`/api/exports/${x.id}`}>Download</a></li>)}</ul>
        )}
      </Section>
    </div>
  );
}
