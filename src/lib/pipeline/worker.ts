import { db, json, now, uid } from "../db";
import type { EditMode, JobRow, ManuscriptRow } from "../types";
import { aiEnabled, getAISettings } from "../ai/provider";
import { contentHash, loadRChapters } from "../repo";
import { Cancelled, PLAN, prepareFresh, RUNNERS, STAGE_INFO, type RunCtx } from "./stages";
import { HttpError } from "../auth";

/**
 * Background job runner. Jobs live in the database, so processing survives restarts:
 * every finished unit of work is recorded in job_units, and an interrupted job resumes
 * exactly where it stopped.
 */

declare global {
  // eslint-disable-next-line no-var
  var __cashlessWorker: { running: boolean; started: boolean; wake?: () => void } | undefined;
}

export function createJob(userId: string, ms: ManuscriptRow, mode: EditMode, force = false): JobRow {
  if (!PLAN[mode]) throw new HttpError(400, "Unknown editing mode.");
  const active = db().prepare("SELECT id FROM jobs WHERE manuscript_id = ? AND status IN ('queued','running')").get(ms.id) as { id: string } | undefined;
  if (active) throw new HttpError(409, "An analysis is already in progress for this manuscript.");
  const hash = contentHash(ms.id);
  const settings = getAISettings(userId);
  const ai = aiEnabled(settings);
  if (!force) {
    const same = db().prepare("SELECT * FROM jobs WHERE manuscript_id = ? AND mode = ? AND content_hash = ? AND status = 'completed' AND ai_used = ? ORDER BY created_at DESC LIMIT 1").get(ms.id, mode, hash, ai ? 1 : 0) as JobRow | undefined;
    if (same) throw new HttpError(409, `DUPLICATE: This manuscript has already been analysed in this mode and has not changed since. Open the existing report, or choose “Run again anyway”.`);
  }
  const job: JobRow = { id: uid("j_"), manuscript_id: ms.id, user_id: userId, mode, content_hash: hash, status: "queued", stage: PLAN[mode][0], stage_index: 0, progress: 0, message: "Queued", error: null, ai_used: ai ? 1 : 0, log_json: "[]", created_at: now(), started_at: null, finished_at: null, heartbeat_at: null };
  db().prepare("INSERT INTO jobs (id, manuscript_id, user_id, mode, content_hash, status, stage, stage_index, progress, message, ai_used, log_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(job.id, job.manuscript_id, job.user_id, job.mode, job.content_hash, job.status, job.stage, 0, 0, job.message, job.ai_used, "[]", job.created_at);
  db().prepare("UPDATE manuscripts SET status = 'queued', updated_at = ? WHERE id = ?").run(now(), ms.id);
  kick();
  return job;
}

export function resumeJob(jobId: string, userId: string) {
  const j = db().prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").get(jobId, userId) as JobRow | undefined;
  if (!j) throw new HttpError(404, "Job not found.");
  if (!["interrupted", "failed", "paused"].includes(j.status)) throw new HttpError(400, `Job is ${j.status}; only interrupted, paused or failed jobs can be resumed.`);
  const active = db().prepare("SELECT id FROM jobs WHERE manuscript_id = ? AND status IN ('queued','running') AND id != ?").get(j.manuscript_id, j.id);
  if (active) throw new HttpError(409, "Another analysis is in progress for this manuscript.");
  db().prepare("UPDATE jobs SET status = 'queued', error = NULL, message = 'Resuming…' WHERE id = ?").run(jobId);
  kick();
}

export function cancelJob(jobId: string, userId: string, pause = false) {
  const j = db().prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").get(jobId, userId) as JobRow | undefined;
  if (!j) throw new HttpError(404, "Job not found.");
  if (!["queued", "running"].includes(j.status)) return;
  db().prepare("UPDATE jobs SET status = ?, message = ? WHERE id = ?").run(pause ? "paused" : "cancelled", pause ? "Paused by user — resume at any time" : "Cancelled by user", jobId);
  if (!pause) db().prepare("UPDATE manuscripts SET status = 'organized' WHERE id = ? AND status IN ('queued','processing')").run(j.manuscript_id);
}

export function kick() {
  startWorker();
  globalThis.__cashlessWorker?.wake?.();
}

export function startWorker() {
  if (!globalThis.__cashlessWorker) globalThis.__cashlessWorker = { running: false, started: false };
  const w = globalThis.__cashlessWorker;
  if (w.started) return;
  w.started = true;
  // Anything "running" when the process stopped was interrupted.
  db().prepare("UPDATE jobs SET status = 'interrupted', message = 'Interrupted (server restarted) — resume to continue from where it stopped' WHERE status = 'running'").run();
  void loop();
}

async function loop() {
  const w = globalThis.__cashlessWorker!;
  for (;;) {
    const job = db().prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get() as JobRow | undefined;
    if (!job) {
      await new Promise<void>((r) => {
        const t = setTimeout(r, 3000);
        w.wake = () => {
          clearTimeout(t);
          r();
        };
      });
      continue;
    }
    w.running = true;
    try {
      await runJob(job);
    } catch (e) {
      console.error("[worker] job crashed", e);
    } finally {
      w.running = false;
    }
  }
}

async function runJob(job: JobRow) {
  const ms = db().prepare("SELECT * FROM manuscripts WHERE id = ?").get(job.manuscript_id) as ManuscriptRow | undefined;
  if (!ms) {
    db().prepare("UPDATE jobs SET status = 'failed', error = 'Manuscript deleted' WHERE id = ?").run(job.id);
    return;
  }
  const settings = getAISettings(job.user_id);
  const ai = !!job.ai_used && aiEnabled(settings);
  const log: any[] = json(job.log_json, []);
  const writeLog = () => db().prepare("UPDATE jobs SET log_json = ?, heartbeat_at = ? WHERE id = ?").run(JSON.stringify(log.slice(-200)), now(), job.id);
  const plan = PLAN[job.mode];
  const fresh = !(db().prepare("SELECT 1 FROM job_units WHERE job_id = ? AND stage = 'init'").get(job.id));
  db().prepare("UPDATE jobs SET status = 'running', started_at = COALESCE(started_at, ?), heartbeat_at = ? WHERE id = ?").run(now(), now(), job.id);
  db().prepare("UPDATE manuscripts SET status = 'processing' WHERE id = ?").run(ms.id);
  if (fresh) {
    prepareFresh(job, ms.id);
    db().prepare("INSERT OR IGNORE INTO job_units (job_id, stage, unit_key, created_at) VALUES (?, 'init', 'init', ?)").run(job.id, now());
    log.push({ t: now(), level: "info", msg: `Started ${job.mode} analysis${ai ? ` using ${settings.model}` : " with the built-in engine (no AI provider connected)"}.` });
  } else log.push({ t: now(), level: "info", msg: "Resumed — completed work is reused, continuing from the last unfinished step." });
  writeLog();

  const units = new Map<string, string | null>();
  for (const u of db().prepare("SELECT stage, unit_key, result_json FROM job_units WHERE job_id = ?").all(job.id) as any[]) units.set(u.stage + "\u0000" + u.unit_key, u.result_json);
  const insUnit = db().prepare("INSERT OR REPLACE INTO job_units (job_id, stage, unit_key, result_json, created_at) VALUES (?,?,?,?,?)");

  let stageIndex = 0;
  const ctx: RunCtx = {
    job,
    ms,
    settings,
    ai,
    chapters: loadRChapters(ms.id),
    log: (msg, level = "info") => {
      log.push({ t: now(), level, msg });
      writeLog();
    },
    progress: (frac, msg) => {
      const p = (stageIndex + Math.max(0, Math.min(1, frac))) / plan.length;
      db().prepare("UPDATE jobs SET progress = ?, message = COALESCE(?, message), heartbeat_at = ? WHERE id = ?").run(Math.round(p * 1000) / 1000, msg ?? null, now(), job.id);
    },
    done: (stage, key) => units.has(stage + "\u0000" + key),
    result: (stage, key) => json(units.get(stage + "\u0000" + key) ?? null, null),
    record: (stage, key, result) => {
      const r = result === undefined ? null : JSON.stringify(result);
      units.set(stage + "\u0000" + key, r);
      insUnit.run(job.id, stage, key, r, now());
    },
    checkCancelled: () => {
      const s = (db().prepare("SELECT status FROM jobs WHERE id = ?").get(job.id) as { status: string }).status;
      if (s === "cancelled" || s === "paused") throw new Cancelled(s);
    },
  };

  try {
    for (stageIndex = 0; stageIndex < plan.length; stageIndex++) {
      const sid = plan[stageIndex];
      ctx.checkCancelled();
      db().prepare("UPDATE jobs SET stage = ?, stage_index = ?, message = ? WHERE id = ?").run(sid, stageIndex, `Stage ${STAGE_INFO[sid].n}: ${STAGE_INFO[sid].name}`, job.id);
      ctx.progress(0);
      if (ctx.done("stage", sid)) continue;
      const t0 = Date.now();
      await RUNNERS[sid](ctx);
      ctx.record("stage", sid);
      log.push({ t: now(), level: "info", msg: `✓ ${STAGE_INFO[sid].name} (${((Date.now() - t0) / 1000).toFixed(1)}s)` });
      writeLog();
    }
    db().prepare("UPDATE jobs SET status = 'completed', progress = 1, message = 'Analysis complete', finished_at = ? WHERE id = ?").run(now(), job.id);
    db().prepare("UPDATE manuscripts SET status = 'analyzed', updated_at = ? WHERE id = ?").run(now(), ms.id);
    log.push({ t: now(), level: "info", msg: "Analysis complete." });
    writeLog();
  } catch (e) {
    if (e instanceof Cancelled) {
      log.push({ t: now(), level: "warn", msg: e.message === "paused" ? "Paused." : "Cancelled." });
      writeLog();
      const hasReport = db().prepare("SELECT 1 FROM analyses WHERE manuscript_id = ? AND kind = 'report'").get(ms.id);
      db().prepare("UPDATE manuscripts SET status = ? WHERE id = ?").run(e.message === "paused" ? "paused" : hasReport ? "analyzed" : "organized", ms.id);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    log.push({ t: now(), level: "error", msg });
    writeLog();
    db().prepare("UPDATE jobs SET status = 'failed', error = ?, message = 'Stopped — fix the problem, then resume to continue from this point' WHERE id = ?").run(msg, job.id);
    db().prepare("UPDATE manuscripts SET status = 'failed' WHERE id = ?").run(ms.id);
  }
}
