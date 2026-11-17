import { body, msRoute } from "@/lib/http";
import { resolveIssue } from "@/lib/revisions";

export const POST = msRoute(async (req, _user, ms, p) => {
  const b = await body(req);
  return resolveIssue(ms, p.iid, b.action, b.text);
});
