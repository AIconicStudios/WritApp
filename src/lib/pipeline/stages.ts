import { db, json, now } from "../db";
import type { DraftIssue, EditMode, JobRow, ManuscriptRow, Ref, Stage } from "../types";
import type { RChapter, RPara } from "../engine/rules";
import { buildVocab, dedupe, runManuscriptRules, runRulesOnChapter } from "../engine/rules";
import { coOccurrence, extractEntities, extractFacts, factContradictions, vanishedCharacters } from "../engine/entities";
import { computeMetrics, languageScores, overallFrom, type Scores, type ScoreItem } from "../engine/scoring";
import { publicationAudit } from "../engine/publication";
import { aiEnabled, AIError, type AISettings } from "../ai/provider";
import { chatJson } from "../ai/json";
import * as P from "../ai/prompts";
import { excerptChapter, sectionize, sectionText, type Section } from "./chunk";
import { bibleEntries, chapterSummaries, clearMachineBible, getAnalysis, loadRChapters, refreshCounts, saveIssues, setAnalysis, storyContext, upsertBible, voiceSample, normSeverity } from "../repo";
import { countWords, dialogueWordRatio, locateQuote, truncate } from "../text";

export type StageId = "extract" | "understand" | "chapters" | "continuity" | "language" | "developmental" | "intelligence" | "report" | "workspace" | "audit";

export const STAGE_INFO: Record<StageId, { n: number; name: string; desc: string }> = {
  extract: { n: 1, name: "Extract & organise", desc: "Verify chapter boundaries, paragraph order and word counts." },
  understand: { n: 2, name: "Build story understanding", desc: "Characters, locations, events, facts and relationships → Story Bible." },
  chapters: { n: 3, name: "Chapter analysis", desc: "Chapter-by-chapter developmental assessment and scores." },
  continuity: { n: 4, name: "Continuity check", desc: "Cross-chapter contradictions with references to where facts were established." },
  language: { n: 5, name: "Copy, line & proofreading", desc: "Grammar, spelling, punctuation, style and sentence-level edits." },
  developmental: { n: 6, name: "Developmental edit", desc: "Manuscript-wide structure, plot, character and pacing analysis." },
  intelligence: { n: 6, name: "Book intelligence", desc: "Summaries, character profiles, conflicts, plot structure, themes and setting." },
  report: { n: 7, name: "Editorial report", desc: "Scores, verdict, strengths, weaknesses and priorities." },
  workspace: { n: 8, name: "Revision workspace", desc: "Issues linked to passages, ready to accept, reject or modify." },
  audit: { n: 9, name: "Publication audit", desc: "Readiness for KDP, paperback, hardcover and submission." },
};

export const PLAN: Record<EditMode, StageId[]> = {
  proofread: ["extract", "understand", "language", "report", "workspace", "audit"],
  copy: ["extract", "understand", "continuity", "language", "report", "workspace", "audit"],
  line: ["extract", "understand", "language", "report", "workspace", "audit"],
  developmental: ["extract", "understand", "chapters", "continuity", "developmental", "intelligence", "report", "workspace", "audit"],
  full: ["extract", "understand", "chapters", "continuity", "language", "developmental", "intelligence", "report", "workspace", "audit"],
  audit: ["extract", "understand", "report", "workspace", "audit"],
};

const LANG_STAGES: Record<EditMode, Stage[]> = {
  proofread: ["proofread"],
  copy: ["proofread", "copy"],
  line: ["line"],
  developmental: [],
  full: ["proofread", "copy", "line"],
  audit: [],
};

export type RunCtx = {
  job: JobRow;
  ms: ManuscriptRow;
  settings: AISettings;
  ai: boolean;
  chapters: RChapter[];
  log: (msg: string, level?: "info" | "warn" | "error") => void;
  progress: (frac: number, msg?: string) => void;
  done: (stage: string, key: string) => boolean;
  result: <T>(stage: string, key: string) => T | null;
  record: (stage: string, key: string, result?: unknown) => void;
  checkCancelled: () => void;
};

export class Cancelled extends Error {}

const body = (c: RChapter[]) => c.filter((x) => x.kind === "chapter");

/** Stage clean-up when a job starts fresh: replace the machine-generated results this mode will regenerate. */
export function prepareFresh(job: JobRow, msId: string) {
  const plan = PLAN[job.mode];
  const stages = new Set<string>(LANG_STAGES[job.mode]);
  if (plan.includes("continuity")) stages.add("continuity");
  if (plan.includes("developmental") || plan.includes("chapters")) stages.add("developmental");
  if (job.mode === "line" || job.mode === "full") stages.add("line");
  const list = [...stages];
  if (list.length) db().prepare(`DELETE FROM issues WHERE manuscript_id = ? AND status IN ('open','stale') AND stage IN (${list.map(() => "?").join(",")})`).run(msId, ...list);
  clearMachineBible(msId);
}

// ================================================================ Stage 1
export async function stageExtract(c: RunCtx) {
  if (c.done("extract", "all")) return;
  refreshCounts(c.ms.id);
  const upd = db().prepare("UPDATE chapters SET stats_json = ? WHERE id = ?");
  for (const ch of c.chapters) upd.run(JSON.stringify(computeMetrics(ch.paragraphs.map((p) => p.text))), ch.id);
  const chs = body(c.chapters);
  c.log(`Organised ${chs.length} chapters, ${c.chapters.length - chs.length} front/back matter sections, ${c.chapters.reduce((n, x) => n + x.paragraphs.length, 0).toLocaleString()} paragraphs.`);
  c.record("extract", "all");
}

// ================================================================ Stage 2
type ValidFacts = P.Facts & { chapterIdx: number; chapterId: string; part: number };

function validRef(sec: Section, quote: string | undefined, paragraph: number | undefined): Ref | null {
  if (!quote || quote.trim().length < 3) return null;
  const pref = paragraph && paragraph > 0 ? sec.paragraphs.find((p) => p.idx + 1 === paragraph) : undefined;
  const order = pref ? [pref, ...sec.paragraphs.filter((p) => p !== pref)] : sec.paragraphs;
  for (const p of order) {
    const loc = locateQuote(p.text, quote);
    if (loc) return { chapterId: sec.chapter.id, chapterIdx: sec.chapter.idx, paragraphId: p.id, paragraphIdx: p.idx, quote: truncate(loc.exact, 220), label: sec.chapter.title };
  }
  return null;
}

function mentioned(sec: Section, name: string) {
  const n = name.trim();
  if (!n) return false;
  const first = n.split(/\s+/)[0].replace(/[^\p{L}'’-]/gu, "");
  const txt = sec.paragraphs.map((p) => p.text).join(" ");
  return txt.includes(n) || (first.length > 2 && txt.includes(first));
}

export async function stageUnderstand(c: RunCtx) {
  // 2a — built-in extraction (always; free and fast).
  if (!c.done("understand", "builtin")) {
    const ents = extractEntities(c.chapters);
    const co = coOccurrence(c.chapters, ents);
    const facts = extractFacts(c.chapters, ents);
    for (const e of ents) {
      if (e.kind === "other") continue;
      upsertBible(c.ms.id, e.kind === "character" ? "characters" : "locations", e.name, null, { aliases: e.aliases, mentions: e.count, appearances: e.chapters, detectedBy: "built-in name analysis" }, [e.firstRef, ...e.refs.slice(1, 6)], "builtin", e.firstRef.chapterIdx ?? 0);
    }
    for (const p of co.slice(0, 40)) upsertBible(c.ms.id, "relationships", `${p.a} & ${p.b}`, `Appear together in ${p.n} paragraphs.`, { a: p.a, b: p.b, type: "co-appearance", strength: p.n }, p.refs, "builtin", 0);
    const ins = db().prepare("INSERT INTO facts (id, manuscript_id, subject, attribute, value, chapter_id, chapter_idx, paragraph_idx, quote, source, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,'rule','official',?)");
    for (const f of facts) ins.run("f_" + Math.random().toString(36).slice(2, 12), c.ms.id, f.subject, f.attribute, f.value, f.ref.chapterId, f.ref.chapterIdx, f.ref.paragraphIdx, f.ref.quote, now());
    setAnalysis(c.ms.id, "builtin_intel", { entities: ents.slice(0, 60).map((e) => ({ name: e.name, kind: e.kind, count: e.count, chapters: e.chapters, aliases: e.aliases, firstRef: e.firstRef })), cooccurrence: co, facts: facts.length });
    c.log(`Built-in analysis found ${ents.filter((e) => e.kind === "character").length} likely characters, ${ents.filter((e) => e.kind === "location").length} locations and ${facts.length} attribute facts.`);
    c.record("understand", "builtin");
  }
  if (!c.ai || !["developmental", "full"].includes(c.job.mode)) return;

  // 2b — AI reading, section by section, carrying forward a rolling memory of the story so far.
  const sections = sectionize(body(c.chapters), c.settings.contextWords);
  let i = 0;
  for (const sec of sections) {
    c.checkCancelled();
    i++;
    if (c.done("understand", sec.key)) continue;
    c.progress(i / sections.length, `Reading ${sec.chapter.title}${sec.parts > 1 ? ` (part ${sec.part + 1}/${sec.parts})` : ""}`);
    const known = rollingMemory(c, sections, sec);
    let res: P.Facts;
    try {
      res = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.factsPrompt(c.ms.title, sec.chapter.title, sec.parts > 1 ? ` (part ${sec.part + 1} of ${sec.parts})` : "", sectionText(sec), known) }], P.FactsSchema, { maxTokens: 3000 });
    } catch (e) {
      if (e instanceof AIError && /JSON|shape/i.test(e.message)) {
        c.log(`Skipped story extraction for ${sec.chapter.title} part ${sec.part + 1}: ${e.message}`, "warn");
        c.record("understand", sec.key, null);
        continue;
      }
      throw e;
    }
    // Grounding: keep only items whose names occur in the text; keep only quotes that exist verbatim.
    const g = groundFacts(sec, res);
    c.record("understand", sec.key, { ...g, chapterIdx: sec.chapter.idx, chapterId: sec.chapter.id, part: sec.part });
  }

  if (!c.done("understand", "merge")) {
    mergeFactsIntoBible(c, sections);
    c.record("understand", "merge");
  }
}

function groundFacts(sec: Section, r: P.Facts) {
  const keepRef = <T extends { quote?: string; paragraph?: number }>(x: T) => ({ ...x, ref: validRef(sec, x.quote, x.paragraph) });
  return {
    summary: r.summary,
    pov: r.pov,
    tone: r.tone,
    characters: r.characters.filter((x) => mentioned(sec, x.name)).map(keepRef),
    locations: r.locations.filter((x) => mentioned(sec, x.name)).map(keepRef),
    events: r.events.map(keepRef),
    facts: r.facts.map(keepRef).filter((x) => x.ref), // facts used for continuity MUST be quoted
    relationships: r.relationships.filter((x) => mentioned(sec, x.a) && mentioned(sec, x.b)).map(keepRef),
    objects: r.objects.map(keepRef).filter((x) => x.ref || mentioned(sec, x.name)),
    rules: r.rules.map(keepRef),
    conflicts: r.conflicts,
    themes: r.themes,
    revelations: r.revelations,
    unresolved: r.unresolved,
  };
}
type Grounded = ReturnType<typeof groundFacts> & { chapterIdx: number; chapterId: string; part: number };

function rollingMemory(c: RunCtx, sections: Section[], sec: Section) {
  const prev = sections.slice(0, sections.indexOf(sec)).map((s) => c.result<Grounded>("understand", s.key)).filter(Boolean) as Grounded[];
  const chars = new Map<string, string>();
  for (const r of prev) for (const ch of r.characters) chars.set(ch.name, [ch.role, ch.traits?.slice(0, 3).join(", ")].filter(Boolean).join("; "));
  const summaries = prev.slice(-4).map((r) => `- (chapter index ${r.chapterIdx}) ${r.summary}`);
  const older = prev.length > 4 ? `Earlier: ${prev.slice(0, -4).map((r) => r.summary.split(/(?<=[.!?])\s/)[0]).join(" ")}` : "";
  const out = [chars.size ? "Characters so far: " + [...chars].slice(-25).map(([n, d]) => `${n}${d ? ` (${truncate(d, 80)})` : ""}`).join("; ") : "", truncate(older, 1500), summaries.join("\n")].filter(Boolean).join("\n");
  return out;
}

function normName(s: string) {
  return s.toLowerCase().replace(/^(mr|mrs|ms|dr|miss)\.?\s+/, "").replace(/[’']s$/, "").trim();
}

function mergeFactsIntoBible(c: RunCtx, sections: Section[]) {
  const results = sections.map((s) => c.result<Grounded>("understand", s.key)).filter(Boolean) as Grounded[];
  const msId = c.ms.id;
  // Characters: merge by name/alias; also merge with built-in entries of the same name.
  const builtinChars = bibleEntries(msId, "characters");
  const canon = new Map<string, string>(); // normalized alias -> canonical name
  for (const b of builtinChars) {
    canon.set(normName(b.name), b.name);
    for (const a of json<any>(b.data_json, {}).aliases ?? []) canon.set(normName(a), b.name);
  }
  type Agg = { name: string; aliases: Set<string>; roles: string[]; desc: string[]; traits: Set<string>; wants: string[]; appearances: Set<number>; refs: Ref[] };
  const agg = new Map<string, Agg>();
  const resolve = (name: string, aliases: string[] = []) => {
    const keys = [name, ...aliases].map(normName);
    for (const k of keys) if (canon.has(k)) return canon.get(k)!;
    // first-name match against existing canonical names
    const first = normName(name).split(" ")[0];
    for (const [k, v] of canon) if (k.split(" ")[0] === first && first.length > 2 && (k.split(" ").length === 1 || normName(name).split(" ").length === 1)) return v;
    canon.set(normName(name), name);
    for (const a of aliases) canon.set(normName(a), name);
    return name;
  };
  for (const r of results) {
    for (const ch of r.characters) {
      const name = resolve(ch.name, ch.aliases);
      const a = agg.get(name) ?? { name, aliases: new Set(), roles: [], desc: [], traits: new Set(), wants: [], appearances: new Set(), refs: [] };
      (ch.aliases ?? []).forEach((x) => x !== name && a.aliases.add(x));
      if (ch.name !== name) a.aliases.add(ch.name);
      if (ch.role) a.roles.push(`Ch.${r.chapterIdx}: ${ch.role}`);
      if (ch.description && !/not (stated|established|described)/i.test(ch.description)) a.desc.push(ch.description);
      (ch.traits ?? []).forEach((t) => a.traits.add(t.toLowerCase()));
      if (ch.wants) a.wants.push(ch.wants);
      a.appearances.add(r.chapterIdx);
      if (ch.ref) a.refs.push(ch.ref);
      agg.set(name, a);
    }
  }
  for (const a of agg.values()) {
    const existing = builtinChars.find((b) => b.name === a.name);
    const prevApps: number[] = existing ? json<any>(existing.data_json, {}).appearances ?? [] : [];
    upsertBible(msId, "characters", a.name, a.roles[0]?.replace(/^Ch\.\d+: /, "") ?? null, {
      aliases: [...new Set([...(existing ? json<any>(existing.data_json, {}).aliases ?? [] : []), ...a.aliases])],
      role: a.roles[0]?.replace(/^Ch\.\d+: /, ""),
      roles: a.roles.slice(0, 30),
      physical: [...new Set(a.desc)].slice(0, 6).join("; ") || "Not established in the manuscript.",
      traits: [...a.traits].slice(0, 15),
      wants: [...new Set(a.wants)].slice(0, 8),
      appearances: [...new Set([...prevApps, ...a.appearances])].sort((x, y) => x - y),
    }, a.refs, "ai", Math.min(...a.appearances));
  }
  // Locations, objects, rules, relationships, events.
  for (const r of results) {
    for (const l of r.locations) upsertBible(msId, "locations", l.name, l.description || null, { appearances: [r.chapterIdx] }, l.ref ? [l.ref] : [], "ai", r.chapterIdx);
    for (const o of r.objects) upsertBible(msId, "objects", o.name, o.description || null, { firstChapter: r.chapterIdx }, o.ref ? [o.ref] : [], "ai", r.chapterIdx);
    for (const ru of r.rules) upsertBible(msId, "rules", truncate(ru.rule, 160), ru.rule, {}, ru.ref ? [ru.ref] : [], "ai", r.chapterIdx);
    for (const rel of r.relationships) {
      const a = resolve(rel.a),
        b = resolve(rel.b);
      if (a === b) continue;
      const [x, y] = [a, b].sort();
      upsertBible(msId, "relationships", `${x} & ${y} (${rel.type.toLowerCase()})`, rel.description || null, { a: x, b: y, type: rel.type.toLowerCase(), since: r.chapterIdx }, rel.ref ? [rel.ref] : [], "ai", r.chapterIdx);
    }
    r.events.forEach((ev, k) => upsertBible(msId, "events", truncate(ev.title, 120), ev.description || null, { chapterIdx: r.chapterIdx, part: r.part, order: k, when: ev.when, importance: ev.importance, characters: ev.characters }, ev.ref ? [ev.ref] : [], "ai", r.chapterIdx * 1000 + r.part * 100 + k));
    for (const f of r.facts) {
      db().prepare("INSERT INTO facts (id, manuscript_id, subject, attribute, value, chapter_id, chapter_idx, paragraph_idx, quote, source, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,'ai','official',?)").run("f_" + Math.random().toString(36).slice(2, 12), msId, resolve(f.subject), f.attribute.toLowerCase(), f.value, f.ref!.chapterId, f.ref!.chapterIdx, f.ref!.paragraphIdx, f.ref!.quote, now());
      if (/dead|died|killed|deceased/i.test(f.attribute + " " + f.value)) upsertBible(msId, "history", `${resolve(f.subject)}: ${f.attribute} — ${f.value}`, null, {}, [f.ref!], "ai", r.chapterIdx);
    }
  }
  // Chapter intelligence: combine the section results per chapter.
  const byCh = new Map<string, Grounded[]>();
  for (const r of results) {
    if (!byCh.has(r.chapterId)) byCh.set(r.chapterId, []);
    byCh.get(r.chapterId)!.push(r);
  }
  const upd = db().prepare("UPDATE chapters SET intel_json = ? WHERE id = ?");
  for (const [cid, list] of byCh) {
    list.sort((a, b) => a.part - b.part);
    const intel = {
      summary: list.map((l) => l.summary).join(" "),
      pov: list[0].pov,
      tone: [...new Set(list.map((l) => l.tone).filter(Boolean))].join("; "),
      characters: [...new Set(list.flatMap((l) => l.characters.map((c) => resolve(c.name))))],
      events: list.flatMap((l) => l.events.map((e) => ({ title: e.title, description: e.description, ref: e.ref }))),
      conflicts: list.flatMap((l) => l.conflicts),
      developments: list.flatMap((l) => l.characters.filter((c) => c.role).map((c) => `${resolve(c.name)}: ${c.role}`)),
      revelations: list.flatMap((l) => l.revelations),
      themes: [...new Set(list.flatMap((l) => l.themes))],
      unresolved: list.flatMap((l) => l.unresolved),
      locations: [...new Set(list.flatMap((l) => l.locations.map((x) => x.name)))],
    };
    upd.run(JSON.stringify(intel), cid);
  }
  c.chapters = loadRChapters(msId);
  c.log(`Story Bible built: ${agg.size} characters, ${bibleEntries(msId, "locations").length} locations, ${bibleEntries(msId, "events").length} events, ${bibleEntries(msId, "relationships").length} relationships.`);
}

// ================================================================ Stage 3
export async function stageChapters(c: RunCtx) {
  if (!c.ai) {
    c.log("Chapter developmental analysis skipped — it requires an AI provider. Language-based chapter scores will still be calculated.", "warn");
    return;
  }
  const chs = body(c.chapters);
  let i = 0;
  for (const ch of chs) {
    c.checkCancelled();
    i++;
    if (c.done("chapters", ch.id)) continue;
    c.progress(i / chs.length, `Assessing ${ch.title}`);
    const ctx = storyContext(c.ms.id, { upToChapter: ch.idx - 1, maxWords: Math.round(c.settings.contextWords * 0.6) });
    const intel = json<any>(db().prepare("SELECT intel_json FROM chapters WHERE id = ?").get(ch.id) && (db().prepare("SELECT intel_json FROM chapters WHERE id = ?").get(ch.id) as any).intel_json, {});
    const text = excerptChapter(ch, c.settings.contextWords) + (intel.summary ? `\n\n[Full chapter summary: ${intel.summary}]` : "");
    let r: any;
    try {
      r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.chapterDevPrompt(c.ms.title, ch.title, ctx, text) }], P.ChapterDevSchema, { maxTokens: 3000 });
    } catch (e) {
      if (e instanceof AIError && /JSON|shape/i.test(e.message)) {
        c.log(`Skipped chapter analysis for ${ch.title}: ${e.message}`, "warn");
        c.record("chapters", ch.id, null);
        continue;
      }
      throw e;
    }
    const sec: Section = { key: ch.id, chapter: ch, part: 0, parts: 1, paragraphs: ch.paragraphs, words: 0 };
    const issues: DraftIssue[] = [];
    for (const o of r.observations) {
      const ref = validRef(sec, o.quote, o.paragraph);
      issues.push({ stage: "developmental", category: titleCat(o.type), severity: normSeverity(o.severity), objective: false, chapterId: ch.id, paragraphId: ref?.paragraphId ?? null, original: ref?.quote ?? null, explanation: o.problem, suggestion: null, revised: null, reason: o.recommendation, source: "ai", confidence: ref ? 0.7 : 0.55 });
    }
    for (const w of r.weak_paragraphs) {
      const p = ch.paragraphs.find((x) => x.idx + 1 === w.paragraph);
      const ref = validRef(sec, w.quote, w.paragraph) ?? (p ? { chapterId: ch.id, paragraphId: p.id, quote: truncate(p.text, 200) } : null);
      if (!ref) continue;
      issues.push({ stage: "line", category: "Weak paragraph", severity: "moderate", objective: false, chapterId: ch.id, paragraphId: ref.paragraphId ?? null, original: ref.quote ?? null, explanation: w.why, suggestion: null, revised: null, reason: w.suggestion ?? null, source: "ai", confidence: 0.6 });
    }
    for (const ci of r.character_issues) if (ci && !/^none/i.test(ci)) issues.push({ stage: "developmental", category: "Character consistency", severity: "moderate", objective: false, chapterId: ch.id, paragraphId: null, original: null, explanation: ci, suggestion: null, revised: null, reason: "Check this against the character's established profile in the Story Bible.", source: "ai", confidence: 0.55 });
    const score = Number.isFinite(r.score) ? Math.max(1, Math.min(100, Math.round(r.score))) : null;
    db().transaction(() => {
      saveIssues(c.ms.id, c.job.id, issues);
      db().prepare("UPDATE chapters SET notes_json = ?, score = ? WHERE id = ?").run(JSON.stringify({ ...r, observations: r.observations.length, weak_paragraphs: r.weak_paragraphs.length }), score, ch.id);
      const cur = json<any>((db().prepare("SELECT intel_json FROM chapters WHERE id = ?").get(ch.id) as any).intel_json, {});
      if (!cur.summary && r.summary) db().prepare("UPDATE chapters SET intel_json = ? WHERE id = ?").run(JSON.stringify({ ...cur, summary: r.summary, connection: r.connection_to_story, developments: r.character_developments }), ch.id);
      else db().prepare("UPDATE chapters SET intel_json = ? WHERE id = ?").run(JSON.stringify({ ...cur, connection: r.connection_to_story, chapterDevelopments: r.character_developments, conflictsDeveloped: r.conflicts_developed }), ch.id);
      c.record("chapters", ch.id);
    })();
  }
}

function titleCat(t: string) {
  const m: Record<string, string> = { plot: "Plot", pacing: "Pacing", character: "Character", tension: "Tension & conflict", scene: "Scene purpose", opening: "Chapter opening", ending: "Chapter ending", dialogue: "Dialogue", worldbuilding: "World-building", clarity: "Clarity", continuity: "Continuity" };
  return m[t?.toLowerCase()] ?? (t ? t[0].toUpperCase() + t.slice(1) : "Developmental");
}

// ================================================================ Stage 4
export async function stageContinuity(c: RunCtx) {
  if (!c.done("continuity", "builtin")) {
    const facts = db().prepare("SELECT * FROM facts WHERE manuscript_id = ? AND status = 'official'").all(c.ms.id) as any[];
    const titles = new Map(c.chapters.map((ch) => [ch.idx, ch.title]));
    const issues = factContradictions(facts.filter((f) => ["eye colour", "hair colour", "age"].includes(f.attribute) || f.attribute.startsWith("relation to")).map((f) => ({ subject: f.subject, attribute: f.attribute, value: f.value, ref: { chapterId: f.chapter_id, chapterIdx: f.chapter_idx, paragraphIdx: f.paragraph_idx, paragraphId: paraId(c, f.chapter_id, f.paragraph_idx), quote: f.quote, label: titles.get(f.chapter_idx) ?? "" } })));
    const ents = (getAnalysis<any>(c.ms.id, "builtin_intel")?.entities ?? []) as any[];
    const chIds = new Map(body(c.chapters).map((ch) => [ch.idx, ch.id]));
    const vanished = vanishedCharacters(ents.map((e) => ({ ...e, refs: [e.firstRef], evidence: { speech: 0, place: 0, title: 0 } })), chIds.size, chIds);
    saveIssues(c.ms.id, c.job.id, [...issues, ...vanished]);
    c.log(`Built-in continuity check: ${issues.length} attribute contradictions, ${vanished.length} possibly dropped characters.`);
    c.record("continuity", "builtin");
  }
  if (!c.ai || !["developmental", "full"].includes(c.job.mode) || c.done("continuity", "ai")) return;
  c.progress(0.3, "Cross-checking facts across chapters");
  const facts = db().prepare("SELECT subject, attribute, value, chapter_idx, quote, chapter_id, paragraph_idx FROM facts WHERE manuscript_id = ? AND status = 'official' ORDER BY subject, attribute, chapter_idx").all(c.ms.id) as any[];
  // Only subjects with more than one fact can contradict; cap the table to fit the context.
  const counts = new Map<string, number>();
  for (const f of facts) counts.set(f.subject, (counts.get(f.subject) ?? 0) + 1);
  const rows = facts.filter((f) => (counts.get(f.subject) ?? 0) > 1);
  let table = "";
  for (const f of rows) {
    const line = `ch ${f.chapter_idx} | ${f.subject} | ${f.attribute} | ${f.value} | "${f.quote}"\n`;
    if (countWords(table + line) > c.settings.contextWords * 0.8) break;
    table += line;
  }
  const events = bibleEntries(c.ms.id, "events").slice(0, 120).map((e) => { const d = json<any>(e.data_json, {}); return `ch ${d.chapterIdx}: ${e.name}${d.when ? ` [${d.when}]` : ""}`; }).join("\n");
  if (!table.trim()) {
    c.record("continuity", "ai");
    return;
  }
  const r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.continuityPrompt(c.ms.title, table, truncate(events, 6000)) }], P.ContinuitySchema, { maxTokens: 3000 });
  const issues: DraftIssue[] = [];
  for (const x of r.contradictions) {
    const first = findQuote(c, x.first_quote, x.first_chapter);
    const second = findQuote(c, x.second_quote, x.second_chapter);
    if (!second && !first) continue; // ungrounded → discarded
    const kind = /direct/i.test(x.kind) ? "Direct contradiction" : /mystery|intent/i.test(x.kind) ? "Possibly intentional (mystery / ambiguity)" : "Possible inconsistency";
    const anchor = second ?? first!;
    issues.push({ stage: "continuity", category: "Continuity" + (x.subject ? `: ${x.subject}` : ""), rule: "ai_continuity", severity: /mystery|intent/i.test(x.kind) ? "minor" : normSeverity(x.severity ?? (kind.startsWith("Direct") ? "major" : "moderate")), objective: kind.startsWith("Direct"), chapterId: anchor.chapterId ?? null, paragraphId: anchor.paragraphId ?? null, original: anchor.quote ?? null, explanation: `${x.description} [${kind}]`, suggestion: null, revised: null, reason: x.recommendation, refs: [first && { ...first, label: `First established — ${first.label}` }, second && { ...second, label: `Later — ${second.label}` }].filter(Boolean) as Ref[], source: "ai", confidence: first && second ? 0.75 : 0.55 });
  }
  saveIssues(c.ms.id, c.job.id, issues);
  c.log(`AI continuity check reported ${issues.length} grounded findings (${r.contradictions.length - issues.length} discarded because their quotes could not be found in the text).`);
  c.record("continuity", "ai");
}

function paraId(c: RunCtx, chapterId: string, idx: number) {
  return c.chapters.find((ch) => ch.id === chapterId)?.paragraphs.find((p) => p.idx === idx)?.id;
}

function findQuote(c: RunCtx, quote: string | undefined, chapterIdx?: number): Ref | null {
  if (!quote || quote.length < 4) return null;
  const order = [...c.chapters].sort((a, b) => Math.abs(a.idx - (chapterIdx ?? a.idx)) - Math.abs(b.idx - (chapterIdx ?? b.idx)));
  for (const ch of order) for (const p of ch.paragraphs) {
    const loc = locateQuote(p.text, quote);
    if (loc) return { chapterId: ch.id, chapterIdx: ch.idx, paragraphId: p.id, paragraphIdx: p.idx, quote: truncate(loc.exact, 220), label: ch.title };
  }
  return null;
}

// ================================================================ Stage 5
export async function stageLanguage(c: RunCtx) {
  const stages = new Set<Stage>(LANG_STAGES[c.job.mode]);
  if (!stages.size) return;
  const known = new Set<string>();
  for (const b of [...bibleEntries(c.ms.id, "characters"), ...bibleEntries(c.ms.id, "locations")]) {
    for (const part of b.name.split(/\s+/)) known.add(part);
    for (const a of json<any>(b.data_json, {}).aliases ?? []) for (const part of String(a).split(/\s+/)) known.add(part);
  }
  const vocab = buildVocab(c.chapters);
  const all = c.chapters;
  // 5a — rule engine, chapter by chapter.
  let i = 0;
  for (const ch of all) {
    c.checkCancelled();
    i++;
    if (c.done("language", "rules:" + ch.id)) continue;
    c.progress((i / all.length) * (c.ai ? 0.25 : 1), `Checking language in ${ch.title}`);
    const issues = await runRulesOnChapter(ch, stages, vocab, known);
    db().transaction(() => {
      saveIssues(c.ms.id, c.job.id, issues);
      c.record("language", "rules:" + ch.id, { n: issues.length });
    })();
  }
  if (!c.done("language", "ms-rules")) {
    const ms = await runManuscriptRules(all, stages, known);
    saveIssues(c.ms.id, c.job.id, ms);
    c.record("language", "ms-rules", { n: ms.length });
  }
  // 5b — AI copy/line edit per section (parallel up to the configured concurrency).
  const focus: "copy" | "line" | "both" | null = !c.ai ? null : c.job.mode === "copy" ? "copy" : c.job.mode === "line" ? "line" : c.job.mode === "full" ? "both" : null;
  if (!focus) {
    if (!c.ai && c.job.mode !== "proofread") c.log("AI copy/line editing skipped (no AI provider). Rule-based copy and line editing was performed.", "warn");
    return;
  }
  const sections = sectionize(body(all), Math.min(c.settings.contextWords, 1800));
  const voice = voiceDescription(c);
  let doneCount = 0;
  const queue = sections.filter((s) => !c.done("language", "ai:" + s.key));
  doneCount = sections.length - queue.length;
  const worker = async () => {
    for (;;) {
      const sec = queue.shift();
      if (!sec) return;
      c.checkCancelled();
      c.progress(0.25 + 0.75 * (doneCount / sections.length), `Editing ${sec.chapter.title}${sec.parts > 1 ? ` (part ${sec.part + 1}/${sec.parts})` : ""}`);
      let r: { issues: any[] };
      try {
        r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.editPrompt(focus, sec.chapter.title, sectionText(sec), voice, Math.max(6, Math.round(sec.words / 120))) }], P.EditSchema, { maxTokens: 3500 });
      } catch (e) {
        if (e instanceof AIError && /JSON|shape/i.test(e.message)) {
          c.log(`Skipped AI edit of ${sec.chapter.title} part ${sec.part + 1}: ${e.message}`, "warn");
          c.record("language", "ai:" + sec.key, null);
          doneCount++;
          continue;
        }
        throw e;
      }
      const existing = db().prepare("SELECT paragraph_id, original_text FROM issues WHERE manuscript_id = ? AND chapter_id = ? AND status = 'open'").all(c.ms.id, sec.chapter.id) as { paragraph_id: string; original_text: string }[];
      const issues: DraftIssue[] = [];
      let dropped = 0;
      for (const x of r.issues) {
        const ref = validRef(sec, x.quote, x.paragraph);
        if (!ref || !ref.paragraphId) {
          dropped++;
          continue;
        }
        const para = sec.paragraphs.find((p) => p.id === ref.paragraphId)!;
        const loc = locateQuote(para.text, x.quote)!;
        if (existing.some((e) => e.paragraph_id === para.id && e.original_text && (e.original_text.includes(loc.exact) || loc.exact.includes(e.original_text)))) continue;
        if (x.suggestion && x.suggestion.trim() === loc.exact.trim()) continue; // no-op suggestion
        const stage: Stage = /grammar|tense|agreement|pronoun|fragment|run-on|comma|punctuation|preposition|capital|misused|spelling/i.test(x.category) ? "copy" : "line";
        issues.push({
          stage, category: x.category || "Line edit", severity: normSeverity(x.severity), objective: !!x.objective && stage === "copy", chapterId: sec.chapter.id, paragraphId: para.id, original: loc.exact, explanation: x.explanation,
          suggestion: x.suggestion ?? null, revised: x.suggestion ? para.text.slice(0, loc.start) + x.suggestion + para.text.slice(loc.end) : null, reason: x.reason ?? null, source: "ai", confidence: 0.7,
        });
      }
      db().transaction(() => {
        saveIssues(c.ms.id, c.job.id, dedupe(issues));
        c.record("language", "ai:" + sec.key, { n: issues.length, dropped });
      })();
      if (dropped) c.log(`${sec.chapter.title}: discarded ${dropped} AI suggestion(s) whose quoted text was not found in the manuscript.`, "info");
      doneCount++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, c.settings.concurrency)) }, worker));
}

function voiceDescription(c: RunCtx) {
  const intel = db().prepare("SELECT intel_json FROM chapters WHERE manuscript_id = ? AND intel_json IS NOT NULL LIMIT 1").get(c.ms.id) as { intel_json: string } | undefined;
  const i = json<any>(intel?.intel_json, {});
  const m = computeMetrics(body(c.chapters).slice(0, 3).flatMap((ch) => ch.paragraphs.map((p) => p.text)));
  return [i.pov, i.tone && `tone: ${i.tone}`, `average sentence ${m.avgSentence} words`, `${m.dialoguePct}% dialogue`].filter(Boolean).join("; ");
}

// ================================================================ Stage 6
export async function stageDevelopmental(c: RunCtx) {
  if (!c.done("developmental", "builtin")) {
    const rules = await runManuscriptRules(c.chapters, new Set<Stage>(["developmental"]), new Set());
    saveIssues(c.ms.id, c.job.id, rules);
    c.record("developmental", "builtin");
  }
  if (!c.ai) {
    c.log("Manuscript-wide developmental editing skipped — it requires an AI provider.", "warn");
    return;
  }
  if (c.done("developmental", "ai")) return;
  c.progress(0.2, "Evaluating the whole manuscript");
  const outline = chapterSummaries(c.ms.id, undefined, Math.round(c.settings.contextWords * 0.9));
  const chars = bibleEntries(c.ms.id, "characters").slice(0, 15).map((b) => { const d = json<any>(b.data_json, {}); return `- ${b.name}: ${[d.role, d.traits?.slice(0, 5).join(", "), d.appearances && `chapters ${d.appearances.join(",")}`].filter(Boolean).join("; ")}`; }).join("\n");
  const samples: string[] = [];
  const chs = body(c.chapters);
  for (let k = 0; k < chs.length && samples.length < 8; k += Math.max(1, Math.floor(chs.length / 8))) {
    const p = chs[k].paragraphs.find((x) => dialogueWordRatio(x.text) > 0.5 && countWords(x.text) > 15);
    if (p) samples.push(`(${chs[k].title}) ${truncate(p.text, 400)}`);
  }
  const ingest = getAnalysis<any>(c.ms.id, "ingest");
  const wc = c.chapters.reduce((n, ch) => n + ch.paragraphs.reduce((m, p) => m + countWords(p.text), 0), 0);
  const r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.devPrompt(c.ms.title, c.ms.genre ?? "", outline, chars, samples.join("\n\n"), `Length: ${wc.toLocaleString()} words in ${chs.length} chapters.${ingest?.warnings?.length ? " Notes: " + ingest.warnings.join(" ") : ""}`) }], P.DevSchema, { maxTokens: 4000 });
  const issues: DraftIssue[] = r.issues.map((x) => {
    const ch = c.chapters.find((y) => y.idx === x.chapter);
    return { stage: "developmental" as Stage, category: x.category, severity: normSeverity(x.severity), objective: false, chapterId: ch?.id ?? null, paragraphId: null, original: null, explanation: x.problem, suggestion: null, revised: null, reason: x.recommendation, source: "ai" as const, confidence: 0.6 };
  });
  saveIssues(c.ms.id, c.job.id, issues);
  setAnalysis(c.ms.id, "developmental", r, true);
  c.record("developmental", "ai");
}

// ================================================================ Stage 6b — Book intelligence
export async function stageIntelligence(c: RunCtx) {
  // Timeline is always derived from the Story Bible events (narrative order).
  const events = bibleEntries(c.ms.id, "events").map((e) => ({ id: e.id, title: e.name, description: e.summary, ...json<any>(e.data_json, {}), refs: json<Ref[]>(e.refs_json, []) }));
  setAnalysis(c.ms.id, "timeline", { events }, !!events.length);
  if (!c.ai) {
    c.log("Book intelligence (summaries, profiles, conflicts, plot, themes) requires an AI provider — built-in character and relationship data is still available.", "warn");
    return;
  }
  const outline = chapterSummaries(c.ms.id, undefined, Math.round(c.settings.contextWords * 1.2));
  const tasks: { key: string; run: () => Promise<void> }[] = [
    {
      key: "summary",
      run: async () => setAnalysis(c.ms.id, "summary", await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.summaryPrompt(c.ms.title, outline) }], P.SummarySchema, { maxTokens: 4000 }), true),
    },
    {
      key: "characters",
      run: async () => {
        const chars = bibleEntries(c.ms.id, "characters").sort((a, b) => (json<any>(b.data_json, {}).appearances?.length ?? 0) - (json<any>(a.data_json, {}).appearances?.length ?? 0)).slice(0, 14);
        const factsBy = db().prepare("SELECT attribute, value, chapter_idx FROM facts WHERE manuscript_id = ? AND subject = ? LIMIT 20");
        const rels = bibleEntries(c.ms.id, "relationships");
        const dossiers = chars.map((ch) => {
          const d = json<any>(ch.data_json, {});
          const f = (factsBy.all(c.ms.id, ch.name) as any[]).map((x) => `${x.attribute}: ${x.value} (ch ${x.chapter_idx})`).join("; ");
          const rl = rels.filter((r) => { const rd = json<any>(r.data_json, {}); return rd.a === ch.name || rd.b === ch.name; }).slice(0, 8).map((r) => r.name).join("; ");
          return `## ${ch.name}${d.aliases?.length ? ` (aka ${d.aliases.join(", ")})` : ""}\nAppears in chapter indexes: ${(d.appearances ?? []).join(", ")}\nPhysical: ${d.physical ?? "Not established"}\nTraits: ${(d.traits ?? []).join(", ")}\nWants: ${(d.wants ?? []).join(" | ")}\nRoles by chapter: ${(d.roles ?? []).slice(0, 12).join(" | ")}\nFacts: ${f}\nRelationships: ${rl}`;
        });
        let budget = "";
        for (const d of dossiers) if (countWords(budget + d) < c.settings.contextWords * 1.2) budget += d + "\n\n";
        const r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.charactersPrompt(c.ms.title, budget, truncate(outline, 9000)) }], P.CharactersSchema, { maxTokens: 6000 });
        setAnalysis(c.ms.id, "characters", r, true);
        for (const p of r.characters) {
          const existing = chars.find((x) => x.name.toLowerCase() === p.name.toLowerCase() || json<any>(x.data_json, {}).aliases?.some((a: string) => a.toLowerCase() === p.name.toLowerCase()));
          upsertBible(c.ms.id, "characters", existing?.name ?? p.name, p.role, { classification: p.classification, physical: p.physical, personality: p.personality, background: p.background, motivations: p.motivations, goals: p.goals, fears: p.fears, strengths: p.strengths, internal: p.internal_struggles, external: p.external_struggles, development: p.development, change: p.change, contribution: p.plot_contribution, fate: p.fate, flags: p.flags }, [], "ai");
          if (p.change && p.change.length > 20) upsertBible(c.ms.id, "arcs", `${existing?.name ?? p.name}'s arc`, p.change, { character: existing?.name ?? p.name, development: p.development }, [], "ai");
        }
      },
    },
    {
      key: "conflicts",
      run: async () => {
        const notes = body(c.chapters).map((ch) => { const i = json<any>((db().prepare("SELECT intel_json FROM chapters WHERE id = ?").get(ch.id) as any)?.intel_json, {}); return (i.conflicts ?? []).length ? `Ch index ${ch.idx}: ${(i.conflicts as any[]).map((x) => `${x.description} [${x.type ?? ""}]`).join("; ")}` : ""; }).filter(Boolean).join("\n");
        const r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.conflictsPrompt(c.ms.title, outline, truncate(notes, 8000)) }], P.ConflictsSchema, { maxTokens: 4000 });
        setAnalysis(c.ms.id, "conflicts", r, true);
        for (const x of r.conflicts) upsertBible(c.ms.id, "conflicts", x.title, `${x.type}${x.central ? " (central)" : ""} — ${x.cause}`, { type: x.type, central: x.central, involved: x.involved, stakes: x.stakes, resolution: x.resolution, chapters: x.chapters }, [], "ai", x.central ? 0 : 1);
      },
    },
    {
      key: "plot",
      run: async () => {
        const r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.plotPrompt(c.ms.title, outline) }], P.PlotSchema, { maxTokens: 4000 });
        setAnalysis(c.ms.id, "plot", r, true);
        for (const a of r.arcs) upsertBible(c.ms.id, "arcs", a.name, a.description, {}, [], "ai", 5);
        const unresolvedIssues: DraftIssue[] = r.unresolved.filter(Boolean).map((u) => ({ stage: "developmental", category: "Unresolved storyline", severity: "moderate", objective: false, chapterId: null, paragraphId: null, original: null, explanation: u, suggestion: null, revised: null, reason: "Readers expect introduced threads to pay off or be acknowledged. Resolve it, reference it, or cut its setup — unless leaving it open is a deliberate choice (e.g. for a sequel).", source: "ai", confidence: 0.55 }));
        const holes: DraftIssue[] = r.plot_holes.filter(Boolean).map((u) => ({ stage: "developmental", category: "Plot hole", severity: "major", objective: false, chapterId: null, paragraphId: null, original: null, explanation: u, suggestion: null, revised: null, reason: "Plot holes undermine reader trust. Add setup, explanation or revise the event.", source: "ai", confidence: 0.55 }));
        saveIssues(c.ms.id, c.job.id, [...unresolvedIssues, ...holes]);
      },
    },
    {
      key: "themes",
      run: async () => {
        const notes = body(c.chapters).map((ch) => { const i = json<any>((db().prepare("SELECT intel_json FROM chapters WHERE id = ?").get(ch.id) as any)?.intel_json, {}); return (i.themes ?? []).length ? `Ch index ${ch.idx}: ${(i.themes as string[]).join(", ")}` : ""; }).filter(Boolean).join("\n");
        const r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.themesPrompt(c.ms.title, outline, truncate(notes, 4000)) }], P.ThemesSchema, { maxTokens: 3500 });
        setAnalysis(c.ms.id, "themes", r, true);
        for (const t of r.main) upsertBible(c.ms.id, "themes", t.theme, t.how, { level: "main", chapters: t.chapters }, [], "ai", 0);
        for (const t of r.secondary) upsertBible(c.ms.id, "themes", t.theme, t.how, { level: "secondary" }, [], "ai", 1);
      },
    },
    {
      key: "setting",
      run: async () => {
        const locs = bibleEntries(c.ms.id, "locations").slice(0, 30).map((l) => `- ${l.name}: ${l.summary ?? ""} (chapters ${(json<any>(l.data_json, {}).appearances ?? []).join(",")})`).join("\n");
        const rules = bibleEntries(c.ms.id, "rules").slice(0, 30).map((r) => `- ${r.name}`).join("\n");
        const r = await chatJson(c.settings, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.settingPrompt(c.ms.title, truncate(outline, 9000), locs, rules) }], P.SettingSchema, { maxTokens: 3000 });
        setAnalysis(c.ms.id, "setting", r, true);
      },
    },
  ];
  let k = 0;
  for (const t of tasks) {
    c.checkCancelled();
    k++;
    if (c.done("intelligence", t.key)) continue;
    c.progress(k / tasks.length, `Book intelligence: ${t.key}`);
    try {
      await t.run();
      c.record("intelligence", t.key);
    } catch (e) {
      if (e instanceof AIError && /JSON|shape/i.test(e.message)) {
        c.log(`Book intelligence “${t.key}” could not be generated: ${e.message}. You can regenerate it from the Story Intelligence page.`, "warn");
        c.record("intelligence", t.key, null);
      } else throw e;
    }
  }
}

// ================================================================ Stage 7
export async function stageReport(c: RunCtx) {
  const chs = body(c.chapters);
  const allParas = chs.flatMap((ch) => ch.paragraphs.map((p) => p.text));
  const m = computeMetrics(allParas);
  const issueRows = db().prepare("SELECT stage, severity, objective, chapter_id, status, source FROM issues WHERE manuscript_id = ?").all(c.ms.id) as any[];
  const open = issueRows.filter((i) => i.status === "open");
  const w = { critical: 6, major: 3, moderate: 1.5, minor: 0.7 } as Record<string, number>;
  const stat = (rows: any[]) => ({
    objectiveWeighted: rows.filter((i) => i.objective && ["proofread", "copy"].includes(i.stage)).reduce((n, i) => n + w[i.severity], 0),
    objectiveCount: rows.filter((i) => i.objective && ["proofread", "copy"].includes(i.stage)).length,
    continuityCount: rows.filter((i) => i.stage === "continuity").length,
    continuityMajor: rows.filter((i) => i.stage === "continuity" && ["critical", "major"].includes(i.severity)).length,
    criticalOpen: rows.filter((i) => i.severity === "critical").length,
    lineCount: rows.filter((i) => i.stage === "line").length,
  });
  const langRan = PLAN[c.job.mode].includes("language");
  const prevReport = getAnalysis<any>(c.ms.id, "report");
  const ls = languageScores(m, stat(issueRows.filter((i) => i.status !== "rejected")));
  const dev = getAnalysis<any>(c.ms.id, "developmental");
  const scores: Partial<Scores> = {};
  const na = (expl: string): ScoreItem => ({ score: null, basis: "not_assessed", explanation: expl });
  if (langRan || !prevReport) {
    scores.grammar = langRan && LANG_STAGES[c.job.mode].some((s) => s === "proofread" || s === "copy") ? ls.grammar : prevReport?.scores?.grammar ?? na("Run a Proofread or Copy Edit to measure grammar.");
    scores.sentence = ls.sentence;
    scores.vocabulary = ls.vocabulary;
    scores.readability = ls.readability;
  } else Object.assign(scores, { grammar: prevReport.scores.grammar, sentence: ls.sentence, vocabulary: ls.vocabulary, readability: ls.readability });
  const aiKeys = ["plot", "character", "dialogue", "pacing", "emotional", "originality", "consistency"] as const;
  for (const k of aiKeys) {
    const s = dev?.scores?.[k];
    if (s && Number.isFinite(s.score)) scores[k] = { score: Math.max(1, Math.min(100, Math.round(s.score))), explanation: s.explanation, basis: "ai" };
  }
  if (!scores.pacing) scores.pacing = ls.pacingEstimate;
  if (!scores.dialogue) scores.dialogue = ls.dialogueEstimate;
  if (!scores.consistency) {
    const st = stat(open);
    scores.consistency = st.continuityCount || PLAN[c.job.mode].includes("continuity") ? { score: Math.max(1, Math.min(100, 95 - st.continuityMajor * 7 - (st.continuityCount - st.continuityMajor) * 3)), basis: "measured", explanation: `${st.continuityCount} continuity findings (${st.continuityMajor} major) from the automated fact check. An AI reading would assess narrative consistency more deeply.` } : na("Run a Copy Edit or Developmental Edit to check continuity.");
  }
  for (const k of aiKeys) if (!scores[k]) scores[k] = na("Requires an AI reading of the story (connect a free model in Settings, then run a Developmental Edit or Full Review).");
  scores.overall = overallFrom(scores);
  const audit = getAnalysis<any>(c.ms.id, "publication");
  scores.publication = audit ? { score: audit.score, basis: "measured", explanation: "From the publication-readiness audit." } : na("Run the publication audit.");

  // Per-chapter scores: AI chapter score where available, otherwise language-based.
  const chScore = db().prepare("UPDATE chapters SET score = ? WHERE id = ? AND score IS NULL");
  const chStats = chs.map((ch) => {
    const mm = computeMetrics(ch.paragraphs.map((p) => p.text));
    const cs = languageScores(mm, stat(open.filter((i) => i.chapter_id === ch.id)));
    const lang = Math.round(((cs.grammar.score ?? 0) + (cs.sentence.score ?? 0) + (cs.vocabulary.score ?? 0) + (cs.readability.score ?? 0)) / 4);
    chScore.run(lang, ch.id);
    return { id: ch.id, lang };
  });
  const sev = (s: string) => open.filter((i) => i.severity === s).length;
  const stageCount = (s: string) => open.filter((i) => i.stage === s).length;
  const report = {
    mode: c.job.mode,
    aiUsed: c.ai,
    model: c.ai ? `${c.settings.model}` : null,
    generatedAt: now(),
    metrics: m,
    scores,
    verdict: dev?.verdict ?? builtinVerdict(scores, m, open.length),
    strengths: dev?.strengths ?? builtinStrengths(scores, m),
    majorWeaknesses: dev?.major_weaknesses ?? builtinWeaknesses(scores, open),
    minorWeaknesses: dev?.minor_weaknesses ?? [],
    criticalCorrections: dev?.critical_corrections ?? [],
    recommendations: dev?.recommendations ?? builtinRecommendations(scores, open),
    opening: dev?.opening ?? null,
    ending: dev?.ending ?? null,
    counts: { open: open.length, total: issueRows.length, critical: sev("critical"), major: sev("major"), moderate: sev("moderate"), minor: sev("minor"), objective: open.filter((i) => i.objective).length, subjective: open.filter((i) => !i.objective).length, byStage: { proofread: stageCount("proofread"), copy: stageCount("copy"), line: stageCount("line"), developmental: stageCount("developmental"), continuity: stageCount("continuity") } },
    chapters: chStats,
    limitations: [
      ...(c.ai ? [`AI analysis was performed by ${c.settings.model}. Smaller local models can miss subtle problems or misjudge intent; every AI finding is linked to the passage it refers to so you can verify it. Quotes that could not be found in your text were discarded automatically.`] : ["This report was produced by the built-in engine only. Story-level categories (plot, character, dialogue, emotional impact, originality) are not assessed without an AI model. Connect a free local model (Ollama) in Settings for a full editorial reading."]),
      "Automated editing cannot replace the judgement of the author. Treat subjective recommendations as suggestions, not rules.",
    ],
  };
  setAnalysis(c.ms.id, "report", report, c.ai);
  db().prepare("UPDATE manuscripts SET overall_score = ?, last_mode = ?, updated_at = ? WHERE id = ?").run(scores.overall?.score ?? null, c.job.mode, now(), c.ms.id);
}

function builtinVerdict(s: Partial<Scores>, m: ReturnType<typeof computeMetrics>, open: number) {
  const g = s.grammar?.score ?? 0;
  return `Language-level assessment (built-in engine): the prose reads at a Flesch ease of ${m.fleschEase} with an average sentence of ${m.avgSentence} words. ${g >= 90 ? "Mechanics are clean." : g >= 75 ? "Mechanics are generally sound but need a careful copy-edit pass." : g ? "Mechanical errors are frequent enough to need thorough correction before submission." : ""} ${open} open findings are listed in the revision workspace. A verdict on story, character and structure requires an AI reading.`;
}
function builtinStrengths(s: Partial<Scores>, m: ReturnType<typeof computeMetrics>) {
  const out: string[] = [];
  if ((s.grammar?.score ?? 0) >= 85) out.push("Clean mechanics — few spelling, punctuation or grammar errors.");
  if (m.sentenceCv >= 0.5) out.push("Good variety in sentence length gives the prose rhythm.");
  if (m.fleschEase >= 60 && m.fleschEase <= 85) out.push("Readability sits in the range typical of commercial fiction.");
  if ((s.vocabulary?.score ?? 0) >= 75) out.push("Rich, varied vocabulary.");
  if (m.dialoguePct >= 20 && m.dialoguePct <= 55) out.push(`Balanced mix of dialogue (${m.dialoguePct}%) and narration.`);
  return out;
}
function builtinWeaknesses(s: Partial<Scores>, open: any[]) {
  const out: string[] = [];
  if ((s.grammar?.score ?? 100) < 75) out.push("Frequent mechanical errors (see Proofreading and Copy Editing issues).");
  if ((s.sentence?.score ?? 100) < 70) out.push("Sentence construction needs attention: long or monotonous sentences.");
  const cont = open.filter((i) => i.stage === "continuity").length;
  if (cont) out.push(`${cont} continuity problems were detected between chapters.`);
  return out;
}
function builtinRecommendations(s: Partial<Scores>, open: any[]) {
  const out: string[] = [];
  if (open.some((i) => i.severity === "critical" || i.severity === "major")) out.push("Resolve the critical and major issues first — they are listed at the top of the Issues view.");
  out.push("Work through objective errors (spelling, punctuation, grammar) before stylistic suggestions.");
  if ((s.readability?.score ?? 100) < 70) out.push("Break up long sentences to improve readability.");
  out.push("Connect a free AI model in Settings and run a Developmental Edit for story-level feedback.");
  return out;
}

// ================================================================ Stage 9
export async function stageAudit(c: RunCtx) {
  const counts = db().prepare("SELECT SUM(severity='critical') AS crit, SUM(severity='major') AS maj, SUM(objective=1) AS obj FROM issues WHERE manuscript_id = ? AND status = 'open'").get(c.ms.id) as any;
  const audit = publicationAudit(c.chapters, { genre: c.ms.genre, openCritical: counts.crit ?? 0, openMajor: counts.maj ?? 0, openObjective: counts.obj ?? 0, title: c.ms.title, author: c.ms.author });
  setAnalysis(c.ms.id, "publication", audit, false);
  // Keep the report's publication score in sync.
  const rep = getAnalysis<any>(c.ms.id, "report");
  if (rep) {
    rep.scores.publication = { score: audit.score, basis: "measured", explanation: "From the publication-readiness audit." };
    delete rep._updated;
    delete rep._ai;
    setAnalysis(c.ms.id, "report", rep, !!rep.aiUsed);
  }
}

export async function stageWorkspace(c: RunCtx) {
  const n = (db().prepare("SELECT COUNT(*) AS n FROM issues WHERE manuscript_id = ? AND status = 'open'").get(c.ms.id) as any).n;
  c.log(`Revision workspace ready with ${n} open findings.`);
}

export const RUNNERS: Record<StageId, (c: RunCtx) => Promise<void>> = {
  extract: stageExtract,
  understand: stageUnderstand,
  chapters: stageChapters,
  continuity: stageContinuity,
  language: stageLanguage,
  developmental: stageDevelopmental,
  intelligence: stageIntelligence,
  report: stageReport,
  workspace: stageWorkspace,
  audit: stageAudit,
};

export { aiEnabled };

/** Regenerates one Book Intelligence section on demand (from the Story Intelligence page). */
export async function regenerateIntelligence(ms: ManuscriptRow, settings: AISettings, key: string) {
  if (!aiEnabled(settings)) throw new AIError("Book intelligence needs an AI model. Connect one in Settings → AI Provider.");
  const hasBible = db().prepare("SELECT 1 FROM chapters WHERE manuscript_id = ? AND intel_json IS NOT NULL").get(ms.id);
  if (!hasBible) throw new AIError("Run a Developmental Edit or Full Editorial Review first — book intelligence is built from the chapter-by-chapter reading.");
  const fake: JobRow = { id: "adhoc", manuscript_id: ms.id, user_id: ms.user_id, mode: "full", content_hash: "", status: "running", stage: "intelligence", stage_index: 0, progress: 0, message: null, error: null, ai_used: 1, log_json: "[]", created_at: now(), started_at: now(), finished_at: null, heartbeat_at: null };
  const logs: string[] = [];
  const ctx: RunCtx = {
    job: fake, ms, settings, ai: true, chapters: loadRChapters(ms.id),
    log: (m) => logs.push(m), progress: () => {}, done: (_s, k) => k !== key, result: () => null, record: () => {}, checkCancelled: () => {},
  };
  await stageIntelligence(ctx);
  if (logs.some((l) => /could not be generated/.test(l))) throw new AIError(logs.find((l) => /could not be generated/.test(l))!);
  return { ok: true };
}
