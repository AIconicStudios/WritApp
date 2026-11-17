import { msRoute } from "@/lib/http";
import { db, json } from "@/lib/db";

export const GET = msRoute(async (req, _user, ms) => {
  const u = new URL(req.url);
  const where = ["i.manuscript_id = ?"];
  const args: unknown[] = [ms.id];
  const f = (k: string, col: string) => {
    const v = u.searchParams.get(k);
    if (v) {
      const vals = v.split(",");
      where.push(`${col} IN (${vals.map(() => "?").join(",")})`);
      args.push(...vals);
    }
  };
  f("stage", "i.stage");
  f("severity", "i.severity");
  f("chapter", "i.chapter_id");
  f("source", "i.source");
  const status = u.searchParams.get("status") ?? "open";
  if (status !== "all") f("status", "i.status");
  const obj = u.searchParams.get("objective");
  if (obj === "1" || obj === "0") (where.push("i.objective = ?"), args.push(+obj));
  const q = u.searchParams.get("q");
  if (q) (where.push("(i.original_text LIKE ? OR i.explanation LIKE ? OR i.category LIKE ?)"), args.push(`%${q}%`, `%${q}%`, `%${q}%`));
  const limit = Math.min(500, +(u.searchParams.get("limit") ?? 200));
  const offset = +(u.searchParams.get("offset") ?? 0);
  const sql = `FROM issues i LEFT JOIN chapters c ON c.id = i.chapter_id LEFT JOIN paragraphs p ON p.id = i.paragraph_id WHERE ${where.join(" AND ")}`;
  const rows = db().prepare(`SELECT i.*, c.title AS chapter_title, c.idx AS chapter_idx, p.idx AS paragraph_idx ${sql} ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END, c.idx, p.idx LIMIT ? OFFSET ?`).all(...args, limit, offset) as any[];
  const total = (db().prepare(`SELECT COUNT(*) AS n ${sql}`).get(...args) as any).n;
  const facets = db().prepare("SELECT stage, severity, status, objective, COUNT(*) AS n FROM issues WHERE manuscript_id = ? GROUP BY stage, severity, status, objective").all(ms.id);
  return { issues: rows.map((r) => ({ ...r, refs: json(r.refs_json, []), refs_json: undefined })), total, facets };
});
