import fs from "node:fs";
import path from "node:path";
import { route } from "@/lib/http";
import { db, DATA_DIR } from "@/lib/db";
import { decryptBuffer } from "@/lib/secure";
import { HttpError } from "@/lib/auth";
import { MIME } from "@/lib/export";

export const GET = route(async (_req, user, p) => {
  const x = db().prepare("SELECT * FROM exports WHERE id = ? AND user_id = ?").get(p.xid, user.id) as any;
  if (!x) throw new HttpError(404, "Export not found.");
  const file = path.join(DATA_DIR, x.file_path);
  if (!fs.existsSync(file)) throw new HttpError(410, "The exported file is no longer available. Generate it again.");
  const buf = decryptBuffer(fs.readFileSync(file));
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": MIME[x.format] ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${encodeURIComponent(x.file_name)}"; filename*=UTF-8''${encodeURIComponent(x.file_name)}`, "Cache-Control": "private, no-store" } });
});

export const DELETE = route(async (_req, user, p) => {
  const x = db().prepare("SELECT * FROM exports WHERE id = ? AND user_id = ?").get(p.xid, user.id) as any;
  if (!x) throw new HttpError(404, "Export not found.");
  fs.rmSync(path.join(DATA_DIR, x.file_path), { force: true });
  db().prepare("DELETE FROM exports WHERE id = ?").run(x.id);
  return { ok: true };
});
