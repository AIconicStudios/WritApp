import { route } from "@/lib/http";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import fs from "../fs";
import { DATA_DIR } from "@/lib/db";

/** Returns the stored export's bytes; the client saves it and opens the share sheet. */
export const GET = route(async (_req, user, p) => {
  const x = db().prepare("SELECT * FROM exports WHERE id = ? AND user_id = ?").get(p.xid, user.id) as any;
  if (!x) throw new HttpError(404, "Export not found.");
  if (!fs.existsSync(DATA_DIR + "/" + x.file_path)) throw new HttpError(410, "The exported file is no longer available. Generate it again.");
  const buf = fs.readFileSync(DATA_DIR + "/" + x.file_path) as Buffer;
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(x.file_name) } });
});
export const DELETE = route(async (_req, user, p) => {
  const x = db().prepare("SELECT * FROM exports WHERE id = ? AND user_id = ?").get(p.xid, user.id) as any;
  if (!x) throw new HttpError(404, "Export not found.");
  fs.rmSync(DATA_DIR + "/" + x.file_path);
  db().prepare("DELETE FROM exports WHERE id = ?").run(x.id);
  return { ok: true };
});
