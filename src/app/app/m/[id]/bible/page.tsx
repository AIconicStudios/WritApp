"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { cx, Empty, ErrorBox, Loading, Modal, Notice, Spinner, useToast } from "@/components/ui";

const HIDDEN = new Set(["detectedBy", "strength", "order", "part", "fromDraft", "roles"]);
const pretty = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function Bible() {
  const { id } = useWS();
  const sp = useSearchParams();
  const { toast, node } = useToast();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [section, setSection] = useState(sp.get("section") ?? "characters");
  const [q, setQ] = useState(sp.get("focus") ?? "");
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/api/manuscripts/${id}/bible`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const official = useMemo(() => (d?.entries ?? []).filter((e: any) => e.status === "official"), [d]);
  const proposed = useMemo(() => (d?.entries ?? []).filter((e: any) => e.status === "proposed"), [d]);
  if (err) return <ErrorBox error={err} />;
  if (!d) return <Loading />;
  const list = official.filter((e: any) => e.section === section && (!q || (e.name + " " + (e.summary ?? "")).toLowerCase().includes(q.toLowerCase())));

  async function saveEntry() {
    setBusy(true);
    try {
      const data: any = {};
      for (const [k, v] of Object.entries(edit.fields as Record<string, string>)) {
        const orig = edit.data?.[k];
        data[k] = Array.isArray(orig) ? String(v).split(",").map((x) => x.trim()).filter(Boolean).map((x) => (typeof orig[0] === "number" && !isNaN(+x) ? +x : x)) : typeof orig === "number" ? +v : v;
      }
      if (edit.newKey && edit.newVal) data[edit.newKey] = edit.newVal;
      const preserved = Object.fromEntries(Object.entries(edit.data ?? {}).filter(([k]) => HIDDEN.has(k)));
      if (edit.id) await api(`/api/manuscripts/${id}/bible/${edit.id}`, { method: "PATCH", body: { name: edit.name, summary: edit.summary, data: { ...preserved, ...data } } });
      else await api(`/api/manuscripts/${id}/bible`, { body: { section, name: edit.name, summary: edit.summary, data } });
      setEdit(null);
      toast("Story Bible updated. Your edits are locked and will be used as context in future analyses.");
      load();
    } catch (e: any) {
      toast(e.message, "err");
    }
    setBusy(false);
  }
  async function proposals(ids: string[], accept: boolean) {
    await api(`/api/manuscripts/${id}/bible/proposals`, { body: { ids, accept } });
    toast(accept ? "Added to the official Story Bible." : "Discarded.");
    load();
  }
  const open = (e: any) => setEdit({ ...e, fields: Object.fromEntries(Object.entries(e.data ?? {}).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v ?? "")])) });
  const counts = Object.fromEntries(d.sections.map((s: any) => [s.id, official.filter((e: any) => e.section === s.id).length]));

  return (
    <div>
      {node}
      <Notice tone="gold" className="mb-4">The Story Bible is the living memory of your book. It powers continuity checking, the editorial engine and the Creative Companion. Entries you edit are <strong>locked</strong> — automated analysis never overwrites them.</Notice>
      {proposed.length > 0 && (
        <div className="card mb-6 border-gold-300 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div><div className="font-serif text-lg font-semibold">Pending updates from incorporated writing ({proposed.length})</div><div className="text-xs text-navy-500">Extracted from drafts you added to the manuscript. Nothing joins the official Story Bible until you confirm it.</div></div>
            <div className="flex gap-2"><button className="btn-gold btn-sm" onClick={() => proposals(proposed.map((p: any) => p.id), true)}>Confirm all</button><button className="btn-ghost btn-sm" onClick={() => proposals(proposed.map((p: any) => p.id), false)}>Discard all</button></div>
          </div>
          <ul className="divide-y divide-navy-50">
            {proposed.map((p: any) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span><span className="chip mr-2 border-navy-200 capitalize text-navy-500">{p.section}</span><strong>{p.name}</strong>{p.summary && <span className="text-navy-600"> — {p.summary}</span>}</span>
                <span className="flex flex-none gap-1"><button className="btn-outline btn-sm" onClick={() => proposals([p.id], true)}>Confirm</button><button className="btn-ghost btn-sm" onClick={() => proposals([p.id], false)}>Discard</button></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav className="space-y-0.5">
          {d.sections.map((s: any) => (
            <button key={s.id} onClick={() => setSection(s.id)} className={cx("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", section === s.id ? "bg-navy-900 text-white" : "text-navy-700 hover:bg-navy-50")}>
              {s.name}<span className={cx("text-xs", section === s.id ? "text-gold-300" : "text-navy-400")}>{counts[s.id]}</span>
            </button>
          ))}
          <button onClick={() => setSection("__facts")} className={cx("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", section === "__facts" ? "bg-navy-900 text-white" : "text-navy-700 hover:bg-navy-50")}>Continuity fact table<span className="text-xs text-navy-400">{d.facts.length}</span></button>
        </nav>
        <div>
          {section === "__facts" ? (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-navy-100 text-left text-xs uppercase tracking-wider text-navy-400"><tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Attribute</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Where established</th></tr></thead>
                <tbody>{d.facts.map((f: any, i: number) => <tr key={i} className="border-b border-navy-50"><td className="px-3 py-2 font-medium">{f.subject}</td><td className="px-3 py-2">{f.attribute}</td><td className="px-3 py-2">{f.value}</td><td className="px-3 py-2 font-book text-xs italic text-navy-500">{f.chapter_idx === 99999 ? "Incorporated writing" : `ch. index ${f.chapter_idx}`}: “{f.quote}”</td></tr>)}</tbody>
              </table>
              {!d.facts.length && <p className="p-4 text-sm italic text-navy-400">No facts recorded yet.</p>}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn-primary" onClick={() => setEdit({ name: "", summary: "", data: {}, fields: {} })}>+ Add entry</button>
              </div>
              {list.length === 0 ? <Empty title="Nothing here yet">Run an analysis to populate this section automatically, or add entries yourself.</Empty> : (
                <div className="grid gap-3 md:grid-cols-2">
                  {list.map((e: any) => (
                    <div key={e.id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-serif text-lg font-semibold">{e.name}</div>
                        <div className="flex flex-none items-center gap-1">{e.author_locked ? <span className="chip border-gold-300 text-gold-700">Author-edited</span> : <span className="chip border-navy-100 text-navy-400">{e.origin === "ai" ? "AI" : e.origin === "builtin" ? "Built-in" : e.origin}</span>}<button className="btn-ghost btn-sm" onClick={() => open(e)}>Edit</button></div>
                      </div>
                      {e.summary && <p className="mt-1 text-sm text-navy-700">{e.summary}</p>}
                      <dl className="mt-2 space-y-0.5 text-xs">
                        {Object.entries(e.data).filter(([k, v]) => !HIDDEN.has(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length)).slice(0, 8).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-28 flex-none font-semibold text-navy-400">{pretty(k)}</dt><dd className="text-navy-700">{Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></div>)}
                      </dl>
                      {e.refs?.[0]?.quote && <Link href={e.refs[0].chapterId ? `/app/m/${id}/editor?chapter=${e.refs[0].chapterId}&para=${e.refs[0].paragraphId ?? ""}` : "#"} className="mt-2 block rounded bg-navy-50 px-2 py-1 font-book text-xs italic text-navy-600 hover:bg-navy-100">“{e.refs[0].quote}” <span className="not-italic text-navy-400">— {e.refs[0].label}</span></Link>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit: ${edit.name}` : "New Story Bible entry"} wide>
        {edit && (
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label className="label">Summary</label><textarea className="input min-h-[70px]" value={edit.summary ?? ""} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></div>
            {Object.entries(edit.fields).map(([k, v]) => (
              <div key={k}><label className="label">{pretty(k)}</label><input className="input" value={v as string} onChange={(e) => setEdit({ ...edit, fields: { ...edit.fields, [k]: e.target.value } })} /></div>
            ))}
            <div className="grid grid-cols-[1fr_2fr] gap-2"><input className="input" placeholder="New field (e.g. eye colour)" value={edit.newKey ?? ""} onChange={(e) => setEdit({ ...edit, newKey: e.target.value })} /><input className="input" placeholder="Value" value={edit.newVal ?? ""} onChange={(e) => setEdit({ ...edit, newVal: e.target.value })} /></div>
            <div className="flex justify-between pt-2">
              {edit.id ? <button className="btn-danger" onClick={async () => { if (!confirm("Delete this entry?")) return; await api(`/api/manuscripts/${id}/bible/${edit.id}`, { method: "DELETE" }); setEdit(null); load(); }}>Delete</button> : <span />}
              <button className="btn-primary" disabled={busy || !edit.name.trim()} onClick={saveEntry}>{busy && <Spinner />} Save</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Bible /></Suspense>;
}
