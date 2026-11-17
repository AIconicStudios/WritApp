import { db, json } from "../db";
import type { ManuscriptRow, IssueRow, Ref } from "../types";
import { BIBLE_SECTIONS } from "../types";
import { bibleEntries, getAnalysis, getChapters } from "../repo";
import { SCORE_LABELS } from "../engine/scoring";
import type { RBlock, RDoc } from "./model";

const na = "Not available — generate it from the Story Intelligence page (requires an AI provider).";

function meta(ms: ManuscriptRow) {
  return [`${ms.title}${ms.author ? ` by ${ms.author}` : ""}`, `${ms.word_count.toLocaleString()} words${ms.genre ? ` · ${ms.genre}` : ""}`, `Generated ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`];
}

const chTitle = (ms: ManuscriptRow) => {
  const m = new Map(getChapters(ms.id).map((c) => [c.id, c.title]));
  const byIdx = new Map(getChapters(ms.id).map((c) => [c.idx, c.title]));
  return { byId: (id?: string | null) => (id ? m.get(id) ?? "" : ""), byIdx: (i: number) => byIdx.get(i) ?? `Chapter index ${i}` };
};

function issueBlocks(ms: ManuscriptRow, rows: IssueRow[], limit = 400): RBlock[] {
  const ct = chTitle(ms);
  const paraIdx = db().prepare("SELECT idx FROM paragraphs WHERE id = ?");
  return rows.slice(0, limit).map((i) => {
    const p = i.paragraph_id ? (paraIdx.get(i.paragraph_id) as { idx: number } | undefined) : undefined;
    return { t: "issue", severity: i.severity, category: i.category, where: [ct.byId(i.chapter_id) || "Whole manuscript", p ? `paragraph ${p.idx + 1}` : ""].filter(Boolean).join(", "), original: i.original_text, explanation: i.explanation, suggestion: i.revised_text ?? i.suggestion, reason: i.reason, objective: !!i.objective };
  });
}

export function editorialReport(ms: ManuscriptRow, includeIssues = true): RDoc {
  const r = getAnalysis<any>(ms.id, "report");
  const blocks: RBlock[] = [];
  if (!r) return { title: "Editorial Assessment Report", subtitle: ms.title, meta: meta(ms), blocks: [{ t: "p", text: "No analysis has been run yet." }] };
  blocks.push({ t: "h1", text: "Editorial verdict" });
  blocks.push({ t: "p", text: r.verdict });
  blocks.push({ t: "small", text: `Mode: ${r.mode}. ${r.aiUsed ? `AI model: ${r.model}.` : "Built-in engine only (no AI model connected)."}` });
  blocks.push({ t: "h1", text: "Scores" });
  for (const k of Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]) {
    const s = r.scores?.[k];
    if (s) blocks.push({ t: "score", label: SCORE_LABELS[k] + (s.basis === "ai" ? " (AI assessment)" : s.basis === "measured" ? " (measured)" : ""), score: s.score, text: s.explanation });
  }
  const list = (title: string, items?: string[]) => {
    if (items?.length) {
      blocks.push({ t: "h2", text: title });
      blocks.push({ t: "bullets", items });
    }
  };
  blocks.push({ t: "h1", text: "Assessment" });
  list("Strengths", r.strengths);
  list("Major weaknesses", r.majorWeaknesses);
  list("Minor weaknesses", r.minorWeaknesses);
  list("Critical corrections required", r.criticalCorrections);
  list("Recommended improvements", r.recommendations);
  if (r.opening) blocks.push({ t: "h2", text: "Opening" }, { t: "p", text: r.opening });
  if (r.ending) blocks.push({ t: "h2", text: "Ending" }, { t: "p", text: r.ending });
  const pub = getAnalysis<any>(ms.id, "publication");
  if (pub) {
    blocks.push({ t: "h1", text: "Publication readiness" });
    for (const t of pub.targets) blocks.push({ t: "h3", text: `${t.name}: ${t.status.replace("_", " ")}` }, { t: "bullets", items: t.notes });
    blocks.push({ t: "small", text: pub.disclaimer });
  }
  blocks.push({ t: "h1", text: "Manuscript statistics" });
  const m = r.metrics;
  blocks.push({ t: "kv", items: [["Words", m.words.toLocaleString()], ["Sentences", m.sentences.toLocaleString()], ["Average sentence", `${m.avgSentence} words`], ["Dialogue", `${m.dialoguePct}%`], ["Flesch reading ease", String(m.fleschEase)], ["Grade level", String(m.fkGrade)], ["Open findings", `${r.counts.open} (${r.counts.critical} critical, ${r.counts.major} major, ${r.counts.moderate} moderate, ${r.counts.minor} minor)`], ["Objective errors / recommendations", `${r.counts.objective} / ${r.counts.subjective}`]] });
  blocks.push({ t: "h2", text: "Chapter scores" });
  const chs = getChapters(ms.id).filter((c) => c.kind === "chapter");
  blocks.push({ t: "kv", items: chs.map((c) => [c.title, `${c.score ?? "–"}/100 · ${c.word_count.toLocaleString()} words`]) });
  blocks.push({ t: "h2", text: "Limitations" });
  blocks.push({ t: "bullets", items: r.limitations });
  if (includeIssues) {
    const rows = db().prepare("SELECT * FROM issues WHERE manuscript_id = ? AND status = 'open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END, stage, chapter_id").all(ms.id) as IssueRow[];
    blocks.push({ t: "pagebreak" }, { t: "h1", text: `Detailed findings (${rows.length})` });
    if (rows.length > 400) blocks.push({ t: "small", text: `Showing the 400 most severe of ${rows.length} findings. The complete list is in the revision workspace.` });
    blocks.push(...issueBlocks(ms, rows));
  }
  return { title: "Editorial Assessment Report", subtitle: ms.title, meta: meta(ms), blocks };
}

export function bookSummaryReport(ms: ManuscriptRow, spoilers = true): RDoc {
  const s = getAnalysis<any>(ms.id, "summary");
  const b: RBlock[] = [];
  if (!s) b.push({ t: "p", text: na });
  else {
    b.push({ t: "h1", text: "Short summary" }, { t: "p", text: spoilers ? s.short : s.short_spoiler_free });
    b.push({ t: "h1", text: "Detailed summary" }, { t: "p", text: spoilers ? s.detailed : s.detailed_spoiler_free });
    if (spoilers) {
      b.push({ t: "h1", text: "Beginning, middle and ending" }, { t: "h3", text: "Beginning" }, { t: "p", text: s.beginning }, { t: "h3", text: "Middle" }, { t: "p", text: s.middle }, { t: "h3", text: "Ending" }, { t: "p", text: s.ending });
      b.push({ t: "h1", text: "Story at a glance" }, { t: "kv", items: [["Central storyline", s.central_storyline], ["Main message", s.main_message], ["Central conflict", s.central_conflict], ["Resolution", s.resolution], ["Emotional journey", s.emotional_journey]] });
    }
    b.push({ t: "h2", text: "Major themes" }, { t: "bullets", items: s.themes }, { t: "h2", text: "Underlying ideas" }, { t: "bullets", items: s.underlying_ideas });
  }
  return { title: spoilers ? "Complete Book Summary" : "Book Summary (spoiler-free)", subtitle: ms.title, meta: meta(ms), blocks: b };
}

export function charactersReport(ms: ManuscriptRow): RDoc {
  const c = getAnalysis<any>(ms.id, "characters");
  const b: RBlock[] = [];
  if (c) {
    for (const p of c.characters) {
      b.push({ t: "h1", text: p.name }, { t: "small", text: `${p.classification} · ${p.role}` });
      b.push({ t: "kv", items: [["Physical description", p.physical], ["Personality", p.personality], ["Background", p.background], ["Motivations", p.motivations], ["Goals & desires", p.goals], ["Fears & weaknesses", p.fears], ["Strengths", p.strengths], ["Internal struggles", p.internal_struggles], ["External struggles", p.external_struggles], ["Development", p.development], ["How they change", p.change], ["Contribution to the plot", p.plot_contribution], ["Fate", p.fate]] });
      if (p.relationships?.length) b.push({ t: "h3", text: "Relationships" }, { t: "bullets", items: p.relationships.map((r: any) => `${r.with} — ${r.type}${r.description ? ": " + r.description : ""}`) });
      if (p.flags?.length) b.push({ t: "h3", text: "Editorial flags" }, { t: "bullets", items: p.flags });
    }
    if (c.ensemble_notes?.length) b.push({ t: "h1", text: "Notes on the cast" }, { t: "bullets", items: c.ensemble_notes });
  } else {
    b.push({ t: "small", text: "AI character profiles have not been generated; showing the built-in character index." });
    for (const e of bibleEntries(ms.id, "characters")) {
      const d = json<any>(e.data_json, {});
      b.push({ t: "h2", text: e.name }, { t: "kv", items: [["Mentions", String(d.mentions ?? "–")], ["Appears in chapters", (d.appearances ?? []).map((i: number) => i).join(", ")], ["Also called", (d.aliases ?? []).join(", ") || "—"]] });
    }
  }
  return { title: "Character Analysis", subtitle: ms.title, meta: meta(ms), blocks: b };
}

export function conflictsReport(ms: ManuscriptRow): RDoc {
  const c = getAnalysis<any>(ms.id, "conflicts");
  const ct = chTitle(ms);
  const b: RBlock[] = [];
  if (!c) b.push({ t: "p", text: na });
  else
    for (const x of [...c.conflicts].sort((a: any, b: any) => Number(b.central) - Number(a.central))) {
      b.push({ t: "h1", text: x.title }, { t: "small", text: `${x.type}${x.central ? " · CENTRAL CONFLICT" : " · secondary"}` });
      b.push({ t: "kv", items: [["Who is involved", x.involved.join(", ")], ["Cause", x.cause], ["What each side wants", x.wants], ["Stakes", x.stakes], ["Development", x.development], ["Resolution", x.resolution], ["Is the resolution convincing?", x.convincing], ["How to strengthen it", x.strengthen], ["Chapters", x.chapters.map((i: number) => ct.byIdx(i)).join("; ")]] });
      if (x.turning_points.length) b.push({ t: "h3", text: "Turning points" }, { t: "bullets", items: x.turning_points });
    }
  return { title: "Conflict Analysis", subtitle: ms.title, meta: meta(ms), blocks: b };
}

export function plotReport(ms: ManuscriptRow): RDoc {
  const p = getAnalysis<any>(ms.id, "plot");
  const ct = chTitle(ms);
  const b: RBlock[] = [];
  if (!p) b.push({ t: "p", text: na });
  else {
    b.push({ t: "p", text: p.structure_note });
    b.push({ t: "h1", text: "Narrative stages" });
    for (const s of p.stages) b.push({ t: "h3", text: `${s.stage}${s.chapters.length ? " — " + s.chapters.map((i: number) => ct.byIdx(i)).join(", ") : ""}` }, { t: "p", text: s.description });
    const list = (t: string, items: string[]) => items?.length && b.push({ t: "h2", text: t }, { t: "bullets", items });
    list("Plot twists", p.twists);
    if (p.subplots.length) {
      b.push({ t: "h1", text: "Subplots" });
      for (const s of p.subplots) b.push({ t: "h3", text: s.name }, { t: "kv", items: [["Description", s.description], ["Connection to main plot", s.connected_to_main], ["Resolved", s.resolved]] });
    }
    if (p.arcs.length) b.push({ t: "h1", text: "Story arcs" }, { t: "bullets", items: p.arcs.map((a: any) => `${a.name}: ${a.description}`) });
    list("Unresolved storylines", p.unresolved);
    list("Foreshadowing", p.foreshadowing);
    list("Suspense", p.suspense);
    list("Reveals", p.reveals);
    list("Plot holes", p.plot_holes);
    list("Coincidences that weaken the story", p.weak_coincidences);
  }
  return { title: "Plot Analysis", subtitle: ms.title, meta: meta(ms), blocks: b };
}

export function chapterSummariesReport(ms: ManuscriptRow): RDoc {
  const b: RBlock[] = [];
  for (const c of getChapters(ms.id).filter((c) => c.kind === "chapter")) {
    const i = json<any>(c.intel_json, {});
    b.push({ t: "h1", text: c.title }, { t: "small", text: `${c.word_count.toLocaleString()} words${c.score != null ? ` · score ${c.score}/100` : ""}` });
    b.push({ t: "p", text: i.summary || "Not yet summarised (requires an AI provider)." });
    const kv: [string, string][] = [];
    if (i.characters?.length) kv.push(["Characters appearing", i.characters.join(", ")]);
    if (i.locations?.length) kv.push(["Locations", i.locations.join(", ")]);
    if (i.pov) kv.push(["Point of view", i.pov]);
    if (i.tone) kv.push(["Atmosphere", i.tone]);
    if (i.connection) kv.push(["Connection to the storyline", i.connection]);
    if (kv.length) b.push({ t: "kv", items: kv });
    if (i.events?.length) b.push({ t: "h3", text: "Important events" }, { t: "bullets", items: i.events.map((e: any) => e.title + (e.description ? ` — ${e.description}` : "")) });
    if (i.conflicts?.length) b.push({ t: "h3", text: "Conflicts introduced or developed" }, { t: "bullets", items: i.conflicts.map((x: any) => x.description) });
    if (i.developments?.length) b.push({ t: "h3", text: "Character developments" }, { t: "bullets", items: i.developments });
    if (i.revelations?.length) b.push({ t: "h3", text: "Revelations" }, { t: "bullets", items: i.revelations });
    if (i.themes?.length) b.push({ t: "h3", text: "Themes explored" }, { t: "bullets", items: i.themes });
    if (i.unresolved?.length) b.push({ t: "h3", text: "Unresolved questions" }, { t: "bullets", items: i.unresolved });
  }
  return { title: "Chapter-by-Chapter Summary", subtitle: ms.title, meta: meta(ms), blocks: b };
}

export function storyBibleReport(ms: ManuscriptRow): RDoc {
  const b: RBlock[] = [];
  for (const s of BIBLE_SECTIONS) {
    const rows = bibleEntries(ms.id, s.id);
    if (!rows.length) continue;
    b.push({ t: "h1", text: s.name });
    for (const r of rows) {
      const d = json<any>(r.data_json, {});
      b.push({ t: "h3", text: r.name + (r.author_locked ? " (edited by author)" : "") });
      if (r.summary) b.push({ t: "p", text: r.summary });
      const kv: [string, string][] = Object.entries(d)
        .filter(([k, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && !["detectedBy", "strength", "order", "part"].includes(k))
        .map(([k, v]) => [k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)]);
      if (kv.length) b.push({ t: "kv", items: kv.slice(0, 18) });
      const refs = json<Ref[]>(r.refs_json, []).slice(0, 2);
      for (const ref of refs) if (ref.quote) b.push({ t: "quote", text: `${ref.quote} — ${ref.label ?? ""}` });
    }
  }
  if (!b.length) b.push({ t: "p", text: "The Story Bible is empty. Run an analysis to build it." });
  return { title: "Story Bible", subtitle: ms.title, meta: meta(ms), blocks: b };
}

export function literaryReport(ms: ManuscriptRow): RDoc {
  const parts = [bookSummaryReport(ms), charactersReport(ms), conflictsReport(ms), plotReport(ms)];
  const blocks: RBlock[] = [];
  for (const p of parts) blocks.push({ t: "pagebreak" }, { t: "h1", text: p.title.toUpperCase() }, ...p.blocks);
  const th = getAnalysis<any>(ms.id, "themes");
  blocks.push({ t: "pagebreak" }, { t: "h1", text: "THEMES & SYMBOLISM" });
  if (th) {
    for (const t of th.main) blocks.push({ t: "h3", text: t.theme }, { t: "p", text: t.how });
    if (th.secondary.length) blocks.push({ t: "h2", text: "Secondary themes" }, { t: "bullets", items: th.secondary.map((t: any) => `${t.theme}: ${t.how}`) });
    if (th.symbols.length) blocks.push({ t: "h2", text: "Symbols" }, { t: "bullets", items: th.symbols.map((s: any) => `${s.symbol}: ${s.meaning}`) });
    for (const [k, label] of [["motifs", "Motifs"], ["metaphors", "Metaphors"], ["recurring_ideas", "Recurring ideas"], ["moral_questions", "Moral questions"], ["philosophical_questions", "Philosophical questions"], ["social_commentary", "Social commentary"], ["cultural_references", "Cultural references"], ["underdeveloped", "Underdeveloped themes"]] as const)
      if (th[k]?.length) blocks.push({ t: "h2", text: label }, { t: "bullets", items: th[k] });
  } else blocks.push({ t: "p", text: na });
  const st = getAnalysis<any>(ms.id, "setting");
  blocks.push({ t: "pagebreak" }, { t: "h1", text: "SETTING & WORLD" });
  if (st) {
    blocks.push({ t: "kv", items: [["Time period", st.time_period], ["Historical context", st.historical_context], ["Social environment", st.social_environment], ["Cultural environment", st.cultural_environment], ["How the setting shapes the story", st.influence]] });
    if (st.locations.length) blocks.push({ t: "h2", text: "Important locations" }, { t: "bullets", items: st.locations.map((l: any) => `${l.name}: ${l.significance}`) });
    if (st.world_rules.length) blocks.push({ t: "h2", text: "Rules of the world" }, { t: "bullets", items: st.world_rules });
    if (st.inconsistencies.length) blocks.push({ t: "h2", text: "Inconsistencies" }, { t: "bullets", items: st.inconsistencies });
  } else blocks.push({ t: "p", text: na });
  return { title: "Full Literary Analysis", subtitle: ms.title, meta: meta(ms), blocks };
}

export function publicationReport(ms: ManuscriptRow): RDoc {
  const a = getAnalysis<any>(ms.id, "publication");
  const b: RBlock[] = [];
  if (!a) b.push({ t: "p", text: "Run a Publication Audit first." });
  else {
    b.push({ t: "score", label: "Publication readiness", score: a.score, text: a.disclaimer });
    for (const t of a.targets) b.push({ t: "h2", text: `${t.name} — ${t.status.replace("_", " ")}` }, { t: "bullets", items: t.notes });
    b.push({ t: "h1", text: "Checklist" });
    for (const area of [...new Set(a.checks.map((c: any) => c.area))] as string[]) {
      b.push({ t: "h3", text: area });
      b.push({ t: "bullets", items: a.checks.filter((c: any) => c.area === area).map((c: any) => `[${c.status.toUpperCase()}] ${c.title}${c.detail ? " — " + c.detail : ""}`) });
    }
    b.push({ t: "h2", text: "Estimated page counts" }, { t: "kv", items: a.pageEstimates.map((p: any) => [p.trim, `${p.pages} pages`]) });
  }
  return { title: "Publication Readiness Audit", subtitle: ms.title, meta: meta(ms), blocks: b };
}
