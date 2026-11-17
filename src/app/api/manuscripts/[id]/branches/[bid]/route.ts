import { body, msRoute } from "@/lib/http";
import { db, now } from "@/lib/db";
import { mergeBranch, saveBranchVersion } from "@/lib/creative";
import { HttpError } from "@/lib/auth";

export const GET = msRoute(async (_req, _user, ms, p) => {
  const branch = db().prepare("SELECT * FROM branches WHERE id = ? AND manuscript_id = ?").get(p.bid, ms.id);
  if (!branch) throw new HttpError(404, "Branch not found.");
  const versions = db().prepare("SELECT * FROM branch_versions WHERE branch_id = ? ORDER BY created_at DESC").all(p.bid);
  return { branch, versions };
});

export const POST = msRoute(async (req, _user, ms, p) => {
  const b = await body(req);
  const branch = db().prepare("SELECT * FROM branches WHERE id = ? AND manuscript_id = ?").get(p.bid, ms.id) as any;
  if (!branch) throw new HttpError(404, "Branch not found.");
  if (b.action === "save") {
    saveBranchVersion(p.bid, String(b.content ?? ""), String(b.note ?? ""));
    return { ok: true };
  }
  if (b.action === "merge") {
    if (!b.confirm) throw new HttpError(400, "Merging changes the official manuscript — confirmation required.");
    return mergeBranch(ms, p.bid, String(b.anchorId ?? ""));
  }
  if (b.action === "archive" || b.action === "restore") {
    db().prepare("UPDATE branches SET status = ?, updated_at = ? WHERE id = ?").run(b.action === "archive" ? "archived" : "experimental", now(), p.bid);
    return { ok: true };
  }
  if (b.action === "rename") {
    db().prepare("UPDATE branches SET name = ?, description = ?, updated_at = ? WHERE id = ?").run(String(b.name ?? branch.name), String(b.description ?? branch.description ?? ""), now(), p.bid);
    return { ok: true };
  }
  throw new HttpError(400, "Unknown action.");
});

export const DELETE = msRoute(async (_req, _user, ms, p) => {
  db().prepare("DELETE FROM branches WHERE id = ? AND manuscript_id = ?").run(p.bid, ms.id);
  return { ok: true };
});
