import fs from "node:fs";
import path from "node:path";
import { body, msRoute } from "@/lib/http";
import { db, DATA_DIR, json, now } from "@/lib/db";
import { getAnalysis, getChapters } from "@/lib/repo";
import { HttpError } from "@/lib/auth";
import { aiEnabled, getAISettings } from "@/lib/ai/provider";

export const GET = msRoute(async (_req, user, ms) => {
  const chapters = getChapters(ms.id).map((c) => ({ id: c.id, idx: c.idx, kind: c.kind, matterType: c.matter_type, title: c.title, heading: c.heading, number: c.number, wordCount: c.word_count, score: c.score, summary: json<any>(c.intel_json, {}).summary ?? null }));
  const counts = db().prepare("SELECT chapter_id, COUNT(*) AS n, SUM(severity IN ('critical','major')) AS serious FROM issues WHERE manuscript_id = ? AND status = 'open' GROUP BY chapter_id").all(ms.id) as any[];
  const byCh = new Map(counts.map((c) => [c.chapter_id, c]));
  const job = db().prepare("SELECT * FROM jobs WHERE manuscript_id = ? ORDER BY created_at DESC LIMIT 1").get(ms.id) as any;
  const report = getAnalysis<any>(ms.id, "report");
  const ingest = getAnalysis<any>(ms.id, "ingest");
  const s = getAISettings(user.id);
  return {
    manuscript: ms,
    chapters: chapters.map((c) => ({ ...c, openIssues: byCh.get(c.id)?.n ?? 0, seriousIssues: byCh.get(c.id)?.serious ?? 0 })),
    job: job ? { ...job, log: json(job.log_json, []), log_json: undefined } : null,
    report: report ? { scores: report.scores, counts: report.counts, mode: report.mode, aiUsed: report.aiUsed, generatedAt: report.generatedAt } : null,
    warnings: ingest?.warnings ?? [],
    ai: { enabled: aiEnabled(s), provider: s.provider, model: s.model },
    available: Object.fromEntries((db().prepare("SELECT kind, updated_at FROM analyses WHERE manuscript_id = ?").all(ms.id) as any[]).map((r) => [r.kind, r.updated_at])),
  };
});

export const PATCH = msRoute(async (req, _user, ms) => {
  const b = await body(req);
  const title = b.title !== undefined ? String(b.title).trim() : ms.title;
  if (!title) throw new HttpError(400, "Title cannot be empty.");
  db().prepare("UPDATE manuscripts SET title = ?, author = ?, genre = ?, audience = ?, updated_at = ? WHERE id = ?").run(title.slice(0, 200), b.author !== undefined ? String(b.author).trim() || null : ms.author, b.genre !== undefined ? String(b.genre).trim() || null : ms.genre, b.audience !== undefined ? String(b.audience).trim() || null : ms.audience, now(), ms.id);
  return { ok: true };
});

export const DELETE = msRoute(async (_req, _user, ms) => {
  const exp = db().prepare("SELECT file_path FROM exports WHERE manuscript_id = ?").all(ms.id) as { file_path: string }[];
  db().prepare("DELETE FROM manuscripts WHERE id = ?").run(ms.id);
  if (ms.file_path) fs.rmSync(path.join(DATA_DIR, "uploads", ms.file_path), { force: true });
  for (const e of exp) fs.rmSync(path.join(DATA_DIR, e.file_path), { force: true });
  return { ok: true };
});
