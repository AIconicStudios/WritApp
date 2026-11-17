"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { useWS } from "@/components/ws/context";
import { RelationshipMap, relType, REL_COLORS } from "@/components/ws/RelationshipMap";
import { AINeeded, cx, Empty, ErrorBox, KV, List, Loading, Notice, ScoreRing, Section, Spinner, Tabs, useToast } from "@/components/ui";

type Tab = "overview" | "characters" | "map" | "conflicts" | "plot" | "themes" | "setting" | "chapters" | "timeline";

export default function Intelligence() {
  const { id, data } = useWS();
  const { toast, node } = useToast();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [spoilers, setSpoilers] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [regen, setRegen] = useState<string | null>(null);
  const load = () => api(`/api/manuscripts/${id}/intelligence`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data?.job?.status]);

  const chTitle = useMemo(() => new Map<number, any>((d?.chapters ?? []).map((c: any) => [c.idx, c])), [d]);
  const mapData = useMemo(() => {
    if (!d) return { nodes: [], edges: [] };
    const chars = d.bibleCharacters as any[];
    const weight = (c: any) => c.data.mentions ?? c.data.appearances?.length ?? 1;
    const top = [...chars].sort((a, b) => weight(b) - weight(a)).slice(0, 22);
    const names = new Map<string, string>();
    for (const c of top) {
      names.set(c.name.toLowerCase(), c.id);
      for (const a of c.data.aliases ?? []) names.set(String(a).toLowerCase(), c.id);
      names.set(c.name.split(" ")[0].toLowerCase(), names.get(c.name.split(" ")[0].toLowerCase()) ?? c.id);
    }
    const edges: any[] = [];
    const seen = new Set<string>();
    for (const r of d.relationships as any[]) {
      const a = names.get(String(r.data.a ?? "").toLowerCase()) ?? names.get(String(r.data.a ?? "").split(" ")[0].toLowerCase());
      const b = names.get(String(r.data.b ?? "").toLowerCase()) ?? names.get(String(r.data.b ?? "").split(" ")[0].toLowerCase());
      if (!a || !b || a === b) continue;
      const type = r.data.type === "co-appearance" ? "co-appearance" : relType(r.data.type);
      const k = [a, b].sort().join("|") + type;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({ a, b, type, label: r.data.type === "co-appearance" ? `together in ${r.data.strength} paragraphs` : r.summary || r.data.type });
    }
    // AI character profiles' relationships too.
    for (const p of d.characters?.characters ?? []) {
      const a = names.get(p.name.toLowerCase()) ?? names.get(p.name.split(" ")[0].toLowerCase());
      for (const r of p.relationships ?? []) {
        const b = names.get(String(r.with).toLowerCase()) ?? names.get(String(r.with).split(" ")[0].toLowerCase());
        if (!a || !b || a === b) continue;
        const type = relType(r.type);
        const k = [a, b].sort().join("|") + type;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push({ a, b, type, label: r.description || r.type });
      }
    }
    return { nodes: top.map((c) => ({ id: c.id, label: c.name, weight: weight(c) })), edges };
  }, [d]);

  async function regenerate(kind: string) {
    setRegen(kind);
    try {
      await api(`/api/manuscripts/${id}/intelligence`, { body: { kind } });
      await load();
      toast("Regenerated.");
    } catch (e: any) {
      toast(e.message, "err");
    }
    setRegen(null);
  }
  if (err) return <ErrorBox error={err} />;
  if (!d || !data) return <Loading />;
  const ai = data.ai.enabled;
  const hasAny = d.summary || d.characters || d.plot;
  const Regen = ({ k }: { k: string }) => ai ? <button className="btn-ghost btn-sm" disabled={!!regen} onClick={() => regenerate(k)}>{regen === k ? <Spinner className="h-3 w-3" /> : "↻"} Regenerate</button> : null;
  const chLink = (i: number) => { const c = chTitle.get(i); return c ? <Link key={i} href={mhref(id, `/editor?chapter=${c.id}`)} className="chip border-navy-200 text-navy-700 hover:border-gold-400">{c.number != null ? `Ch. ${c.number}` : c.title}</Link> : null; };
  const selChar = d.bibleCharacters.find((c: any) => c.id === sel);
  const selProfile = selChar && d.characters?.characters?.find((p: any) => p.name.toLowerCase() === selChar.name.toLowerCase() || p.name.split(" ")[0].toLowerCase() === selChar.name.split(" ")[0].toLowerCase());

  return (
    <div>
      {node}
      {!hasAny && (ai ? <Notice tone="gold" className="mb-4">Story Intelligence is built during a <strong>Developmental Edit</strong> or <strong>Full Editorial Review</strong>. <Link className="underline" href={mhref(id)}>Run one from the Overview</Link>. Built-in character data is shown below.</Notice> : <div className="mb-4"><AINeeded feature="Story Intelligence (summaries, profiles, conflicts, plot and themes)" /></div>)}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Dashboard" }, { id: "characters", label: "Characters", count: d.bibleCharacters.length }, { id: "map", label: "Relationship Map" }, { id: "conflicts", label: "Conflicts", count: d.conflicts?.conflicts?.length }, { id: "plot", label: "Plot" }, { id: "themes", label: "Themes & Symbols" }, { id: "setting", label: "Setting & World" }, { id: "chapters", label: "Chapter Intelligence" }, { id: "timeline", label: "Timeline", count: d.timeline?.events?.length }]} />

      {tab === "overview" && (
        <div className="space-y-6">
          <Section title="Synopsis" actions={<div className="flex items-center gap-2"><label className="flex items-center gap-1.5 text-xs text-navy-600"><input type="checkbox" checked={!spoilers} onChange={(e) => setSpoilers(!e.target.checked)} /> Spoiler-free</label><Regen k="summary" /></div>}>
            {d.summary ? (
              <div className="space-y-4">
                <p className="font-book text-[16px] leading-relaxed text-navy-900">{spoilers ? d.summary.short : d.summary.short_spoiler_free}</p>
                <details><summary className="cursor-pointer text-sm font-medium text-navy-700">Detailed summary</summary><p className="mt-2 whitespace-pre-line font-book leading-relaxed text-navy-800">{spoilers ? d.summary.detailed : d.summary.detailed_spoiler_free}</p></details>
              </div>
            ) : <p className="text-sm italic text-navy-400">Not generated yet.</p>}
          </Section>
          {d.summary && (
            <div className="grid gap-6 md:grid-cols-2">
              <Section title="Story at a glance">
                <KV k="Central storyline" v={d.summary.central_storyline} />
                <KV k="Central conflict" v={d.summary.central_conflict} />
                {spoilers && <KV k="Resolution" v={d.summary.resolution} />}
                <KV k="Main message" v={d.summary.main_message} />
                <KV k="Emotional journey" v={d.summary.emotional_journey} />
              </Section>
              {spoilers && <Section title="Beginning · Middle · Ending"><KV k="Beginning" v={d.summary.beginning} /><KV k="Middle" v={d.summary.middle} /><KV k="Ending" v={d.summary.ending} /></Section>}
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-3">
            <Section title="Main characters">
              <div className="space-y-2">{(d.characters?.characters ?? d.bibleCharacters).slice(0, 6).map((c: any) => <button key={c.name} onClick={() => { const b = d.bibleCharacters.find((x: any) => x.name === c.name || x.name.split(" ")[0] === c.name.split(" ")[0]); setSel(b?.id ?? null); setTab("characters"); }} className="block w-full rounded-md bg-navy-50 px-3 py-2 text-left text-sm hover:bg-navy-100"><span className="font-medium">{c.name}</span><span className="block truncate text-xs text-navy-500">{c.role ?? c.summary ?? `${c.data?.mentions ?? ""} mentions`}</span></button>)}</div>
            </Section>
            <Section title="Themes"><div className="flex flex-wrap gap-1.5">{(d.themes?.main?.map((t: any) => t.theme) ?? d.summary?.themes ?? []).map((t: string) => <span key={t} className="chip border-gold-200 bg-gold-50 text-gold-700">{t}</span>)}{!d.themes && !d.summary && <span className="text-sm italic text-navy-400">Not generated.</span>}</div></Section>
            <Section title="Unresolved storylines"><List items={d.plot?.unresolved} empty={d.plot ? "None identified." : "Not generated."} /></Section>
          </div>
          {d.plot && (
            <Section title="Major turning points">
              <ol className="relative space-y-3 border-l-2 border-gold-300 pl-5">{d.plot.stages.map((s: any, i: number) => <li key={i}><span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-gold-500" /><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-navy-900">{s.stage}</span>{s.chapters.map(chLink)}</div><p className="text-sm text-navy-600">{s.description}</p></li>)}</ol>
            </Section>
          )}
          <Section title="Secondary conflicts & subplots">
            <div className="grid gap-4 md:grid-cols-2">
              <div><h4 className="label">Conflicts</h4><List items={d.conflicts?.conflicts?.filter((c: any) => !c.central).map((c: any) => `${c.title} (${c.type})`)} empty={d.conflicts ? "None." : "Not generated."} /></div>
              <div><h4 className="label">Subplots</h4><List items={d.plot?.subplots?.map((s: any) => `${s.name}: ${s.description}`)} empty={d.plot ? "None." : "Not generated."} /></div>
            </div>
          </Section>
        </div>
      )}

      {tab === "characters" && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-sm text-navy-500">{d.bibleCharacters.length} characters</span><Regen k="characters" /></div>
            {d.bibleCharacters.map((c: any) => (
              <button key={c.id} onClick={() => setSel(c.id)} className={cx("card block w-full p-3 text-left transition", sel === c.id ? "border-gold-400 ring-2 ring-gold-200" : "hover:border-navy-300")}>
                <div className="flex items-center justify-between"><span className="font-serif text-lg font-semibold">{c.name}</span>{c.data.classification && <span className="chip border-navy-200 capitalize text-navy-500">{c.data.classification}</span>}</div>
                <div className="truncate text-xs text-navy-500">{c.summary || c.data.role || `${c.data.mentions ?? "?"} mentions · chapters ${(c.data.appearances ?? []).length}`}</div>
                {c.data.flags?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{c.data.flags.map((f: string) => <span key={f} className="chip border-orange-200 bg-orange-50 text-orange-700">{f}</span>)}</div>}
              </button>
            ))}
          </div>
          <div>{selChar ? <CharacterProfile msId={id} c={selChar} p={selProfile} chLink={chLink} relationships={d.relationships} /> : <Empty title="Select a character">Choose a character to see their full profile, relationships and appearances.</Empty>}</div>
        </div>
      )}

      {tab === "map" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Section title="Character relationship map"><RelationshipMap nodes={mapData.nodes} edges={mapData.edges} selected={sel} onSelect={setSel} /><p className="mt-2 text-xs text-navy-400">Hover a character to highlight their connections; click to open the profile. Dashed lines show characters who share scenes (a built-in, grounded signal); solid lines are relationships identified in the text.</p></Section>
          <div>{selChar ? <CharacterProfile msId={id} c={selChar} p={selProfile} chLink={chLink} relationships={d.relationships} compact /> : <Notice>Click a character on the map.</Notice>}</div>
        </div>
      )}

      {tab === "conflicts" && (
        !d.conflicts ? <Empty title="Conflict analysis not generated">{ai ? "Run a Developmental Edit or regenerate." : "Requires an AI model."}{ai && <div className="mt-3"><Regen k="conflicts" /></div>}</Empty> : (
          <div className="space-y-4">
            <div className="flex justify-end"><Regen k="conflicts" /></div>
            {[...d.conflicts.conflicts].sort((a: any, b: any) => Number(b.central) - Number(a.central)).map((c: any, i: number) => (
              <Section key={i} title={c.title} actions={<span className={cx("chip", c.central ? "border-gold-300 bg-gold-100 text-gold-700" : "border-navy-200 text-navy-500")}>{c.central ? "Central conflict" : "Secondary"} · {c.type}</span>}>
                <div className="grid gap-x-8 md:grid-cols-2">
                  <div><KV k="Who is involved" v={c.involved.join(", ")} /><KV k="Cause" v={c.cause} /><KV k="What each side wants" v={c.wants} /><KV k="Stakes" v={c.stakes} /><KV k="Development" v={c.development} /></div>
                  <div><KV k="Resolution" v={c.resolution} /><KV k="Convincing?" v={c.convincing} /><KV k="How to strengthen it" v={c.strengthen} /><div className="py-2"><div className="label">Turning points</div><List items={c.turning_points} /></div><div className="flex flex-wrap gap-1">{c.chapters.map(chLink)}</div></div>
                </div>
              </Section>
            ))}
          </div>
        )
      )}

      {tab === "plot" && (
        !d.plot ? <Empty title="Plot analysis not generated">{ai ? <Regen k="plot" /> : "Requires an AI model."}</Empty> : (
          <div className="space-y-6">
            <Section title="Narrative structure" actions={<Regen k="plot" />}>
              <p className="mb-4 text-sm text-navy-700">{d.plot.structure_note}</p>
              <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
                {d.plot.stages.map((s: any, i: number) => (
                  <div key={i} className="w-60 flex-none rounded-lg border border-navy-100 bg-white p-3">
                    <div className="eyebrow">{i + 1}. {s.stage}</div>
                    <div className="my-1.5 flex flex-wrap gap-1">{s.chapters.map(chLink)}</div>
                    <p className="text-xs leading-relaxed text-navy-600">{s.description}</p>
                  </div>
                ))}
              </div>
            </Section>
            <div className="grid gap-6 md:grid-cols-2">
              <Section title="Subplots">{d.plot.subplots.length ? d.plot.subplots.map((s: any, i: number) => <div key={i} className="mb-3"><div className="font-medium">{s.name}</div><p className="text-sm text-navy-600">{s.description}</p><p className="text-xs text-navy-500">Connection: {s.connected_to_main} · Resolved: {s.resolved}</p><div className="mt-1 flex flex-wrap gap-1">{s.chapters.map(chLink)}</div></div>) : <p className="text-sm italic text-navy-400">None identified.</p>}</Section>
              <Section title="Story arcs"><List items={d.plot.arcs.map((a: any) => `${a.name}: ${a.description}`)} /></Section>
              <Section title="Plot twists & reveals"><List items={[...d.plot.twists, ...d.plot.reveals]} /></Section>
              <Section title="Foreshadowing & suspense"><List items={[...d.plot.foreshadowing, ...d.plot.suspense]} /></Section>
              <Section title="Plot holes"><List items={d.plot.plot_holes} /></Section>
              <Section title="Weak coincidences"><List items={d.plot.weak_coincidences} /></Section>
            </div>
            <Section title="Unresolved storylines"><List items={d.plot.unresolved} /></Section>
          </div>
        )
      )}

      {tab === "themes" && (
        !d.themes ? <Empty title="Theme analysis not generated">{ai ? <Regen k="themes" /> : "Requires an AI model."}</Empty> : (
          <div className="space-y-6">
            <Section title="Main themes" actions={<Regen k="themes" />}>{d.themes.main.map((t: any, i: number) => <div key={i} className="mb-3"><div className="font-serif text-lg font-semibold">{t.theme}</div><p className="text-sm text-navy-700">{t.how}</p><div className="mt-1 flex flex-wrap gap-1">{t.chapters.map(chLink)}</div></div>)}</Section>
            <div className="grid gap-6 md:grid-cols-2">
              <Section title="Secondary themes"><List items={d.themes.secondary.map((t: any) => `${t.theme}: ${t.how}`)} /></Section>
              <Section title="Symbols">{d.themes.symbols.length ? d.themes.symbols.map((s: any, i: number) => <div key={i} className="mb-2 text-sm"><span className="font-medium">{s.symbol}</span> — {s.meaning} <span className="inline-flex flex-wrap gap-1">{s.chapters.map(chLink)}</span></div>) : <p className="text-sm italic text-navy-400">None identified.</p>}</Section>
              <Section title="Motifs & metaphors"><List items={[...d.themes.motifs, ...d.themes.metaphors]} /></Section>
              <Section title="Recurring ideas"><List items={d.themes.recurring_ideas} /></Section>
              <Section title="Moral & philosophical questions"><List items={[...d.themes.moral_questions, ...d.themes.philosophical_questions]} /></Section>
              <Section title="Social commentary & cultural references"><List items={[...d.themes.social_commentary, ...d.themes.cultural_references]} /></Section>
            </div>
            <Section title="Themes introduced but not sufficiently developed"><List items={d.themes.underdeveloped} /></Section>
          </div>
        )
      )}

      {tab === "setting" && (
        <div className="space-y-6">
          {d.setting ? (
            <>
              <Section title="Setting & world" actions={<Regen k="setting" />}>
                <KV k="Time period" v={d.setting.time_period} /><KV k="Historical context" v={d.setting.historical_context} /><KV k="Social environment" v={d.setting.social_environment} /><KV k="Cultural environment" v={d.setting.cultural_environment} /><KV k="How the setting shapes the story" v={d.setting.influence} />
              </Section>
              <div className="grid gap-6 md:grid-cols-2">
                <Section title="Important locations">{d.setting.locations.map((l: any, i: number) => <div key={i} className="mb-2 text-sm"><span className="font-medium">{l.name}</span> — {l.significance} <span className="inline-flex flex-wrap gap-1">{l.chapters.map(chLink)}</span></div>)}</Section>
                <Section title="Rules of the world"><List items={d.setting.world_rules} /></Section>
              </div>
              <Section title="Geography, time & world-building inconsistencies"><List items={d.setting.inconsistencies} /></Section>
            </>
          ) : (
            <>
              {ai ? <Empty title="Setting analysis not generated"><Regen k="setting" /></Empty> : <AINeeded feature="Setting & world analysis" />}
              {d.locations.length > 0 && <Section title="Locations detected in the text">{d.locations.map((l: any) => <div key={l.id} className="mb-1 text-sm"><span className="font-medium">{l.name}</span>{l.summary && ` — ${l.summary}`} <span className="inline-flex flex-wrap gap-1">{(l.data.appearances ?? []).slice(0, 8).map(chLink)}</span></div>)}</Section>}
            </>
          )}
        </div>
      )}

      {tab === "chapters" && (
        <div className="space-y-3">
          {d.chapters.map((c: any) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start gap-4">
                <ScoreRing score={c.score} size={44} />
                <div className="min-w-0 flex-1">
                  <Link href={mhref(id, `/editor?chapter=${c.id}`)} className="font-serif text-lg font-semibold hover:underline">{c.title}</Link>
                  <p className="mt-1 text-sm leading-relaxed text-navy-700">{c.intel?.summary ?? <span className="italic text-navy-400">Not summarised yet.</span>}</p>
                  {c.intel && (
                    <div className="mt-2 grid gap-3 text-xs text-navy-600 md:grid-cols-3">
                      {c.intel.characters?.length > 0 && <div><span className="label">Characters</span>{c.intel.characters.join(", ")}</div>}
                      {c.intel.events?.length > 0 && <div><span className="label">Events</span>{c.intel.events.slice(0, 4).map((e: any) => e.title).join(" · ")}</div>}
                      {c.intel.revelations?.length > 0 && <div><span className="label">Revelations</span>{c.intel.revelations.join(" · ")}</div>}
                      {c.intel.conflicts?.length > 0 && <div><span className="label">Conflicts</span>{c.intel.conflicts.map((x: any) => x.description).join(" · ")}</div>}
                      {c.intel.themes?.length > 0 && <div><span className="label">Themes</span>{c.intel.themes.join(", ")}</div>}
                      {c.intel.unresolved?.length > 0 && <div><span className="label">Unresolved questions</span>{c.intel.unresolved.join(" · ")}</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "timeline" && (
        !d.timeline?.events?.length ? <Empty title="No timeline yet">{ai ? "The story timeline is built from events identified during a Developmental Edit or Full Review." : "Requires an AI reading of the story."}</Empty> : (
          <Section title="Story timeline (narrative order)">
            <ol className="relative space-y-4 border-l-2 border-navy-200 pl-6">
              {d.timeline.events.map((e: any) => (
                <li key={e.id}>
                  <span className={cx("absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white", e.importance === "major" ? "bg-gold-500" : "bg-navy-300")} />
                  <div className="flex flex-wrap items-center gap-2">{chLink(e.chapterIdx)}<span className="font-medium text-navy-900">{e.title}</span>{e.when && <span className="text-xs text-gold-700">{e.when}</span>}</div>
                  {e.description && <p className="text-sm text-navy-600">{e.description}</p>}
                  {e.refs?.[0]?.quote && <Link href={mhref(id, `/editor?chapter=${e.refs[0].chapterId}&para=${e.refs[0].paragraphId}`)} className="mt-0.5 block font-book text-xs italic text-navy-500 hover:text-navy-800">“{e.refs[0].quote}”</Link>}
                </li>
              ))}
            </ol>
          </Section>
        )
      )}
    </div>
  );
}

function CharacterProfile({ msId, c, p, chLink, relationships, compact }: { msId: string; c: any; p: any; chLink: (i: number) => React.ReactNode; relationships: any[]; compact?: boolean }) {
  const rels = relationships.filter((r) => [r.data.a, r.data.b].some((n: string) => n && (n === c.name || n.split(" ")[0] === c.name.split(" ")[0])) && r.data.type !== "co-appearance");
  const f = (k: string, label: string) => (p?.[k] ?? c.data[k]) ? <KV k={label} v={p?.[k] ?? c.data[k]} /> : null;
  return (
    <div className="card p-5">
      <div className="eyebrow">{p?.classification ?? c.data.classification ?? "Character"}</div>
      <h2 className="h-display text-3xl">{c.name}</h2>
      {(c.data.aliases?.length ?? 0) > 0 && <div className="text-xs text-navy-500">Also called: {c.data.aliases.join(", ")}</div>}
      <p className="mt-2 text-sm text-navy-700">{p?.role ?? c.summary ?? c.data.role}</p>
      <div className="mt-3">
        {f("physical", "Physical description")}
        {f("personality", "Personality")}
        {!p && c.data.traits?.length > 0 && <KV k="Traits shown" v={c.data.traits.join(", ")} />}
        {!compact && <>{f("background", "Background & history")}{f("motivations", "Motivations")}{f("goals", "Goals & desires")}{f("fears", "Fears & weaknesses")}{f("strengths", "Strengths")}{p ? <><KV k="Internal struggles" v={p.internal_struggles} /><KV k="External struggles" v={p.external_struggles} /></> : null}{f("development", "Character development")}{f("change", "How they change")}{p ? <KV k="Contribution to the plot" v={p.plot_contribution} /> : f("contribution", "Contribution to the plot")}{f("fate", "Fate / conclusion")}</>}
      </div>
      {p?.flags?.length > 0 && <div className="mt-3"><div className="label">Editorial flags</div><div className="flex flex-wrap gap-1">{p.flags.map((x: string) => <span key={x} className="chip border-orange-200 bg-orange-50 text-orange-700">{x}</span>)}</div></div>}
      <div className="mt-4"><div className="label">Relationships</div>
        {(p?.relationships?.length ?? 0) > 0 ? <ul className="space-y-1 text-sm">{p.relationships.map((r: any, i: number) => <li key={i}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: REL_COLORS[relType(r.type)] }} /><strong>{r.with}</strong> — {r.type}{r.description ? `: ${r.description}` : ""}</li>)}</ul>
          : rels.length ? <ul className="space-y-1 text-sm">{rels.map((r) => <li key={r.id}>{r.name}{r.summary ? ` — ${r.summary}` : ""}</li>)}</ul> : <p className="text-sm italic text-navy-400">None identified.</p>}
      </div>
      <div className="mt-4"><div className="label">Appearances</div><div className="flex flex-wrap gap-1">{(c.data.appearances ?? []).map(chLink)}</div></div>
      {c.refs?.length > 0 && <div className="mt-4"><div className="label">In the text</div>{c.refs.slice(0, compact ? 2 : 5).map((r: any, i: number) => <Link key={i} href={mhref(msId, `/editor?chapter=${r.chapterId}&para=${r.paragraphId}`)} className="mb-1 block rounded bg-navy-50 px-2 py-1 font-book text-xs italic text-navy-700 hover:bg-navy-100">“{r.quote}” <span className="not-italic text-navy-400">— {r.label}</span></Link>)}</div>}
      <Link href={mhref(msId, `/bible?section=characters&focus=${encodeURIComponent(c.name)}`)} className="btn-outline btn-sm mt-4">Edit in Story Bible</Link>
    </div>
  );
}
