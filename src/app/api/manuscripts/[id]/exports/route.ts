import { body, msRoute } from "@/lib/http";
import { db } from "@/lib/db";
import { EXPORTS, generateExport } from "@/lib/export";

export const maxDuration = 300;

export const GET = msRoute(async (_req, _user, ms) => {
  const rows = db().prepare("SELECT id, kind, format, file_name, size, created_at FROM exports WHERE manuscript_id = ? ORDER BY created_at DESC").all(ms.id);
  return { exports: rows, available: EXPORTS };
});

export const POST = msRoute(async (req, user, ms) => {
  const b = await body(req);
  const x = await generateExport(ms, user.id, String(b.kind), String(b.format), { trim: b.trim });
  return { id: x.id, fileName: x.fileName, size: x.size };
});
