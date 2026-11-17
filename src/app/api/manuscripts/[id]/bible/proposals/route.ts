import { body, msRoute } from "@/lib/http";
import { resolveProposals } from "@/lib/creative";

export const POST = msRoute(async (req, _user, ms) => {
  const b = await body(req);
  resolveProposals(ms, Array.isArray(b.ids) ? b.ids : [], !!b.accept);
  return { ok: true };
});
