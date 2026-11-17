import { db, json, now, uid } from "./db";
import type { ManuscriptRow, ParagraphRow } from "./types";
import { aiEnabled, getAISettings, AIError } from "./ai/provider";
import { chatJson } from "./ai/json";
import * as P from "./ai/prompts";
import { bibleEntries, chapterSummaries, getChapters, getParagraph, getParagraphs, insertParagraphsAfter, refreshCounts, storyContext, upsertBible, voiceSample } from "./repo";
import { HttpError } from "./auth";
import { countWords, truncate } from "./text";

/**
 * Creative companion: continuation scenarios, What-If, I'm Stuck, long-term planning,
 * future chapter planner, scene development, branch management and Story Bible updates.
 * Nothing here changes the manuscript unless the author explicitly incorporates a draft.
 */

function settingsFor(userId: string) {
  const s = getAISettings(userId);
  if (!aiEnabled(s)) throw new HttpError(412, "The creative companion needs an AI model. Connect a free local model (Ollama) or a free-tier API in Settings → AI Provider.");
  return s;
}

function save(msId: string, kind: string, title: string, input: unknown, output: unknown) {
  const id = uid("ci_");
  db().prepare("INSERT INTO creative_items (id, manuscript_id, kind, title, input_json, output_json, created_at) VALUES (?,?,?,?,?,?,?)").run(id, msId, kind, title, JSON.stringify(input), JSON.stringify(output), now());
  return id;
}

/** The passage before the continuation point: up to ~N words ending at the anchor paragraph. */
export function passageBefore(msId: string, anchorId: string | null, words = 700): { text: string; anchor: ParagraphRow | null; chapterIdx: number } {
  let anchor: ParagraphRow | null = anchorId ? getParagraph(anchorId) ?? null : null;
  if (anchor && anchor.manuscript_id !== msId) throw new HttpError(404, "Paragraph not found.");
  if (!anchor) {
    // Default: end of the last chapter.
    const chs = getChapters(msId).filter((c) => c.kind === "chapter");
    const last = chs[chs.length - 1];
    const ps = last ? getParagraphs(last.id) : [];
    anchor = ps[ps.length - 1] ?? null;
  }
  if (!anchor) return { text: "", anchor: null, chapterIdx: 0 };
  const rows = db().prepare("SELECT current_text FROM paragraphs WHERE manuscript_id = ? AND deleted = 0 AND global_idx <= ? ORDER BY global_idx DESC LIMIT 40").all(msId, anchor.global_idx) as { current_text: string }[];
  const out: string[] = [];
  let w = 0;
  for (const r of rows) {
    out.unshift(r.current_text);
    w += countWords(r.current_text);
    if (w >= words) break;
  }
  const ch = db().prepare("SELECT idx FROM chapters WHERE id = ?").get(anchor.chapter_id) as { idx: number };
  return { text: out.join("\n\n"), anchor, chapterIdx: ch.idx };
}

export async function helpMeContinue(userId: string, ms: ManuscriptRow, input: { anchorId?: string | null; selection?: string; request?: string; count?: number }) {
  const s = settingsFor(userId);
  const { text, anchor, chapterIdx } = passageBefore(ms.id, input.anchorId ?? null, 650);
  const passage = input.selection ? `${text}\n\n[Selected point:] ${input.selection}` : text;
  const ctx = storyContext(ms.id, { upToChapter: chapterIdx, maxWords: Math.round(s.contextWords * 0.8) });
  const count = Math.max(5, Math.min(8, input.count ?? 5));
  const r = await chatJson(s, [{ role: "system", content: P.CREATIVE_SYSTEM }, { role: "user", content: P.scenariosPrompt(ms.title, ctx, passage, input.request ?? "", count) }], P.ScenariosSchema, { maxTokens: 5000, temperature: 0.8 });
  // Continuity validation of every scenario against the Story Bible.
  const checks = await Promise.all(r.scenarios.map((sc) => validateProposal(s, ms.id, chapterIdx, `${sc.title}: ${sc.description}\nCharacters: ${sc.characters.join(", ")}\nMotivation: ${sc.motivation}`, sc.characters)));
  const scenarios = r.scenarios.map((sc, i) => ({ ...sc, validation: checks[i] }));
  const out = { situation: r.situation, scenarios, anchorId: anchor?.id ?? null, chapterIdx, passage: truncate(passage, 1200) };
  const id = save(ms.id, "continue", `Continue after ${anchor ? `chapter index ${chapterIdx}` : "the end"}`, input, out);
  return { id, ...out };
}

/** Continuity validation: AI check + deterministic checks (e.g. characters whose established fate is death). */
export async function validateProposal(s: ReturnType<typeof getAISettings>, msId: string, chapterIdx: number, proposal: string, characters: string[] = []) {
  const ctx = storyContext(msId, { upToChapter: chapterIdx, focus: characters, maxWords: Math.round(s.contextWords * 0.6) });
  const flags: { kind: string; area: string; description: string; established_fact?: string; chapter?: number; source: string }[] = [];
  // Deterministic: dead or departed characters.
  const deaths = db().prepare("SELECT subject, attribute, value, chapter_idx, quote FROM facts WHERE manuscript_id = ? AND status = 'official' AND (attribute LIKE '%dead%' OR attribute LIKE '%died%' OR value LIKE '%dead%' OR value LIKE '%died%' OR value LIKE '%killed%') AND chapter_idx <= ?").all(msId, chapterIdx) as any[];
  for (const d of deaths) if (new RegExp(`\\b${d.subject.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(proposal)) flags.push({ kind: "possible_inconsistency", area: "Character status", description: `${d.subject} appears in this proposal, but the manuscript established: “${d.quote}”.`, established_fact: `${d.subject}: ${d.attribute} ${d.value}`, chapter: d.chapter_idx, source: "Story Bible" });
  try {
    const v = await chatJson(s, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.validatePrompt(ctx, proposal) }], P.ValidationSchema, { maxTokens: 1500, temperature: 0.1 });
    for (const f of v.flags) flags.push({ ...f, source: "AI continuity check" });
    return { verdict: flags.some((f) => /direct/.test(f.kind)) ? "conflicts with the manuscript" : flags.length ? v.verdict || "minor risks" : "consistent", flags };
  } catch (e) {
    return { verdict: flags.length ? "minor risks" : "not checked", flags, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function whatIf(userId: string, ms: ManuscriptRow, question: string, anchorId?: string | null) {
  if (!question?.trim()) throw new HttpError(400, "Ask a “What if…?” question.");
  const s = settingsFor(userId);
  const { chapterIdx } = passageBefore(ms.id, anchorId ?? null, 50);
  const ctx = storyContext(ms.id, { upToChapter: anchorId ? chapterIdx : undefined, maxWords: Math.round(s.contextWords * 0.9) });
  const r = await chatJson(s, [{ role: "system", content: P.CREATIVE_SYSTEM }, { role: "user", content: P.whatIfPrompt(ms.title, ctx, question) }], P.WhatIfSchema, { maxTokens: 3500, temperature: 0.7 });
  const out = { ...r, hypothetical: true, note: "Hypothetical exploration — nothing here has been added to the Story Bible or the manuscript." };
  return { id: save(ms.id, "whatif", question, { question, anchorId }, out), ...out };
}

export async function imStuck(userId: string, ms: ManuscriptRow, problem: string, anchorId?: string | null) {
  if (!problem?.trim()) throw new HttpError(400, "Describe what you are stuck on.");
  const s = settingsFor(userId);
  const { text, chapterIdx } = anchorId ? passageBefore(ms.id, anchorId, 500) : { text: "", chapterIdx: undefined as number | undefined };
  const ctx = storyContext(ms.id, { upToChapter: chapterIdx, maxWords: Math.round(s.contextWords * 0.8) });
  const r = await chatJson(s, [{ role: "system", content: P.CREATIVE_SYSTEM }, { role: "user", content: P.stuckPrompt(ms.title, ctx, problem, text) }], P.StuckSchema, { maxTokens: 3500, temperature: 0.75 });
  return { id: save(ms.id, "stuck", problem, { problem, anchorId }, r), ...r };
}

export async function planStory(userId: string, ms: ManuscriptRow, question: string) {
  if (!question?.trim()) throw new HttpError(400, "Ask a planning question.");
  const s = settingsFor(userId);
  const ctx = storyContext(ms.id, { maxWords: Math.round(s.contextWords * 0.7) });
  const plot = db().prepare("SELECT data_json FROM analyses WHERE manuscript_id = ? AND kind = 'plot'").get(ms.id) as { data_json: string } | undefined;
  const structure = plot ? json<any>(plot.data_json, {}).stages?.map((x: any) => `${x.stage}: chapters ${x.chapters.join(",")} — ${x.description}`).join("\n") ?? "" : `${getChapters(ms.id).filter((c) => c.kind === "chapter").length} chapters written. (Run a Developmental Edit for a structural map.)`;
  const r = await chatJson(s, [{ role: "system", content: P.CREATIVE_SYSTEM }, { role: "user", content: P.planPrompt(ms.title, ctx, structure, question) }], P.PlanSchema, { maxTokens: 3500, temperature: 0.7 });
  return { id: save(ms.id, "plan", question, { question }, r), ...r };
}

export async function futurePlanner(userId: string, ms: ManuscriptRow, input: { from?: number; count?: number; direction?: string }) {
  const s = settingsFor(userId);
  const chs = getChapters(ms.id).filter((c) => c.kind === "chapter");
  const lastNum = chs.reduce((n, c) => Math.max(n, c.number ?? 0), 0) || chs.length;
  const from = input.from ?? lastNum + 1;
  const count = Math.max(3, Math.min(15, input.count ?? 10));
  const ctx = storyContext(ms.id, { maxWords: Math.round(s.contextWords * 0.5) });
  const r = await chatJson(s, [{ role: "system", content: P.CREATIVE_SYSTEM }, { role: "user", content: P.futurePlanPrompt(ms.title, ctx, chapterSummaries(ms.id, undefined, Math.round(s.contextWords * 0.6)), from, count, input.direction ?? "") }], P.FuturePlanSchema, { maxTokens: 6000, temperature: 0.75 });
  const out = { ...r, from, count, note: "A flexible possibility, not a fixed outline. Nothing is added to the Story Bible until you write and incorporate the chapters." };
  return { id: save(ms.id, "future", `Chapters ${from}–${from + count - 1}`, input, out), ...out };
}

export async function developScenario(userId: string, ms: ManuscriptRow, input: { scenario: string; format: string; words?: number; tone?: string; pacing?: string; pov?: string; style?: string; direction?: string; anchorId?: string | null; creativeItemId?: string; branchId?: string }) {
  if (!input.scenario?.trim()) throw new HttpError(400, "No scenario supplied.");
  const s = settingsFor(userId);
  const { text, anchor, chapterIdx } = passageBefore(ms.id, input.anchorId ?? null, 500);
  const ctx = storyContext(ms.id, { upToChapter: chapterIdx, maxWords: Math.round(s.contextWords * 0.6) });
  const words = Math.max(100, Math.min(input.format === "chapter" ? 4000 : 2500, input.words ?? (input.format === "chapter" ? 2500 : input.format === "scene" ? 1200 : 400)));
  const r = await chatJson(s, [{ role: "system", content: P.CREATIVE_SYSTEM }, { role: "user", content: P.developPrompt(ms.title, ctx, text, input.scenario, input.format, { ...input, words }, voiceSample(ms.id, anchor?.chapter_id)) }], P.DevelopSchema, { maxTokens: Math.min(8000, Math.round(words * 2) + 600), temperature: 0.85 });
  const validation = await validateProposal(s, ms.id, chapterIdx, r.content.slice(0, 6000));
  const draftId = uid("d_");
  db().prepare("INSERT INTO drafts (id, manuscript_id, branch_id, creative_item_id, title, content, status, anchor_paragraph_id, created_at, updated_at) VALUES (?,?,?,?,?,?,'draft',?,?,?)").run(draftId, ms.id, input.branchId ?? null, input.creativeItemId ?? null, r.title || "Untitled draft", r.content, anchor?.id ?? null, now(), now());
  return { draftId, ...r, validation, words: countWords(r.content) };
}

/** Explicit author action: insert a draft into the manuscript after its anchor paragraph. */
export function incorporateDraft(ms: ManuscriptRow, draftId: string, anchorId?: string | null, editedContent?: string) {
  const d = db().prepare("SELECT * FROM drafts WHERE id = ? AND manuscript_id = ?").get(draftId, ms.id) as any;
  if (!d) throw new HttpError(404, "Draft not found.");
  if (d.status === "incorporated") throw new HttpError(409, "This draft has already been added to the manuscript.");
  const content = (editedContent ?? d.content) as string;
  const anchor = getParagraph(anchorId || d.anchor_paragraph_id || "") ?? passageBefore(ms.id, null).anchor;
  if (!anchor || anchor.manuscript_id !== ms.id) throw new HttpError(400, "Choose where in the manuscript to insert this text.");
  const paras = content.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  const rows = db().transaction(() => {
    const r = insertParagraphsAfter(anchor, paras, "continuation", `Incorporated draft “${d.title}”`);
    db().prepare("UPDATE drafts SET status = 'incorporated', content = ?, updated_at = ? WHERE id = ?").run(content, now(), draftId);
    return r;
  })();
  refreshCounts(ms.id);
  return { inserted: rows.length, firstParagraphId: rows[0]?.id };
}

/** After incorporation: extract new facts as *proposed* Story Bible entries; the author confirms them. */
export async function proposeBibleUpdates(userId: string, ms: ManuscriptRow, draftId: string) {
  const s = settingsFor(userId);
  const d = db().prepare("SELECT * FROM drafts WHERE id = ? AND manuscript_id = ?").get(draftId, ms.id) as any;
  if (!d) throw new HttpError(404, "Draft not found.");
  if (d.status !== "incorporated") throw new HttpError(409, "Add the draft to the manuscript first — the Story Bible is only updated from text that is part of the official manuscript.");
  const r = await chatJson(s, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.newFactsPrompt(truncate(d.content, 12000)) }], P.NewFactsSchema, { maxTokens: 3000 });
  const ref = [{ label: `Incorporated draft “${d.title}”`, quote: truncate(d.content, 160) }];
  let n = 0;
  for (const c of r.characters) (upsertBible(ms.id, "characters", c.name, c.update, { update: c.update, fromDraft: draftId }, ref, "continuation", 0, "proposed"), n++);
  for (const x of r.relationships) (upsertBible(ms.id, "relationships", `${x.a} & ${x.b} (${x.type})`, x.description, { a: x.a, b: x.b, type: x.type, fromDraft: draftId }, ref, "continuation", 0, "proposed"), n++);
  for (const x of r.events) (upsertBible(ms.id, "events", x.title, x.description, { fromDraft: draftId }, ref, "continuation", 99999, "proposed"), n++);
  for (const x of r.facts) (upsertBible(ms.id, "history", `${x.subject}: ${x.attribute} — ${x.value}`, null, { subject: x.subject, attribute: x.attribute, value: x.value, fromDraft: draftId }, ref, "continuation", 0, "proposed"), n++);
  for (const x of r.conflicts) (upsertBible(ms.id, "conflicts", truncate(x.description, 120), `${x.status}: ${x.description}`, { status: x.status, fromDraft: draftId }, ref, "continuation", 0, "proposed"), n++);
  for (const x of r.locations) (upsertBible(ms.id, "locations", x.name, x.description, { fromDraft: draftId }, ref, "continuation", 0, "proposed"), n++);
  return { proposed: n };
}

/** Confirm (or discard) proposed Story Bible updates. Confirmed facts also feed continuity checking. */
export function resolveProposals(ms: ManuscriptRow, ids: string[], accept: boolean) {
  for (const id of ids) {
    const row = db().prepare("SELECT * FROM bible_entries WHERE id = ? AND manuscript_id = ? AND status = 'proposed'").get(id, ms.id) as any;
    if (!row) continue;
    if (!accept) {
      db().prepare("DELETE FROM bible_entries WHERE id = ?").run(id);
      continue;
    }
    const official = db().prepare("SELECT * FROM bible_entries WHERE manuscript_id = ? AND section = ? AND lower(name) = lower(?) AND status = 'official'").get(ms.id, row.section, row.name) as any;
    if (official) {
      const d = { ...json<any>(official.data_json, {}), ...json<any>(row.data_json, {}) };
      if (row.section === "characters") d.updates = [...(json<any>(official.data_json, {}).updates ?? []), row.summary];
      db().prepare("UPDATE bible_entries SET data_json = ?, refs_json = ?, updated_at = ?, author_locked = 1 WHERE id = ?").run(JSON.stringify(d), JSON.stringify([...json<any[]>(official.refs_json, []), ...json<any[]>(row.refs_json, [])]), now(), official.id);
      db().prepare("DELETE FROM bible_entries WHERE id = ?").run(id);
    } else db().prepare("UPDATE bible_entries SET status = 'official', author_locked = 1, updated_at = ? WHERE id = ?").run(now(), id);
    const d = json<any>(row.data_json, {});
    if (row.section === "history" && d.subject) db().prepare("INSERT INTO facts (id, manuscript_id, subject, attribute, value, chapter_id, chapter_idx, paragraph_idx, quote, source, status, created_at) VALUES (?,?,?,?,?,NULL,99999,NULL,?,'continuation','official',?)").run(uid("f_"), ms.id, d.subject, d.attribute, d.value, row.summary ?? row.name, now());
  }
}

// ---------------------------------------------------------------- Rewriting
export async function rewrite(userId: string, ms: ManuscriptRow, input: { text: string; action: string; instructions?: string; paragraphId?: string; chapterId?: string }) {
  if (!input.text?.trim()) throw new HttpError(400, "Select some text to rewrite.");
  if (countWords(input.text) > 3500) throw new HttpError(400, "Please rewrite at most about 3,500 words at a time (roughly a chapter section). For a whole chapter, rewrite it in parts so you can review each change.");
  const s = settingsFor(userId);
  let context = "";
  if (input.paragraphId) {
    const p = getParagraph(input.paragraphId);
    if (p && p.manuscript_id === ms.id) {
      const around = db().prepare("SELECT current_text FROM paragraphs WHERE chapter_id = ? AND deleted = 0 AND idx BETWEEN ? AND ? ORDER BY idx").all(p.chapter_id, p.idx - 2, p.idx + 2) as { current_text: string }[];
      context = around.map((r) => r.current_text).join("\n\n");
    }
  }
  const r = await chatJson(s, [{ role: "system", content: P.EDITOR_SYSTEM }, { role: "user", content: P.rewritePrompt(input.action, input.text, truncate(context, 3000), voiceSample(ms.id, input.chapterId), input.instructions ?? "") }], P.RewriteSchema, { maxTokens: Math.min(8000, countWords(input.text) * 3 + 600), temperature: 0.5 });
  return r;
}

// ---------------------------------------------------------------- Branches
export function createBranch(ms: ManuscriptRow, name: string, description: string, fromChapterIdx: number | null, content: string) {
  if (!name?.trim()) throw new HttpError(400, "Name the story branch.");
  const id = uid("br_");
  db().prepare("INSERT INTO branches (id, manuscript_id, name, description, from_chapter_idx, status, created_at, updated_at) VALUES (?,?,?,?,?,'experimental',?,?)").run(id, ms.id, name.trim(), description ?? "", fromChapterIdx, now(), now());
  db().prepare("INSERT INTO branch_versions (id, branch_id, content, note, created_at) VALUES (?,?,?,?,?)").run(uid("bv_"), id, content ?? "", "Created", now());
  return id;
}

export function saveBranchVersion(branchId: string, content: string, note: string) {
  db().prepare("INSERT INTO branch_versions (id, branch_id, content, note, created_at) VALUES (?,?,?,?,?)").run(uid("bv_"), branchId, content, note || "Saved", now());
  db().prepare("UPDATE branches SET updated_at = ? WHERE id = ?").run(now(), branchId);
}

/** Merge a branch into the official manuscript — only on explicit author approval. Creates a draft, then incorporates it. */
export function mergeBranch(ms: ManuscriptRow, branchId: string, anchorId: string) {
  const b = db().prepare("SELECT * FROM branches WHERE id = ? AND manuscript_id = ?").get(branchId, ms.id) as any;
  if (!b) throw new HttpError(404, "Branch not found.");
  const v = db().prepare("SELECT content FROM branch_versions WHERE branch_id = ? ORDER BY created_at DESC LIMIT 1").get(branchId) as { content: string } | undefined;
  if (!v?.content.trim()) throw new HttpError(400, "This branch has no content yet.");
  const draftId = uid("d_");
  db().prepare("INSERT INTO drafts (id, manuscript_id, branch_id, title, content, status, anchor_paragraph_id, created_at, updated_at) VALUES (?,?,?,?,?,'draft',?,?,?)").run(draftId, ms.id, branchId, `Branch: ${b.name}`, v.content, anchorId, now(), now());
  const r = incorporateDraft(ms, draftId, anchorId);
  db().prepare("UPDATE branches SET status = 'merged', updated_at = ? WHERE id = ?").run(now(), branchId);
  return { ...r, draftId };
}

export { AIError, bibleEntries };
