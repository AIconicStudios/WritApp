import { body, msRoute } from "@/lib/http";
import { db, json } from "@/lib/db";
import { createJob } from "@/lib/pipeline/worker";
import { PLAN, STAGE_INFO } from "@/lib/pipeline/stages";

export const GET = msRoute(async (_req, _user, ms) => {
  const jobs = db().prepare("SELECT * FROM jobs WHERE manuscript_id = ? ORDER BY created_at DESC LIMIT 30").all(ms.id) as any[];
  return { jobs: jobs.map((j) => ({ ...j, log: json(j.log_json, []), log_json: undefined, plan: PLAN[j.mode as keyof typeof PLAN].map((s) => ({ id: s, ...STAGE_INFO[s] })) })) };
});

export const POST = msRoute(async (req, user, ms) => {
  const b = await body(req);
  const job = createJob(user.id, ms, b.mode, !!b.force);
  return { job };
});
