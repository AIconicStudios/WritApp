/**
 * Drop-in replacement for `better-sqlite3` running on sql.js (SQLite compiled to WebAssembly),
 * so the exact same data layer runs on the phone. The database lives in memory and is saved to
 * IndexedDB shortly after every write (and immediately when the app goes to the background).
 */
import type { Database as SqlJsDb, SqlJsStatic, SqlValue } from "sql.js";
import { kvSet } from "./store";

let SQL: SqlJsStatic | null = null;
let initialBytes: Uint8Array | null = null;
export function provideSqlJs(sql: SqlJsStatic, bytes: Uint8Array | null) {
  SQL = sql;
  initialBytes = bytes;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let current: Database | null = null;
export async function flushDb() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (current?.dirty) {
    current.dirty = false;
    await kvSet("db", current.raw.export());
  }
}
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => void flushDb(), 800);
}

const norm = (v: unknown): SqlValue => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : (v as SqlValue));

class Statement {
  constructor(private db: Database, private sql: string) {}
  private exec<T>(params: unknown[], fn: (s: ReturnType<SqlJsDb["prepare"]>) => T): T {
    const s = this.db.raw.prepare(this.sql);
    try {
      if (params.length) s.bind(params.map(norm));
      return fn(s);
    } finally {
      s.free();
    }
  }
  run(...params: unknown[]) {
    this.exec(params, (s) => {
      while (s.step());
    });
    if (!/^\s*select/i.test(this.sql)) {
      this.db.dirty = true;
      scheduleSave();
    }
    return { changes: this.db.raw.getRowsModified() };
  }
  get(...params: unknown[]) {
    return this.exec(params, (s) => (s.step() ? s.getAsObject() : undefined));
  }
  all(...params: unknown[]) {
    return this.exec(params, (s) => {
      const out: Record<string, SqlValue>[] = [];
      while (s.step()) out.push(s.getAsObject());
      return out;
    });
  }
}

export default class Database {
  raw: SqlJsDb;
  dirty = false;
  private depth = 0;
  constructor(_path?: string) {
    if (!SQL) throw new Error("SQLite engine not initialised");
    this.raw = initialBytes ? new SQL.Database(initialBytes) : new SQL.Database();
    current = this;
  }
  exec(sql: string) {
    this.raw.exec(sql);
    this.dirty = true;
    scheduleSave();
    return this;
  }
  pragma(p: string) {
    try {
      this.raw.exec("PRAGMA " + p);
    } catch {}
  }
  prepare(sql: string) {
    return new Statement(this, sql);
  }
  transaction<T extends (...a: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      const sp = `sp${this.depth++}`;
      this.raw.exec(`SAVEPOINT ${sp}`);
      try {
        const r = fn(...args);
        this.raw.exec(`RELEASE ${sp}`);
        return r;
      } catch (e) {
        this.raw.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      } finally {
        this.depth--;
        this.dirty = true;
        scheduleSave();
      }
    }) as T;
  }
}
