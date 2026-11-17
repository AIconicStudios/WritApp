import { body, msRoute } from "@/lib/http";
import { resolveIssue } from "@/lib/revisions";
import { HttpError } from "@/lib/auth";

/** Bulk accept/reject. Accepting applies each suggestion individually; stale ones are reported, not forced. */
export const POST = msRoute(async (req, _user, ms) => {
  const b = await body(req);
  if (!Array.isArray(b.ids) || !["accept", "reject"].includes(b.action)) throw new HttpError(400, "Provide ids and action.");
  let ok = 0;
  const failed: string[] = [];
  for (const id of b.ids.slice(0, 500)) {
    try {
      resolveIssue(ms, id, b.action);
      ok++;
    } catch {
      failed.push(id);
    }
  }
  return { ok, failed };
});
