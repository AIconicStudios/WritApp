import { body, msRoute } from "@/lib/http";
import { db } from "@/lib/db";
import { restoreVersion } from "@/lib/revisions";

export const GET = msRoute(async (req, _user, ms) => {
  const u = new URL(req.url);
  const limit = Math.min(500, +(u.searchParams.get("limit") ?? 200));
  const rows = db().prepare(`SELECT v.*, c.title AS chapter_title, c.id AS chapter_id, p.idx AS paragraph_idx, p.current_text FROM paragraph_versions v JOIN paragraphs p ON p.id = v.paragraph_id JOIN chapters c ON c.id = p.chapter_id WHERE v.manuscript_id = ? ORDER BY v.created_at DESC LIMIT ?`).all(ms.id, limit);
  return { versions: rows };
});

export const POST = msRoute(async (req, _user, ms) => {
  const b = await body(req);
  return restoreVersion(ms, String(b.versionId), b.which === "original" ? "original" : b.which === "previous" ? "previous" : "text");
});
