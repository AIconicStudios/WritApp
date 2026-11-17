import { body, msRoute } from "@/lib/http";
import { db } from "@/lib/db";
import { createBranch } from "@/lib/creative";

export const GET = msRoute(async (_req, _user, ms) => {
  const branches = db().prepare(`SELECT b.*, (SELECT COUNT(*) FROM branch_versions v WHERE v.branch_id = b.id) AS versions,
    (SELECT content FROM branch_versions v WHERE v.branch_id = b.id ORDER BY created_at DESC LIMIT 1) AS latest FROM branches b WHERE b.manuscript_id = ? ORDER BY b.updated_at DESC`).all(ms.id);
  return { branches };
});

export const POST = msRoute(async (req, _user, ms) => {
  const b = await body(req);
  let content = String(b.content ?? "");
  if (b.fromDraftId) {
    const d = db().prepare("SELECT content FROM drafts WHERE id = ? AND manuscript_id = ?").get(b.fromDraftId, ms.id) as any;
    if (d) content = d.content;
  }
  return { id: createBranch(ms, b.name, b.description ?? "", b.fromChapterIdx ?? null, content) };
});
