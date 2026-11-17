import { body, msRoute } from "@/lib/http";
import { db } from "@/lib/db";
import { editParagraph } from "@/lib/revisions";

export const GET = msRoute(async (_req, _user, ms, p) => {
  const versions = db().prepare("SELECT * FROM paragraph_versions WHERE paragraph_id = ? AND manuscript_id = ? ORDER BY created_at DESC").all(p.pid, ms.id);
  const para = db().prepare("SELECT id, chapter_id, idx, original_text, current_text FROM paragraphs WHERE id = ? AND manuscript_id = ?").get(p.pid, ms.id);
  return { paragraph: para, versions };
});

export const PATCH = msRoute(async (req, _user, ms, p) => {
  const b = await body(req);
  return editParagraph(ms, p.pid, String(b.text ?? ""), b.source === "rewrite" ? "rewrite" : "author", b.note);
});
