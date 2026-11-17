import { db, json, now, uid } from "./db";
import type { ChapterRow, DraftIssue, ParagraphRow, Ref, BibleSection } from "./types";
import type { RChapter } from "./engine/rules";
import { countWords, truncate } from "./text";
import { sha256 } from "./secure";

// ---------------------------------------------------------------- chapters & paragraphs
export function getChapters(msId: string): ChapterRow[] {
  return db().prepare("SELECT * FROM chapters WHERE manuscript_id = ? ORDER BY idx").all(msId) as ChapterRow[];
}

export function getParagraphs(chapterId: string): ParagraphRow[] {
  return db().prepare("SELECT * FROM paragraphs WHERE chapter_id = ? AND deleted = 0 ORDER BY idx").all(chapterId) as ParagraphRow[];
}

export function loadRChapters(msId: string): RChapter[] {
  const chs = getChapters(msId);
  const paras = db().prepare("SELECT id, chapter_id, idx, current_text, style FROM paragraphs WHERE manuscript_id = ? AND deleted = 0 ORDER BY global_idx, idx").all(msId) as { id: string; chapter_id: string; idx: number; current_text: string; style: string }[];
  const by = new Map<string, RChapter["paragraphs"]>();
  for (const p of paras) {
    if (!by.has(p.chapter_id)) by.set(p.chapter_id, []);
    by.get(p.chapter_id)!.push({ id: p.id, idx: p.idx, text: p.current_text, style: p.style });
  }
  return chs.map((c) => ({ id: c.id, idx: c.idx, title: c.title, heading: c.heading, kind: c.kind, number: c.number, matterType: c.matter_type, paragraphs: (by.get(c.id) ?? []).sort((a, b) => a.idx - b.idx) }));
}

/** Content hash of the current working text — used to prevent duplicate processing. */
export function contentHash(msId: string): string {
  const rows = db().prepare("SELECT current_text FROM paragraphs WHERE manuscript_id = ? AND deleted = 0 ORDER BY global_idx, idx").all(msId) as { current_text: string }[];
  return sha256(rows.map((r) => r.current_text).join("\n"));
}

export function refreshCounts(msId: string) {
  const chs = getChapters(msId);
  let total = 0;
  const upd = db().prepare("UPDATE chapters SET word_count = ? WHERE id = ?");
  for (const c of chs) {
    const wc = getParagraphs(c.id).reduce((n, p) => n + countWords(p.current_text), 0);
    upd.run(wc, c.id);
    total += wc;
  }
  db().prepare("UPDATE manuscripts SET word_count = ?, content_hash = ?, updated_at = ? WHERE id = ?").run(total, contentHash(msId), now(), msId);
}

/** Every change to the working text is versioned. The original_text column is never modified. */
export function setParagraphText(p: ParagraphRow, text: string, source: string, note?: string) {
  if (text === p.current_text) return;
  db().prepare("INSERT INTO paragraph_versions (id, paragraph_id, manuscript_id, text, previous_text, source, note, created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid("v_"), p.id, p.manuscript_id, text, p.current_text, source, note ?? null, now());
  db().prepare("UPDATE paragraphs SET current_text = ?, updated_at = ? WHERE id = ?").run(text, now(), p.id);
  db().prepare("UPDATE manuscripts SET updated_at = ? WHERE id = ?").run(now(), p.manuscript_id);
}

export function getParagraph(id: string): ParagraphRow | undefined {
  return db().prepare("SELECT * FROM paragraphs WHERE id = ?").get(id) as ParagraphRow | undefined;
}

/** Inserts new paragraphs after an anchor paragraph (used when the author incorporates new writing). */
export function insertParagraphsAfter(anchor: ParagraphRow, texts: string[], source: string, note: string): ParagraphRow[] {
  const d = db();
  const n = texts.length;
  d.prepare("UPDATE paragraphs SET idx = idx + ? WHERE chapter_id = ? AND idx > ?").run(n, anchor.chapter_id, anchor.idx);
  d.prepare("UPDATE paragraphs SET global_idx = global_idx + ? WHERE manuscript_id = ? AND global_idx > ?").run(n, anchor.manuscript_id, anchor.global_idx);
  const out: ParagraphRow[] = [];
  texts.forEach((t, i) => {
    const row: ParagraphRow = { id: uid("p_"), manuscript_id: anchor.manuscript_id, chapter_id: anchor.chapter_id, idx: anchor.idx + 1 + i, global_idx: anchor.global_idx + 1 + i, style: /^\s*(\*\s*){3}$|^\s*#\s*$/.test(t) ? "scene_break" : "p", original_text: "", current_text: t, inserted: 1, deleted: 0, updated_at: now() };
    d.prepare("INSERT INTO paragraphs (id, manuscript_id, chapter_id, idx, global_idx, style, original_text, current_text, inserted, deleted, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(row.id, row.manuscript_id, row.chapter_id, row.idx, row.global_idx, row.style, row.original_text, row.current_text, 1, 0, row.updated_at);
    d.prepare("INSERT INTO paragraph_versions (id, paragraph_id, manuscript_id, text, previous_text, source, note, created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid("v_"), row.id, row.manuscript_id, t, null, source, note, now());
    out.push(row);
  });
  return out;
}

// ---------------------------------------------------------------- issues
export function saveIssues(msId: string, jobId: string | null, issues: DraftIssue[]) {
  const ins = db().prepare(
    `INSERT INTO issues (id, manuscript_id, job_id, chapter_id, paragraph_id, stage, category, rule, severity, objective, original_text, explanation, suggestion, revised_text, reason, refs_json, source, confidence, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?)`,
  );
  const t = now();
  for (const i of issues) {
    ins.run(uid("i_"), msId, jobId, i.chapterId ?? null, i.paragraphId ?? null, i.stage, i.category, i.rule ?? null, normSeverity(i.severity), i.objective ? 1 : 0, i.original ?? null, i.explanation, i.suggestion ?? null, i.revised ?? null, i.reason ?? null, i.refs ? JSON.stringify(i.refs) : null, i.source, i.confidence ?? null, t, t);
  }
}

export function normSeverity(s: string): "critical" | "major" | "moderate" | "minor" {
  const l = (s || "").toLowerCase();
  if (l.startsWith("crit")) return "critical";
  if (l.startsWith("maj") || l === "high") return "major";
  if (l.startsWith("mod") || l === "medium") return "moderate";
  return "minor";
}

// ---------------------------------------------------------------- analyses
export function setAnalysis(msId: string, kind: string, data: unknown, ai = false) {
  db().prepare("INSERT INTO analyses (manuscript_id, kind, data_json, ai_generated, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(manuscript_id, kind) DO UPDATE SET data_json = excluded.data_json, ai_generated = excluded.ai_generated, updated_at = excluded.updated_at").run(msId, kind, JSON.stringify(data), ai ? 1 : 0, now());
}
export function getAnalysis<T = any>(msId: string, kind: string): (T & { _updated?: number; _ai?: boolean }) | null {
  const r = db().prepare("SELECT data_json, updated_at, ai_generated FROM analyses WHERE manuscript_id = ? AND kind = ?").get(msId, kind) as { data_json: string; updated_at: number; ai_generated: number } | undefined;
  if (!r) return null;
  const d = json<any>(r.data_json, null);
  if (d && typeof d === "object" && !Array.isArray(d)) {
    d._updated = r.updated_at;
    d._ai = !!r.ai_generated;
  }
  return d;
}

// ---------------------------------------------------------------- story bible
export type BibleRow = { id: string; manuscript_id: string; section: BibleSection; name: string; summary: string | null; data_json: string; refs_json: string; status: string; origin: string; author_locked: number; sort_key: number; created_at: number; updated_at: number };

export function bibleEntries(msId: string, section?: string, includeProposed = false): BibleRow[] {
  const st = includeProposed ? "" : " AND status = 'official'";
  if (section) return db().prepare(`SELECT * FROM bible_entries WHERE manuscript_id = ? AND section = ?${st} ORDER BY sort_key, name`).all(msId, section) as BibleRow[];
  return db().prepare(`SELECT * FROM bible_entries WHERE manuscript_id = ?${st} ORDER BY section, sort_key, name`).all(msId) as BibleRow[];
}

export function upsertBible(msId: string, section: BibleSection, name: string, summary: string | null, data: Record<string, unknown>, refs: Ref[], origin: string, sortKey = 0, status = "official"): string {
  const existing = db().prepare("SELECT * FROM bible_entries WHERE manuscript_id = ? AND section = ? AND lower(name) = lower(?) AND status = ?").get(msId, section, name, status) as BibleRow | undefined;
  if (existing) {
    if (existing.author_locked) return existing.id; // author edits always win
    const mergedRefs = dedupeRefs([...json<Ref[]>(existing.refs_json, []), ...refs]).slice(0, 25);
    db().prepare("UPDATE bible_entries SET summary = COALESCE(?, summary), data_json = ?, refs_json = ?, sort_key = ?, updated_at = ? WHERE id = ?").run(summary, JSON.stringify({ ...json(existing.data_json, {}), ...data }), JSON.stringify(mergedRefs), Math.min(existing.sort_key, sortKey), now(), existing.id);
    return existing.id;
  }
  const id = uid("b_");
  db().prepare("INSERT INTO bible_entries (id, manuscript_id, section, name, summary, data_json, refs_json, status, origin, author_locked, sort_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)").run(id, msId, section, name, summary, JSON.stringify(data), JSON.stringify(dedupeRefs(refs).slice(0, 25)), status, origin, sortKey, now(), now());
  return id;
}

function dedupeRefs(refs: Ref[]) {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.chapterIdx}|${r.paragraphIdx}|${r.quote}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Removes machine-generated bible content (not author-edited entries) before a fresh analysis. */
export function clearMachineBible(msId: string) {
  db().prepare("DELETE FROM bible_entries WHERE manuscript_id = ? AND author_locked = 0 AND origin IN ('builtin','ai') AND status = 'official'").run(msId);
  db().prepare("DELETE FROM facts WHERE manuscript_id = ? AND source IN ('rule','ai')").run(msId);
}

// ---------------------------------------------------------------- story context for AI prompts
export function chapterSummaries(msId: string, upTo?: number, maxWords = 2500): string {
  const chs = getChapters(msId).filter((c) => c.kind === "chapter" && (upTo === undefined || c.idx <= upTo));
  const items = chs.map((c) => {
    const intel = json<any>(c.intel_json, {});
    return { idx: c.idx, n: c.number, title: c.title, summary: (intel.summary as string) || "", short: (intel.summary as string)?.split(/(?<=[.!?])\s/)[0] ?? "" };
  });
  const full = items.map((i) => `Chapter index ${i.idx} — ${i.title}: ${i.summary || "(not yet summarised)"}`).join("\n");
  if (countWords(full) <= maxWords) return full;
  // Compress older chapters to one sentence, keep the last 6 in full.
  return items.map((i, k) => `Chapter index ${i.idx} — ${i.title}: ${k >= items.length - 6 ? i.summary : i.short}`).join("\n");
}

export function storyContext(msId: string, opts: { upToChapter?: number; focus?: string[]; maxWords?: number } = {}): string {
  const maxWords = opts.maxWords ?? 1800;
  const chars = bibleEntries(msId, "characters");
  const rels = bibleEntries(msId, "relationships");
  const locs = bibleEntries(msId, "locations");
  const rules = bibleEntries(msId, "rules");
  const objs = bibleEntries(msId, "objects");
  const conflicts = bibleEntries(msId, "conflicts");
  const history = bibleEntries(msId, "history");
  const focus = new Set((opts.focus ?? []).map((s) => s.toLowerCase()));
  const charScore = (c: BibleRow) => (focus.has(c.name.toLowerCase()) ? 1000 : 0) + (json<any>(c.data_json, {}).appearances?.length ?? 0);
  const topChars = [...chars].sort((a, b) => charScore(b) - charScore(a)).slice(0, 14);
  const parts: string[] = [];
  if (topChars.length)
    parts.push(
      "CHARACTERS:\n" +
        topChars
          .map((c) => {
            const d = json<any>(c.data_json, {});
            const bits = [c.summary, d.role && `role: ${d.role}`, d.traits?.length && `traits: ${d.traits.slice(0, 6).join(", ")}`, d.wants?.length && `wants: ${[].concat(d.wants).slice(-2).join("; ")}`, d.physical && `appearance: ${d.physical}`, d.fate && `status/fate: ${d.fate}`, d.appearances?.length && `appears in chapters ${d.appearances.slice(0, 12).join(", ")}`].filter(Boolean);
            return `- ${c.name}${d.aliases?.length ? ` (also: ${d.aliases.slice(0, 3).join(", ")})` : ""}: ${bits.join("; ")}`;
          })
          .join("\n"),
    );
  if (rels.length) parts.push("RELATIONSHIPS:\n" + rels.slice(0, 25).map((r) => { const d = json<any>(r.data_json, {}); return `- ${d.a} & ${d.b}: ${d.type}${r.summary ? " — " + r.summary : ""}`; }).join("\n"));
  if (conflicts.length) parts.push("CONFLICTS:\n" + conflicts.slice(0, 12).map((c) => `- ${c.name}${c.summary ? ": " + c.summary : ""}`).join("\n"));
  if (locs.length) parts.push("LOCATIONS:\n" + locs.slice(0, 10).map((l) => `- ${l.name}${l.summary ? ": " + truncate(l.summary, 140) : ""}`).join("\n"));
  if (rules.length) parts.push("WORLD RULES:\n" + rules.slice(0, 10).map((r) => `- ${r.name}`).join("\n"));
  if (objs.length) parts.push("IMPORTANT OBJECTS:\n" + objs.slice(0, 10).map((o) => `- ${o.name}${o.summary ? ": " + truncate(o.summary, 120) : ""}`).join("\n"));
  if (history.length) parts.push("ESTABLISHED FACTS:\n" + history.slice(0, 15).map((h) => `- ${h.name}${h.summary ? ": " + h.summary : ""}`).join("\n"));
  const facts = db().prepare("SELECT subject, attribute, value, chapter_idx FROM facts WHERE manuscript_id = ? AND status = 'official' ORDER BY chapter_idx LIMIT 80").all(msId) as any[];
  if (facts.length) parts.push("ATTRIBUTE FACTS:\n" + facts.filter((f) => !focus.size || focus.has(String(f.subject).toLowerCase()) || facts.length < 40).slice(0, 40).map((f) => `- ${f.subject} — ${f.attribute}: ${f.value} (ch. index ${f.chapter_idx})`).join("\n"));
  const unresolved = getAnalysis<any>(msId, "plot")?.unresolved as string[] | undefined;
  if (unresolved?.length) parts.push("UNRESOLVED STORYLINES:\n" + unresolved.slice(0, 10).map((u) => `- ${u}`).join("\n"));
  let ctx = parts.join("\n\n");
  const budgetForSummaries = Math.max(400, maxWords - countWords(ctx));
  ctx += "\n\nCHAPTER SUMMARIES (in order):\n" + chapterSummaries(msId, opts.upToChapter, budgetForSummaries);
  return ctx;
}

/** A sample of the author's own prose for voice matching. */
export function voiceSample(msId: string, nearChapterId?: string, words = 350): string {
  const rows = (nearChapterId
    ? db().prepare("SELECT current_text FROM paragraphs WHERE chapter_id = ? AND deleted = 0 AND style = 'p' AND inserted = 0 ORDER BY idx").all(nearChapterId)
    : db().prepare("SELECT p.current_text FROM paragraphs p JOIN chapters c ON c.id = p.chapter_id WHERE p.manuscript_id = ? AND c.kind = 'chapter' AND p.deleted = 0 AND p.style = 'p' AND p.inserted = 0 ORDER BY p.global_idx LIMIT 60").all(msId)) as { current_text: string }[];
  let out = "";
  for (const r of rows) {
    if (countWords(r.current_text) < 25) continue;
    out += r.current_text + "\n\n";
    if (countWords(out) > words) break;
  }
  return out.trim() || "(no sample available)";
}
