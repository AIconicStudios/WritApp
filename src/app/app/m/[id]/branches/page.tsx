"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, ago, fmtDate } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { AnchorPicker } from "@/components/ws/AnchorPicker";
import { SideBySide } from "@/components/ws/Diff";
import { cx, Empty, ErrorBox, Loading, Modal, Notice, Spinner, useToast } from "@/components/ui";

function Branches() {
  const { id, data, reload } = useWS();
  const sp = useSearchParams();
  const { toast, node } = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [sel, setSel] = useState<string | null>(sp.get("branch"));
  const [detail, setDetail] = useState<any>(null);
  const [content, setContent] = useState("");
  const [note, setNote] = useState("");
  const [create, setCreate] = useState<any>(sp.get("new") ? { name: "", description: sp.get("new"), content: "" } : null);
  const [compare, setCompare] = useState<string[]>([]);
  const [merge, setMerge] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api(`/api/manuscripts/${id}/branches`).then((r) => setList(r.branches)).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  useEffect(() => {
    if (!sel) return setDetail(null);
    api(`/api/manuscripts/${id}/branches/${sel}`).then((r) => { setDetail(r); setContent(r.versions[0]?.content ?? ""); });
  }, [sel, id]);
  if (!data || !list) return <Loading />;
  const cmp = compare.map((bid) => list.find((b) => b.id === bid)).filter(Boolean);

  return (
    <div>
      {node}
      <Notice className="mb-4">Story branches let you explore alternative directions — a darker version, a romantic version, a suspense-driven version — without touching your manuscript. Each branch keeps its own revision history. Nothing reaches the official manuscript unless you merge it.</Notice>
      <ErrorBox error={err} />
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setCreate({ name: "", description: "", content: "" })}>+ New branch</button>
        {compare.length === 2 && <button className="btn-outline" onClick={() => setSel(null)}>Comparing 2 branches ↓</button>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          <div className="card p-3 text-sm"><div className="font-medium text-navy-900">Original storyline</div><div className="text-xs text-navy-500">Your official manuscript · {data.manuscript.word_count.toLocaleString()} words</div></div>
          {list.length === 0 && <p className="p-2 text-sm italic text-navy-400">No branches yet.</p>}
          {list.map((b) => (
            <div key={b.id} className={cx("card p-3", sel === b.id && "border-gold-400 ring-2 ring-gold-200")}>
              <button className="w-full text-left" onClick={() => setSel(b.id)}>
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-navy-900">{b.name}</span><span className={cx("chip", b.status === "merged" ? "border-emerald-200 text-emerald-700" : b.status === "archived" ? "border-navy-100 text-navy-400" : "border-gold-200 text-gold-700")}>{b.status}</span></div>
                <div className="line-clamp-2 text-xs text-navy-500">{b.description || (b.latest ?? "").slice(0, 120)}</div>
                <div className="text-[11px] text-navy-400">{b.versions} versions · {ago(b.updated_at)}</div>
              </button>
              <label className="mt-1 flex items-center gap-1 text-[11px] text-navy-500"><input type="checkbox" checked={compare.includes(b.id)} onChange={(e) => setCompare(e.target.checked ? [...compare.slice(-1), b.id] : compare.filter((x) => x !== b.id))} /> compare</label>
            </div>
          ))}
        </div>
        <div>
          {cmp.length === 2 && !sel ? (
            <div className="card p-5"><h3 className="h-display mb-3 text-2xl">Compare directions</h3><SideBySide a={cmp[0].latest ?? ""} b={cmp[1].latest ?? ""} labelA={cmp[0].name} labelB={cmp[1].name} /></div>
          ) : !detail ? (
            <Empty title="Select or create a branch">Write alternative scenes or chapters here, or save a Creative Companion draft as a branch.</Empty>
          ) : (
            <div className="card p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="h-display text-2xl">{detail.branch.name}</h3><p className="text-sm text-navy-500">{detail.branch.description}</p></div>
                <div className="flex flex-wrap gap-2">
                  {detail.branch.status !== "merged" && <button className="btn-gold btn-sm" onClick={() => setMerge(true)}>Merge into manuscript…</button>}
                  <button className="btn-outline btn-sm" onClick={async () => { await api(`/api/manuscripts/${id}/branches/${sel}`, { body: { action: detail.branch.status === "archived" ? "restore" : "archive" } }); load(); setSel(sel); }}>{detail.branch.status === "archived" ? "Restore" : "Archive"}</button>
                  <button className="btn-ghost btn-sm" onClick={async () => { if (!confirm("Delete this branch and its history?")) return; await api(`/api/manuscripts/${id}/branches/${sel}`, { method: "DELETE" }); setSel(null); load(); }}>Delete</button>
                </div>
              </div>
              <textarea className="input min-h-[380px] font-book text-[16px] leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} disabled={detail.branch.status === "merged"} placeholder="Write this alternative direction here. Separate paragraphs with a blank line." />
              {detail.branch.status !== "merged" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className="input max-w-sm" placeholder="Version note (e.g. “darker ending”)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className="btn-primary" onClick={async () => { await api(`/api/manuscripts/${id}/branches/${sel}`, { body: { action: "save", content, note } }); setNote(""); toast("New branch version saved."); const r = await api(`/api/manuscripts/${id}/branches/${sel}`); setDetail(r); load(); }}>Save version</button>
                </div>
              )}
              <h4 className="eyebrow mb-2 mt-6">Revision history</h4>
              <ul className="divide-y divide-navy-50 text-sm">
                {detail.versions.map((v: any, i: number) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{v.note || "Saved"}</span> <span className="text-xs text-navy-400">{fmtDate(v.created_at)} · {v.content.split(/\s+/).filter(Boolean).length} words</span></span>
                    {i > 0 && detail.branch.status !== "merged" && <button className="btn-ghost btn-sm" onClick={() => { setContent(v.content); toast("Loaded this version into the editor — save to make it current."); }}>Load</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <Modal open={!!create} onClose={() => setCreate(null)} title="New story branch">
        {create && (
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" placeholder="e.g. Darker version, Romantic version, Alternative B" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} /></div>
            <div><label className="label">Description</label><textarea className="input" value={create.description ?? ""} onChange={(e) => setCreate({ ...create, description: e.target.value })} /></div>
            <div><label className="label">Starting text (optional)</label><textarea className="input min-h-[120px] font-book" value={create.content} onChange={(e) => setCreate({ ...create, content: e.target.value })} /></div>
            <div className="flex justify-end"><button className="btn-primary" disabled={!create.name.trim()} onClick={async () => { const r = await api(`/api/manuscripts/${id}/branches`, { body: create }); setCreate(null); await load(); setSel(r.id); }}>Create branch</button></div>
          </div>
        )}
      </Modal>
      <Modal open={merge} onClose={() => setMerge(false)} title="Merge this branch into the official manuscript?">
        <div className="space-y-3">
          <Notice tone="warn">This adds the branch's text to your manuscript as new paragraphs at the point you choose. Existing text is not deleted, every insertion is versioned, and the Story Bible is only updated after you confirm the extracted facts.</Notice>
          <AnchorPicker msId={id} chapters={data.chapters} value={anchor} onChange={(p) => setAnchor(p)} />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setMerge(false)}>Cancel</button>
            <button className="btn-gold" disabled={!anchor || busy} onClick={async () => { setBusy(true); try { await api(`/api/manuscripts/${id}/branches/${sel}`, { body: { action: "save", content, note: "Version merged" } }); const r = await api(`/api/manuscripts/${id}/branches/${sel}`, { body: { action: "merge", anchorId: anchor, confirm: true } }); toast(`Merged: ${r.inserted} paragraphs inserted. Open Creative Companion → Drafts to update the Story Bible.`); setMerge(false); load(); reload(); const d = await api(`/api/manuscripts/${id}/branches/${sel}`); setDetail(d); } catch (e: any) { toast(e.message, "err"); } setBusy(false); }}>{busy && <Spinner />} Yes, merge</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Branches /></Suspense>;
}
