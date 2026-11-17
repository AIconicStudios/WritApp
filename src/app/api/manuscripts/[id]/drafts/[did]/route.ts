import { body, msRoute } from "@/lib/http";
import { db, now } from "@/lib/db";
import * as C from "@/lib/creative";
import { AIError } from "@/lib/ai/provider";
import { HttpError } from "@/lib/auth";

export const maxDuration = 600;

export const PATCH = msRoute(async (req, _user, ms, p) => {
  const b = await body(req);
  const d = db().prepare("SELECT * FROM drafts WHERE id = ? AND manuscript_id = ?").get(p.did, ms.id) as any;
  if (!d) throw new HttpError(404, "Draft not found.");
  db().prepare("UPDATE drafts SET title = ?, content = ?, anchor_paragraph_id = COALESCE(?, anchor_paragraph_id), updated_at = ? WHERE id = ?").run(b.title ?? d.title, b.content ?? d.content, b.anchorId ?? null, now(), d.id);
  return { ok: true };
});

export const POST = msRoute(async (req, user, ms, p) => {
  const b = await body(req);
  try {
    if (b.action === "incorporate") return C.incorporateDraft(ms, p.did, b.anchorId, b.content);
    if (b.action === "propose_bible") return await C.proposeBibleUpdates(user.id, ms, p.did);
    if (b.action === "discard") {
      db().prepare("UPDATE drafts SET status = 'discarded', updated_at = ? WHERE id = ? AND manuscript_id = ? AND status = 'draft'").run(now(), p.did, ms.id);
      return { ok: true };
    }
  } catch (e) {
    if (e instanceof AIError) throw new HttpError(502, e.message);
    throw e;
  }
  throw new HttpError(400, "Unknown action.");
});
