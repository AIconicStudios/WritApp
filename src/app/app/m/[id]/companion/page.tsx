"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, ago } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { AnchorPicker } from "@/components/ws/AnchorPicker";
import { AINeeded, cx, Empty, ErrorBox, KV, List, Loading, Modal, Notice, Section, Spinner, Tabs, useToast } from "@/components/ui";

type Tab = "continue" | "whatif" | "stuck" | "plan" | "future" | "drafts" | "history";
const FLAG: Record<string, string> = { direct_contradiction: "border-red-200 bg-red-50 text-red-800", possible_inconsistency: "border-orange-200 bg-orange-50 text-orange-800", intentional_mystery: "border-navy-200 bg-navy-50 text-navy-700", requires_revision: "border-gold-200 bg-gold-50 text-gold-700" };
const FLAG_LABEL: Record<string, string> = { direct_contradiction: "Direct contradiction", possible_inconsistency: "Possible inconsistency", intentional_mystery: "Intentional mystery?", requires_revision: "Would require revising earlier chapters" };

function Working({ label }: { label: string }) {
  return <div className="card flex items-center gap-3 p-5 text-sm text-navy-600"><Spinner /> {label} <span className="text-xs text-navy-400">Local models can take a minute or two — the result is saved automatically.</span></div>;
}

function Validation({ v }: { v: any }) {
  if (!v) return null;
  const tone = v.verdict === "consistent" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : /conflict/.test(v.verdict) ? "border-red-200 bg-red-50 text-red-800" : "border-gold-200 bg-gold-50 text-gold-800";
  return (
    <div className="mt-3">
      <div className={cx("chip", tone)}>Continuity check: {v.verdict}</div>
      {v.flags?.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {v.flags.map((f: any, i: number) => (
            <li key={i} className={cx("rounded-md border px-2.5 py-1.5 text-xs", FLAG[f.kind] ?? FLAG.possible_inconsistency)}>
              <strong>{FLAG_LABEL[f.kind] ?? f.kind}</strong>{f.area ? ` · ${f.area}` : ""}: {f.description}{f.established_fact && <span className="block opacity-80">Established: {f.established_fact}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftEditor({ msId, draft, chapters, onChange }: { msId: string; draft: any; chapters: any[]; onChange: () => void }) {
  const { toast, node } = useToast();
  const router = useRouter();
  const [content, setContent] = useState(draft.content);
  const [anchor, setAnchor] = useState<string | null>(draft.anchor_paragraph_id ?? draft.anchorId ?? null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState("");
  const [after, setAfter] = useState<any>(null);
  const id = draft.id ?? draft.draftId;
  const save = async () => { await api(`/api/manuscripts/${msId}/drafts/${id}`, { method: "PATCH", body: { content } }); toast("Draft saved."); onChange(); };
  async function incorporate() {
    setBusy("inc");
    try {
      const r = await api(`/api/manuscripts/${msId}/drafts/${id}`, { body: { action: "incorporate", anchorId: anchor, content } });
      setConfirm(false);
      setAfter(r);
      onChange();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy("");
  }
  async function propose() {
    setBusy("bible");
    try { const r = await api(`/api/manuscripts/${msId}/drafts/${id}`, { body: { action: "propose_bible" } }); toast(`${r.proposed} new facts proposed — confirm them in the Story Bible.`); router.push(`/app/m/${msId}/bible`); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy("");
  }
  async function toBranch() {
    const name = prompt("Name for this story branch:", draft.title ?? "Alternative direction");
    if (!name) return;
    const r = await api(`/api/manuscripts/${msId}/branches`, { body: { name, description: "Created from a Creative Companion draft", content } });
    router.push(`/app/m/${msId}/branches?branch=${r.id}`);
  }
  const incorporated = draft.status === "incorporated" || after;
  return (
    <div className="space-y-3">
      {node}
      <textarea className="input min-h-[320px] font-book text-[16px] leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} disabled={!!incorporated} />
      <div className="text-xs text-navy-400">Generated text is a draft. Edit it freely — nothing is added to your manuscript unless you choose to.</div>
      {incorporated ? (
        <Notice tone="success">
          This text is now part of your manuscript{after ? ` (${after.inserted} paragraphs inserted)` : ""}.{" "}
          {after?.firstParagraphId && <Link className="underline" href={`/app/m/${msId}/editor?para=${after.firstParagraphId}`}>View it in the revision workspace</Link>}
          <div className="mt-2 flex flex-wrap gap-2"><button className="btn-primary btn-sm" disabled={!!busy} onClick={propose}>{busy === "bible" && <Spinner className="h-3 w-3" />} Update the Story Bible from this text</button><span className="self-center text-xs">New facts are extracted as proposals for you to confirm.</span></div>
        </Notice>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" onClick={save}>Save draft</button>
          <button className="btn-gold btn-sm" onClick={() => setConfirm(true)}>Add to manuscript…</button>
          <button className="btn-outline btn-sm" onClick={toBranch}>Save as story branch</button>
          <button className="btn-ghost btn-sm" onClick={async () => { await api(`/api/manuscripts/${msId}/drafts/${id}`, { body: { action: "discard" } }); onChange(); toast("Draft discarded."); }}>Discard</button>
        </div>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Add this text to your manuscript?">
        <div className="space-y-4">
          <p className="text-sm text-navy-700">The draft will be inserted as new paragraphs at the point you choose. Existing text is not changed. Each inserted paragraph is recorded in the version history.</p>
          <AnchorPicker msId={msId} chapters={chapters} value={anchor} onChange={(p) => setAnchor(p)} />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-gold" disabled={!anchor || !!busy} onClick={incorporate}>{busy === "inc" && <Spinner />} Insert into manuscript</button></div>
        </div>
      </Modal>
    </div>
  );
}

function Develop({ msId, scenario, anchorId, chapters, creativeItemId }: { msId: string; scenario: any; anchorId: string | null; chapters: any[]; creativeItemId?: string }) {
  const [o, setO] = useState({ format: "scene", words: 1200, tone: "", pacing: "", pov: "", style: "", direction: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  async function go() {
    setBusy(true); setErr(null); setRes(null);
    try {
      const text = typeof scenario === "string" ? scenario : `${scenario.title}\n${scenario.description}\nCharacters: ${(scenario.characters ?? []).join(", ")}\nMotivation: ${scenario.motivation}\nConflict: ${scenario.conflict}`;
      setRes(await api(`/api/manuscripts/${msId}/creative`, { body: { action: "develop", scenario: text, anchorId, creativeItemId, ...o } }));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">Write</label><select className="input" value={o.format} onChange={(e) => setO({ ...o, format: e.target.value, words: e.target.value === "chapter" ? 2500 : e.target.value === "outline" || e.target.value === "paragraphs" ? 400 : 1200 })}>
          <option value="outline">A scene outline</option><option value="paragraphs">The next few paragraphs</option><option value="scene">A complete scene</option><option value="chapter">A complete chapter</option><option value="dialogue">Dialogue</option><option value="confrontation">An emotional confrontation</option><option value="redirect">A different direction</option></select></div>
        <div><label className="label">Approx. words</label><input className="input" type="number" min={100} max={4000} value={o.words} onChange={(e) => setO({ ...o, words: +e.target.value })} /></div>
        <div><label className="label">Tone</label><input className="input" placeholder="e.g. tense, tender, eerie" value={o.tone} onChange={(e) => setO({ ...o, tone: e.target.value })} /></div>
        <div><label className="label">Pacing</label><input className="input" placeholder="e.g. fast, slow-burn" value={o.pacing} onChange={(e) => setO({ ...o, pacing: e.target.value })} /></div>
        <div><label className="label">Narrative perspective</label><input className="input" placeholder="Default: match the manuscript" value={o.pov} onChange={(e) => setO({ ...o, pov: e.target.value })} /></div>
        <div><label className="label">Style</label><input className="input" placeholder="Default: the author's voice" value={o.style} onChange={(e) => setO({ ...o, style: e.target.value })} /></div>
      </div>
      <input className="input" placeholder="Any direction for this version (optional)" value={o.direction} onChange={(e) => setO({ ...o, direction: e.target.value })} />
      <button className="btn-primary" disabled={busy} onClick={go}>{busy && <Spinner />} Generate</button>
      <ErrorBox error={err} />
      {busy && <Working label="Writing in your voice…" />}
      {res && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h4 className="font-serif text-xl font-semibold">{res.title}</h4><span className="text-xs text-navy-400">{res.words} words</span></div>
          <Validation v={res.validation} />
          {res.notes?.length > 0 && <div className="rounded-md bg-navy-50 p-3 text-xs text-navy-600"><strong>Notes:</strong> {res.notes.join(" · ")}</div>}
          <DraftEditor msId={msId} draft={{ ...res, id: res.draftId, anchorId }} chapters={chapters} onChange={() => {}} />
        </div>
      )}
    </div>
  );
}

function Companion() {
  const { id, data } = useWS();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) ?? "continue");
  const [anchor, setAnchor] = useState<string | null>(sp.get("anchor"));
  const [anchorLabel, setAnchorLabel] = useState("");
  const [selection] = useState(sp.get("selection") ?? "");
  const [request, setRequest] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<any>(null);
  const [question, setQuestion] = useState("");
  const [develop, setDevelop] = useState<any>(null);
  const [future, setFuture] = useState({ from: 0, count: 10, direction: "" });
  const [drafts, setDrafts] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [openDraft, setOpenDraft] = useState<any>(null);
  useEffect(() => { setOut(null); setErr(null); setQuestion(""); }, [tab]);
  useEffect(() => {
    if (tab === "drafts") api(`/api/manuscripts/${id}/drafts`).then((r) => setDrafts(r.drafts));
    if (tab === "history") api(`/api/manuscripts/${id}/creative`).then((r) => setHistory(r.items));
  }, [tab, id]);
  if (!data) return <Loading />;
  const chapters = data.chapters;
  const lastNum = chapters.filter((c: any) => c.kind === "chapter").reduce((n: number, c: any) => Math.max(n, c.number ?? 0), 0);

  async function run(body: any) {
    setBusy(true); setErr(null); setOut(null);
    try { setOut(await api(`/api/manuscripts/${id}/creative`, { body })); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  const tabs: { id: Tab; label: string }[] = [{ id: "continue", label: "Help Me Continue" }, { id: "whatif", label: "What If?" }, { id: "stuck", label: "I'm Stuck" }, { id: "plan", label: "Plan My Book" }, { id: "future", label: "Future Chapter Planner" }, { id: "drafts", label: "Drafts" }, { id: "history", label: "History" }];
  const Presets = ({ items }: { items: string[] }) => <div className="flex flex-wrap gap-1.5">{items.map((q) => <button key={q} className="rounded-full border border-navy-200 px-3 py-1 text-xs text-navy-600 hover:border-gold-400" onClick={() => setQuestion(q)}>{q}</button>)}</div>;

  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {!data.ai.enabled && !["drafts", "history"].includes(tab) && <div className="mb-4"><AINeeded feature="The Creative Companion" /></div>}
      {!data.available?.summary && data.ai.enabled && !["drafts", "history"].includes(tab) && <Notice tone="gold" className="mb-4">For the best suggestions, run a <strong>Developmental Edit</strong> first so the companion knows your whole book through the Story Bible. It will still work from the text around your chosen point.</Notice>}

      {tab === "continue" && (
        <div className="space-y-5">
          <Section title="Where does the story continue?">
            <AnchorPicker msId={id} chapters={chapters} value={anchor} onChange={(p, l) => { setAnchor(p); setAnchorLabel(l); }} />
            {selection && <div className="mt-3 rounded-md bg-gold-50 p-2 font-book text-sm italic text-navy-700">Selected: “{selection}”</div>}
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
              <input className="input" placeholder="Optional note to the companion, e.g. “I want more tension between Mara and her father”" value={request} onChange={(e) => setRequest(e.target.value)} />
              <select className="input" value={count} onChange={(e) => setCount(+e.target.value)}>{[5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} scenarios</option>)}</select>
            </div>
            <button className="btn-gold mt-3" disabled={busy || !data.ai.enabled} onClick={() => run({ action: "continue", anchorId: anchor, selection, request, count })}>{busy && <Spinner />} Help Me Continue</button>
          </Section>
          <ErrorBox error={err} />
          {busy && <Working label={`Reading the story up to ${anchorLabel || "this point"} and imagining what could happen next…`} />}
          {out?.situation && (
            <>
              <Section title="Where the story stands">
                <div className="grid gap-x-8 md:grid-cols-2">
                  <div><KV k="So far" v={out.situation.so_far} /><KV k="Current scene" v={out.situation.current_scene} /><KV k="Atmosphere" v={out.situation.atmosphere} /><KV k="Narrative direction" v={out.situation.direction} /></div>
                  <div><KV k="Characters present" v={out.situation.characters_present.join(", ")} /><div className="py-2"><div className="label">What each wants</div><List items={out.situation.character_wants} /></div><div className="py-2"><div className="label">Conflicts in play</div><List items={out.situation.conflicts} /></div><div className="py-2"><div className="label">Unresolved threads</div><List items={out.situation.unresolved} /></div></div>
                </div>
              </Section>
              <div className="grid gap-4 lg:grid-cols-2">
                {out.scenarios.map((s: any, i: number) => (
                  <div key={i} className="card flex flex-col p-5">
                    <div className="eyebrow">Scenario {i + 1}{s.direction_type ? ` · ${s.direction_type}` : ""}</div>
                    <h3 className="h-display mt-1 text-2xl">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy-800">{s.description}</p>
                    <div className="mt-3 flex-1">
                      <KV k="Characters" v={s.characters.join(", ")} /><KV k="Why they act" v={s.motivation} /><KV k="Tension" v={s.conflict} /><KV k="Emotional impact" v={s.emotional_impact} /><KV k="Advances the plot" v={s.plot_advance} /><KV k="Later consequences" v={s.consequences} /><KV k="Why it fits" v={s.why_it_fits} />
                      {s.continuity_risks?.length > 0 && <div className="py-2"><div className="label">Continuity risks noted</div><List items={s.continuity_risks} /></div>}
                    </div>
                    <Validation v={s.validation} />
                    <button className="btn-primary mt-4 self-start" onClick={() => setDevelop({ scenario: s, itemId: out.id })}>Develop This Scenario</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "whatif" && (
        <div className="space-y-5">
          <Section title="What if…?">
            <Presets items={["What if this character betrays the protagonist?", "What if the secret is revealed now?", "What if these two characters meet again?", "What if the protagonist makes the wrong decision?", "What if the antagonist wins?", "What if the story takes a darker direction?", "What if I want a surprising but believable twist?"]} />
            <textarea className="input mt-3 min-h-[80px]" placeholder="Ask your own “What if…?”" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <button className="btn-gold mt-3" disabled={busy || !question.trim() || !data.ai.enabled} onClick={() => run({ action: "whatif", question, anchorId: sp.get("anchor") })}>{busy && <Spinner />} Explore</button>
          </Section>
          <ErrorBox error={err} />
          {busy && <Working label="Exploring the consequences…" />}
          {out?.premise && (
            <div className="space-y-4">
              <Notice tone="warn"><strong>Hypothetical.</strong> {out.note}</Notice>
              <Section title={out.premise}>
                <KV k="Plausibility" v={out.plausibility} />
                <div className="py-2"><div className="label">Established facts involved</div><List items={out.established_facts_involved} /></div>
                <h4 className="eyebrow mt-3">Effects</h4>
                <KV k="Relationships" v={out.effects.relationships} /><KV k="Existing conflicts" v={out.effects.conflicts} /><KV k="The plot" v={out.effects.plot} /><KV k="The timeline" v={out.effects.timeline} /><KV k="Future chapters" v={out.effects.future_chapters} /><KV k="The ending" v={out.effects.ending} />
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div><div className="label">Earlier passages that would need revising</div><List items={out.required_changes} /></div>
                  <div><div className="label">Ways to make it work</div><List items={out.ways_to_make_it_work} /></div>
                  <div><div className="label">Opportunities</div><List items={out.opportunities} /></div>
                  <div><div className="label">Risks</div><List items={out.risks} /></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-primary btn-sm" onClick={() => setDevelop({ scenario: `${out.premise}\n${out.effects.plot}` })}>Write it as a draft</button>
                  <Link className="btn-outline btn-sm" href={`/app/m/${id}/branches?new=${encodeURIComponent(out.premise)}`}>Explore it in a story branch</Link>
                </div>
              </Section>
            </div>
          )}
        </div>
      )}

      {tab === "stuck" && (
        <div className="space-y-5">
          <Section title="I'm stuck">
            <p className="mb-2 text-sm text-navy-600">Describe the problem in your own words.</p>
            <Presets items={["I don't know how to get my protagonist out of this situation.", "I want these two characters to reconcile, but I don't know how.", "I need a shocking development, but I don't want it to feel forced.", "I don't know how to move from this conversation into the next scene.", "I want the antagonist to become more threatening."]} />
            <textarea className="input mt-3 min-h-[100px]" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What are you struggling with?" />
            <label className="mt-2 flex items-center gap-2 text-xs text-navy-600"><input type="checkbox" checked={!!anchor} onChange={(e) => setAnchor(e.target.checked ? anchor ?? "" : null)} /> Use the passage at my chosen continuation point as context</label>
            {anchor !== null && <div className="mt-2"><AnchorPicker msId={id} chapters={chapters} value={anchor || null} onChange={(p) => setAnchor(p)} /></div>}
            <button className="btn-gold mt-3" disabled={busy || !question.trim() || !data.ai.enabled} onClick={() => run({ action: "stuck", problem: question, anchorId: anchor || null })}>{busy && <Spinner />} Help me</button>
          </Section>
          <ErrorBox error={err} />
          {busy && <Working label="Thinking it through with your story in mind…" />}
          {out?.solutions && (
            <div className="space-y-4">
              <Section title="What's really going on"><p className="text-sm text-navy-800">{out.understanding}</p><div className="mt-2"><div className="label">Relevant story context</div><List items={out.relevant_context} /></div></Section>
              <div className="grid gap-4 md:grid-cols-2">
                {out.solutions.map((s: any, i: number) => (
                  <div key={i} className="card p-5">
                    <div className="eyebrow">Option {i + 1}</div>
                    <h3 className="h-display text-xl">{s.title}</h3>
                    <p className="mt-1 text-sm text-navy-800">{s.approach}</p>
                    <KV k="Uses your story" v={s.how_it_uses_the_story} /><KV k="For example" v={s.example} /><KV k="Pros" v={s.pros} /><KV k="Cons" v={s.cons} />
                    <button className="btn-outline btn-sm mt-3" onClick={() => setDevelop({ scenario: `${s.title}: ${s.approach}\nExample: ${s.example}` })}>Develop this</button>
                  </div>
                ))}
              </div>
              <Section title="Craft tips"><List items={out.craft_tips} /></Section>
            </div>
          )}
        </div>
      )}

      {tab === "plan" && (
        <div className="space-y-5">
          <Section title="Long-term story planning">
            <Presets items={["What should happen in the next chapter?", "How can I develop the central conflict?", "What should the protagonist do next?", "How can I create a satisfying ending?", "What should happen before the climax?", "How can I connect these two subplots?", "Which unresolved storyline should I address next?"]} />
            <textarea className="input mt-3 min-h-[80px]" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a planning question" />
            <button className="btn-gold mt-3" disabled={busy || !question.trim() || !data.ai.enabled} onClick={() => run({ action: "plan", question })}>{busy && <Spinner />} Plan</button>
          </Section>
          <ErrorBox error={err} />
          {busy && <Working label="Considering the whole structure of your book…" />}
          {out?.answer && (
            <div className="space-y-4">
              <Section title="Answer"><p className="whitespace-pre-line text-sm leading-relaxed text-navy-800">{out.answer}</p></Section>
              <div className="grid gap-4 md:grid-cols-2">{out.options.map((o: any, i: number) => <div key={i} className="card p-5"><h3 className="h-display text-xl">{o.title}</h3><p className="mt-1 text-sm text-navy-800">{o.description}</p><KV k="Builds on" v={o.builds_on} /><KV k="Structural role" v={o.structural_role} /><button className="btn-outline btn-sm mt-3" onClick={() => setDevelop({ scenario: `${o.title}: ${o.description}` })}>Develop this</button></div>)}</div>
              <div className="grid gap-4 md:grid-cols-2"><Section title="Threads to address"><List items={out.threads_to_address} /></Section><Section title="Cautions"><List items={out.cautions} /></Section></div>
            </div>
          )}
        </div>
      )}

      {tab === "future" && (
        <div className="space-y-5">
          <Section title="Future Chapter Planner">
            <p className="mb-3 text-sm text-navy-600">A flexible possible structure for your next chapters — character developments, conflicts, revelations and turning points that grow from what you've written. Not a rigid outline.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="label">Start at chapter</label><input className="input" type="number" min={1} value={future.from || lastNum + 1} onChange={(e) => setFuture({ ...future, from: +e.target.value })} /></div>
              <div><label className="label">Number of chapters</label><input className="input" type="number" min={3} max={15} value={future.count} onChange={(e) => setFuture({ ...future, count: +e.target.value })} /></div>
              <div><label className="label">Direction (optional)</label><input className="input" placeholder="e.g. build to a betrayal" value={future.direction} onChange={(e) => setFuture({ ...future, direction: e.target.value })} /></div>
            </div>
            <button className="btn-gold mt-3" disabled={busy || !data.ai.enabled} onClick={() => run({ action: "future", from: future.from || lastNum + 1, count: future.count, direction: future.direction })}>{busy && <Spinner />} Plan chapters {future.from || lastNum + 1}–{(future.from || lastNum + 1) + future.count - 1}</button>
          </Section>
          <ErrorBox error={err} />
          {busy && <Working label="Sketching the next stretch of your book…" />}
          {out?.chapters && (
            <div className="space-y-4">
              <Notice>{out.note}</Notice>
              <Section title="Overview"><p className="text-sm text-navy-800">{out.overview}</p></Section>
              <ol className="relative space-y-4 border-l-2 border-gold-300 pl-6">
                {out.chapters.map((c: any, i: number) => (
                  <li key={i} className="card p-4">
                    <span className="absolute -left-[9px] mt-1 h-4 w-4 rounded-full border-2 border-white bg-gold-500" />
                    <div className="eyebrow">Chapter {c.number}</div>
                    <h3 className="h-display text-xl">{c.working_title}</h3>
                    <p className="text-sm text-navy-700">{c.purpose}</p>
                    <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
                      <div><div className="label">Events</div><List items={c.events} /></div>
                      <div><div className="label">Character developments</div><List items={c.character_developments} /></div>
                      <div><div className="label">Conflicts</div><List items={c.conflicts} /></div>
                      <div><div className="label">Revelations</div><List items={c.revelations} /></div>
                    </div>
                    {c.turning_point && <div className="mt-2 text-sm"><strong className="text-gold-700">Turning point:</strong> {c.turning_point}</div>}
                    <button className="btn-outline btn-sm mt-3" onClick={() => setDevelop({ scenario: `Chapter ${c.number}: ${c.working_title}\nPurpose: ${c.purpose}\nEvents: ${c.events.join("; ")}\nDevelopments: ${c.character_developments.join("; ")}` })}>Draft this chapter</button>
                  </li>
                ))}
              </ol>
              <div className="grid gap-4 md:grid-cols-2"><Section title="Character arcs"><List items={out.arcs.map((a: any) => `${a.character}: ${a.trajectory}`)} /></Section><Section title="Where you could diverge"><List items={out.flexibility_notes} /></Section></div>
            </div>
          )}
        </div>
      )}

      {tab === "drafts" && (
        !drafts ? <Loading /> : !drafts.length ? <Empty title="No drafts yet">Develop a scenario to create a draft. Drafts stay separate from your manuscript until you add them.</Empty> : (
          <div className="card divide-y divide-navy-50">
            {drafts.map((d) => (
              <button key={d.id} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-navy-50/40" onClick={() => setOpenDraft(d)}>
                <span className="min-w-0"><span className="block font-serif text-lg font-semibold">{d.title}</span><span className="line-clamp-1 text-sm text-navy-500">{d.content.slice(0, 200)}</span></span>
                <span className="flex-none text-right text-xs"><span className={cx("chip", d.status === "incorporated" ? "border-emerald-200 text-emerald-700" : d.status === "discarded" ? "border-navy-100 text-navy-400" : "border-gold-200 text-gold-700")}>{d.status}</span><span className="mt-1 block text-navy-400">{ago(d.updated_at)}</span></span>
              </button>
            ))}
          </div>
        )
      )}

      {tab === "history" && (
        !history ? <Loading /> : !history.length ? <Empty title="Nothing yet" /> : (
          <div className="card divide-y divide-navy-50">
            {history.map((h) => (
              <details key={h.id} className="p-4">
                <summary className="cursor-pointer"><span className="chip mr-2 border-navy-200 text-navy-600">{h.kind}</span><span className="font-medium">{h.title}</span><span className="ml-2 text-xs text-navy-400">{ago(h.created_at)}</span></summary>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-navy-50 p-3 text-xs text-navy-700">{JSON.stringify(h.output, null, 2)}</pre>
              </details>
            ))}
          </div>
        )
      )}

      <Modal open={!!develop} onClose={() => setDevelop(null)} title="Develop This Scenario" wide>
        {develop && (
          <div className="space-y-4">
            <div className="rounded-md bg-navy-50 p-3 text-sm text-navy-700">{typeof develop.scenario === "string" ? develop.scenario : <><strong>{develop.scenario.title}.</strong> {develop.scenario.description}</>}</div>
            <Develop msId={id} scenario={develop.scenario} anchorId={anchor} chapters={chapters} creativeItemId={develop.itemId} />
          </div>
        )}
      </Modal>
      <Modal open={!!openDraft} onClose={() => { setOpenDraft(null); api(`/api/manuscripts/${id}/drafts`).then((r) => setDrafts(r.drafts)); }} title={openDraft?.title ?? "Draft"} wide>
        {openDraft && <DraftEditor msId={id} draft={openDraft} chapters={chapters} onChange={() => api(`/api/manuscripts/${id}/drafts`).then((r) => setDrafts(r.drafts))} />}
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Companion /></Suspense>;
}
