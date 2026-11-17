import { body, msRoute } from "@/lib/http";
import { json } from "@/lib/db";
import { bibleEntries, upsertBible } from "@/lib/repo";
import { BIBLE_SECTIONS } from "@/lib/types";
import { HttpError } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = msRoute(async (_req, _user, ms) => {
  const rows = bibleEntries(ms.id, undefined, true).map((b) => ({ ...b, data: json(b.data_json, {}), refs: json(b.refs_json, []), data_json: undefined, refs_json: undefined }));
  const facts = db().prepare("SELECT subject, attribute, value, chapter_idx, quote, source FROM facts WHERE manuscript_id = ? AND status = 'official' ORDER BY subject, chapter_idx").all(ms.id);
  return { entries: rows, sections: BIBLE_SECTIONS, facts };
});

/** Author-created entry (always author-locked so automated passes never overwrite it). */
export const POST = msRoute(async (req, _user, ms) => {
  const b = await body(req);
  if (!BIBLE_SECTIONS.some((s) => s.id === b.section)) throw new HttpError(400, "Unknown section.");
  if (!String(b.name ?? "").trim()) throw new HttpError(400, "Give the entry a name.");
  const id = upsertBible(ms.id, b.section, String(b.name).trim(), b.summary ?? null, b.data ?? {}, [], "author", 0);
  db().prepare("UPDATE bible_entries SET author_locked = 1, origin = CASE WHEN origin = 'author' THEN 'author' ELSE origin END WHERE id = ?").run(id);
  return { id };
});
