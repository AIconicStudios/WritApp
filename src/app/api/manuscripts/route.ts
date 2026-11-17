import { route } from "@/lib/http";
import { db, json } from "@/lib/db";
import { ingestManuscript } from "@/lib/pipeline/ingest";
import { MAX_UPLOAD_BYTES } from "@/lib/parse/extract";
import { HttpError } from "@/lib/auth";

export const runtime = "nodejs";

export const GET = route(async (_req, user) => {
  const rows = db().prepare(`SELECT m.id, m.title, m.author, m.genre, m.word_count, m.status, m.overall_score, m.last_mode, m.created_at, m.updated_at, m.file_name,
      (SELECT COUNT(*) FROM chapters c WHERE c.manuscript_id = m.id AND c.kind = 'chapter') AS chapters,
      (SELECT COUNT(*) FROM issues i WHERE i.manuscript_id = m.id AND i.status = 'open') AS open_issues,
      (SELECT j.status FROM jobs j WHERE j.manuscript_id = m.id ORDER BY j.created_at DESC LIMIT 1) AS job_status,
      (SELECT j.progress FROM jobs j WHERE j.manuscript_id = m.id ORDER BY j.created_at DESC LIMIT 1) AS job_progress,
      (SELECT data_json FROM analyses a WHERE a.manuscript_id = m.id AND a.kind = 'publication') AS pub
    FROM manuscripts m WHERE m.user_id = ? ORDER BY m.updated_at DESC`).all(user.id) as any[];
  return { manuscripts: rows.map((r) => ({ ...r, pub: undefined, publicationScore: json<any>(r.pub, null)?.score ?? null, targets: json<any>(r.pub, null)?.targets?.map((t: any) => ({ id: t.id, name: t.name, status: t.status })) ?? null })) };
});

export const POST = route(async (req, user) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 1_000_000) throw new HttpError(413, `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded.");
  const data = Buffer.from(await file.arrayBuffer());
  const r = await ingestManuscript(user.id, { name: file.name, data }, {
    title: String(form.get("title") ?? ""),
    author: String(form.get("author") ?? ""),
    genre: String(form.get("genre") ?? ""),
    audience: String(form.get("audience") ?? ""),
    force: form.get("force") === "1",
  });
  return r;
});
