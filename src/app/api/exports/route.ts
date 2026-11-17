import { route } from "@/lib/http";
import { db } from "@/lib/db";

export const GET = route(async (_req, user) => {
  const rows = db().prepare("SELECT x.id, x.kind, x.format, x.file_name, x.size, x.created_at, x.manuscript_id, m.title FROM exports x JOIN manuscripts m ON m.id = x.manuscript_id WHERE x.user_id = ? ORDER BY x.created_at DESC LIMIT 300").all(user.id);
  return { exports: rows };
});
