import { body, route } from "@/lib/http";
import { db, json } from "@/lib/db";
import { cancelJob, resumeJob } from "@/lib/pipeline/worker";
import { PLAN, STAGE_INFO } from "@/lib/pipeline/stages";
import { HttpError } from "@/lib/auth";

export const GET = route(async (_req, user, p) => {
  const j = db().prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").get(p.jobId, user.id) as any;
  if (!j) throw new HttpError(404, "Job not found.");
  return { job: { ...j, log: json(j.log_json, []), log_json: undefined, plan: PLAN[j.mode as keyof typeof PLAN].map((s) => ({ id: s, ...STAGE_INFO[s] })) } };
});

export const POST = route(async (req, user, p) => {
  const b = await body(req);
  if (b.action === "resume") resumeJob(p.jobId, user.id);
  else if (b.action === "pause") cancelJob(p.jobId, user.id, true);
  else if (b.action === "cancel") cancelJob(p.jobId, user.id, false);
  else throw new HttpError(400, "Unknown action.");
  return { ok: true };
});
