import { msRoute } from "@/lib/http";
import { db } from "@/lib/db";

export const GET = msRoute(async (_req, _user, ms) => {
  const drafts = db().prepare("SELECT d.*, p.current_text AS anchor_text FROM drafts d LEFT JOIN paragraphs p ON p.id = d.anchor_paragraph_id WHERE d.manuscript_id = ? ORDER BY d.updated_at DESC").all(ms.id);
  return { drafts };
});
