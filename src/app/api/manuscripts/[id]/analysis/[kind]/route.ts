import { msRoute } from "@/lib/http";
import { getAnalysis } from "@/lib/repo";

const ALLOWED = new Set(["report", "publication", "summary", "characters", "conflicts", "plot", "themes", "setting", "timeline", "developmental", "builtin_intel", "ingest"]);

export const GET = msRoute(async (_req, _user, ms, p) => {
  if (!ALLOWED.has(p.kind)) return { data: null };
  return { data: getAnalysis(ms.id, p.kind) };
});
