import { msRoute } from "@/lib/http";
import { db } from "@/lib/db";

/** Full-text search inside the manuscript (for navigation). */
export const GET = msRoute(async (req, _user, ms) => {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return { results: [] };
  const rows = db().prepare("SELECT p.id, p.idx, p.current_text, c.id AS chapter_id, c.title FROM paragraphs p JOIN chapters c ON c.id = p.chapter_id WHERE p.manuscript_id = ? AND p.deleted = 0 AND p.current_text LIKE ? ORDER BY p.global_idx LIMIT 100").all(ms.id, `%${q}%`) as any[];
  return { results: rows.map((r) => { const at = r.current_text.toLowerCase().indexOf(q.toLowerCase()); return { paragraphId: r.id, paragraphIdx: r.idx, chapterId: r.chapter_id, chapterTitle: r.title, snippet: (at > 60 ? "…" : "") + r.current_text.slice(Math.max(0, at - 60), at + q.length + 80) + "…" }; }) };
});
