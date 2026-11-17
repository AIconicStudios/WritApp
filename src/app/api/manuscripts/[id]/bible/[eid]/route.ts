import { body, msRoute } from "@/lib/http";
import { db, now } from "@/lib/db";
import { HttpError } from "@/lib/auth";

export const PATCH = msRoute(async (req, _user, ms, p) => {
  const b = await body(req);
  const row = db().prepare("SELECT * FROM bible_entries WHERE id = ? AND manuscript_id = ?").get(p.eid, ms.id) as any;
  if (!row) throw new HttpError(404, "Entry not found.");
  db().prepare("UPDATE bible_entries SET name = ?, summary = ?, data_json = ?, author_locked = 1, updated_at = ? WHERE id = ?").run(String(b.name ?? row.name).trim() || row.name, b.summary ?? row.summary, b.data ? JSON.stringify(b.data) : row.data_json, now(), row.id);
  return { ok: true };
});

export const DELETE = msRoute(async (_req, _user, ms, p) => {
  db().prepare("DELETE FROM bible_entries WHERE id = ? AND manuscript_id = ?").run(p.eid, ms.id);
  return { ok: true };
});
