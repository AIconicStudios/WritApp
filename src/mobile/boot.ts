/** Starts the on-device engine: loads SQLite (WebAssembly), restores saved data, starts the background worker. */
import { kvGet } from "./store";
import { flushDb, provideSqlJs } from "./sqlite";
import { loadFiles } from "./fs";

let p: Promise<void> | null = null;
export function ready() {
  if (!p)
    p = (async () => {
      const initSqlJs = (await import("sql.js")).default;
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      const saved = await kvGet<Uint8Array>("db");
      provideSqlJs(SQL, saved ? new Uint8Array(saved) : null);
      await loadFiles();
      const { ensureLocalUser } = await import("./auth");
      ensureLocalUser();
      const { startWorker, kick } = await import("@/lib/pipeline/worker");
      startWorker();
      // Android may close the app while a long analysis runs: continue automatically on the next launch.
      const { db } = await import("@/lib/db");
      db().prepare("UPDATE jobs SET status = 'queued', message = 'Resuming where it stopped…' WHERE status = 'interrupted'").run();
      kick();
      const save = () => void flushDb();
      document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && save());
      window.addEventListener("pagehide", save);
      try {
        const { App } = await import("@capacitor/app");
        App.addListener("pause", save);
      } catch {}
    })();
  return p;
}
