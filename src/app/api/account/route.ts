import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { body, route } from "@/lib/http";
import { db, DATA_DIR } from "@/lib/db";
import { HttpError, endSession } from "@/lib/auth";

export const PATCH = route(async (req, user) => {
  const b = await body(req);
  if (b.name !== undefined) {
    if (!String(b.name).trim()) throw new HttpError(400, "Name cannot be empty.");
    db().prepare("UPDATE users SET name = ? WHERE id = ?").run(String(b.name).trim(), user.id);
  }
  if (b.newPassword !== undefined) {
    const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
    if (!(await bcrypt.compare(String(b.currentPassword ?? ""), row.password_hash))) throw new HttpError(400, "Your current password is incorrect.");
    if (String(b.newPassword).length < 8) throw new HttpError(400, "New password must be at least 8 characters.");
    db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await bcrypt.hash(String(b.newPassword), 11), user.id);
    db().prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    return { ok: true, signedOut: true };
  }
  return { ok: true };
});

/** Permanently deletes the account and every manuscript, upload and export belonging to it. */
export const DELETE = route(async (req, user) => {
  const b = await body(req);
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!(await bcrypt.compare(String(b.password ?? ""), row.password_hash))) throw new HttpError(400, "Password is incorrect.");
  const files = [
    ...(db().prepare("SELECT file_path FROM manuscripts WHERE user_id = ?").all(user.id) as any[]).map((r) => path.join(DATA_DIR, "uploads", r.file_path)),
    ...(db().prepare("SELECT file_path FROM exports WHERE user_id = ?").all(user.id) as any[]).map((r) => path.join(DATA_DIR, r.file_path)),
  ];
  db().prepare("DELETE FROM users WHERE id = ?").run(user.id);
  for (const f of files) fs.rmSync(f, { force: true });
  await endSession();
  return { ok: true };
});
