import { db, now } from "./db";
import type { IssueRow, ManuscriptRow } from "./types";
import { getParagraph, refreshCounts, setParagraphText } from "./repo";
import { HttpError } from "./auth";
import { locateQuote } from "./text";

/**
 * Accept / reject / modify an editorial suggestion. The original upload is never changed;
 * accepted changes update the working text and are recorded in the version history.
 */
export function resolveIssue(ms: ManuscriptRow, issueId: string, action: "accept" | "reject" | "modify" | "reopen", modifiedText?: string) {
  const i = db().prepare("SELECT * FROM issues WHERE id = ? AND manuscript_id = ?").get(issueId, ms.id) as IssueRow | undefined;
  if (!i) throw new HttpError(404, "Issue not found.");
  if (action === "reject") {
    db().prepare("UPDATE issues SET status = 'rejected', updated_at = ? WHERE id = ?").run(now(), i.id);
    return { status: "rejected" };
  }
  if (action === "reopen") {
    db().prepare("UPDATE issues SET status = 'open', resolution_text = NULL, updated_at = ? WHERE id = ?").run(now(), i.id);
    return { status: "open" };
  }
  const replacement = action === "modify" ? modifiedText ?? "" : i.suggestion;
  if (replacement == null || !i.paragraph_id || !i.original_text) {
    // Editorial observation without an automatic fix: record it as addressed.
    db().prepare("UPDATE issues SET status = 'accepted', updated_at = ? WHERE id = ?").run(now(), i.id);
    return { status: "accepted", changed: false };
  }
  const p = getParagraph(i.paragraph_id);
  if (!p) throw new HttpError(404, "The paragraph for this issue no longer exists.");
  const loc = locateQuote(p.current_text, i.original_text);
  if (!loc) {
    db().prepare("UPDATE issues SET status = 'stale', updated_at = ? WHERE id = ?").run(now(), i.id);
    throw new HttpError(409, "The original text has changed since this suggestion was made, so it can't be applied automatically. Edit the paragraph directly instead.");
  }
  const next = p.current_text.slice(0, loc.start) + replacement + p.current_text.slice(loc.end);
  db().transaction(() => {
    setParagraphText(p, next, "suggestion", `${action === "modify" ? "Modified suggestion" : "Accepted suggestion"}: ${i.category}`);
    db().prepare("UPDATE issues SET status = ?, resolution_text = ?, updated_at = ? WHERE id = ?").run(action === "modify" ? "modified" : "accepted", replacement, now(), i.id);
    markStale(p.id, next, i.id);
  })();
  refreshCounts(ms.id);
  return { status: action === "modify" ? "modified" : "accepted", changed: true, text: next };
}

/** Other open suggestions on the same paragraph whose quoted text no longer exists become "stale". */
export function markStale(paragraphId: string, text: string, exceptId?: string) {
  const others = db().prepare("SELECT id, original_text FROM issues WHERE paragraph_id = ? AND status = 'open' AND id != ?").all(paragraphId, exceptId ?? "") as { id: string; original_text: string | null }[];
  for (const o of others) if (o.original_text && !locateQuote(text, o.original_text)) db().prepare("UPDATE issues SET status = 'stale', updated_at = ? WHERE id = ?").run(now(), o.id);
}

export function editParagraph(ms: ManuscriptRow, paragraphId: string, text: string, source = "author", note?: string) {
  const p = getParagraph(paragraphId);
  if (!p || p.manuscript_id !== ms.id) throw new HttpError(404, "Paragraph not found.");
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) throw new HttpError(400, "A paragraph cannot be empty. (To remove text, delete its words and keep at least one character, or restore an earlier version.)");
  db().transaction(() => {
    setParagraphText(p, clean, source, note);
    markStale(p.id, clean);
  })();
  refreshCounts(ms.id);
  return { ok: true };
}

export function restoreVersion(ms: ManuscriptRow, versionId: string, which: "text" | "previous" | "original") {
  const v = db().prepare("SELECT * FROM paragraph_versions WHERE id = ? AND manuscript_id = ?").get(versionId, ms.id) as any;
  if (!v) throw new HttpError(404, "Version not found.");
  const p = getParagraph(v.paragraph_id)!;
  const text = which === "original" ? p.original_text || v.text : which === "previous" ? v.previous_text ?? p.original_text : v.text;
  return editParagraph(ms, p.id, text, "restore", `Restored ${which === "original" ? "original upload" : which === "previous" ? "version before this change" : "this version"}`);
}
