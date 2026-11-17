import { body, msRoute } from "@/lib/http";
import { db, now, uid } from "@/lib/db";
import { getParagraph, insertParagraphsAfter, refreshCounts, setParagraphText } from "@/lib/repo";
import { markStale } from "@/lib/revisions";
import { HttpError } from "@/lib/auth";

/**
 * Applies an approved multi-paragraph rewrite: paragraph i gets text i; extra revised paragraphs are
 * inserted after the last one; surplus originals are marked deleted. Every change is versioned.
 */
export const POST = msRoute(async (req, _user, ms) => {
  const b = await body(req);
  const ids: string[] = Array.isArray(b.paragraphIds) ? b.paragraphIds : [];
  const texts: string[] = (Array.isArray(b.texts) ? b.texts : []).map((t: string) => String(t).replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!ids.length || !texts.length) throw new HttpError(400, "Nothing to apply.");
  const paras = ids.map((id) => getParagraph(id));
  if (paras.some((p) => !p || p.manuscript_id !== ms.id)) throw new HttpError(404, "Paragraph not found.");
  const note = String(b.note ?? "Applied rewrite");
  db().transaction(() => {
    const n = Math.min(paras.length, texts.length);
    for (let i = 0; i < n; i++) {
      setParagraphText(paras[i]!, texts[i], "rewrite", note);
      markStale(paras[i]!.id, texts[i]);
    }
    if (texts.length > paras.length) insertParagraphsAfter(getParagraph(paras[paras.length - 1]!.id)!, texts.slice(paras.length), "rewrite", note);
    for (let i = texts.length; i < paras.length; i++) {
      const p = paras[i]!;
      db().prepare("INSERT INTO paragraph_versions (id, paragraph_id, manuscript_id, text, previous_text, source, note, created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid("v_"), p.id, ms.id, "", p.current_text, "rewrite", note + " (paragraph removed)", now());
      db().prepare("UPDATE paragraphs SET deleted = 1, updated_at = ? WHERE id = ?").run(now(), p.id);
      db().prepare("UPDATE issues SET status = 'stale' WHERE paragraph_id = ? AND status = 'open'").run(p.id);
    }
  })();
  refreshCounts(ms.id);
  return { ok: true };
});
