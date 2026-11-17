import { msRoute } from "@/lib/http";
import { db, json } from "@/lib/db";
import { getParagraphs } from "@/lib/repo";
import { HttpError } from "@/lib/auth";

export const GET = msRoute(async (_req, _user, ms, p) => {
  const ch = db().prepare("SELECT * FROM chapters WHERE id = ? AND manuscript_id = ?").get(p.cid, ms.id) as any;
  if (!ch) throw new HttpError(404, "Chapter not found.");
  const paragraphs = getParagraphs(ch.id).map((x) => ({ id: x.id, idx: x.idx, style: x.style, text: x.current_text, changed: x.current_text !== x.original_text, inserted: !!x.inserted }));
  const issues = db().prepare("SELECT * FROM issues WHERE manuscript_id = ? AND chapter_id = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END").all(ms.id, ch.id) as any[];
  const nav = db().prepare("SELECT id, idx, title, kind FROM chapters WHERE manuscript_id = ? ORDER BY idx").all(ms.id) as any[];
  return { chapter: { ...ch, stats: json(ch.stats_json, null), intel: json(ch.intel_json, null), notes: json(ch.notes_json, null), stats_json: undefined, intel_json: undefined, notes_json: undefined }, paragraphs, issues: issues.map((i) => ({ ...i, refs: json(i.refs_json, []), refs_json: undefined })), nav };
});
