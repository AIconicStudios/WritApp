import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Single SQLite database (file-based, zero-cost, no server needed).
 * The schema is plain SQL and portable to PostgreSQL if you later outgrow SQLite.
 */

export const DATA_DIR = typeof window !== "undefined" ? "data" : path.resolve(process.env.DATA_DIR || "./data");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  base_url TEXT,
  model TEXT,
  api_key_enc TEXT,
  temperature REAL NOT NULL DEFAULT 0.3,
  context_words INTEGER NOT NULL DEFAULT 2200,
  concurrency INTEGER NOT NULL DEFAULT 1,
  requests_per_minute INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS manuscripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  genre TEXT,
  audience TEXT,
  file_name TEXT,
  file_type TEXT,
  file_path TEXT,
  content_hash TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded',
  overall_score INTEGER,
  last_mode TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ms_user ON manuscripts(user_id);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- chapter | front | back | part
  matter_type TEXT,            -- title_page | copyright | toc | dedication | acknowledgements | about_author | bibliography ...
  title TEXT NOT NULL,
  heading TEXT,                -- raw heading text as written
  number INTEGER,
  word_count INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  stats_json TEXT,
  intel_json TEXT,             -- chapter intelligence (summary, events, characters ...)
  notes_json TEXT              -- editorial observations
);
CREATE INDEX IF NOT EXISTS idx_ch_ms ON chapters(manuscript_id, idx);

CREATE TABLE IF NOT EXISTS paragraphs (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,        -- position within chapter (0-based)
  global_idx INTEGER NOT NULL,
  style TEXT NOT NULL DEFAULT 'p',  -- p | scene_break | quote | center | heading
  original_text TEXT NOT NULL, -- NEVER modified after import
  current_text TEXT NOT NULL,  -- author-approved working text
  inserted INTEGER NOT NULL DEFAULT 0, -- 1 if added after import (e.g. incorporated continuation)
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_p_ch ON paragraphs(chapter_id, idx);
CREATE INDEX IF NOT EXISTS idx_p_ms ON paragraphs(manuscript_id, global_idx);

CREATE TABLE IF NOT EXISTS paragraph_versions (
  id TEXT PRIMARY KEY,
  paragraph_id TEXT NOT NULL REFERENCES paragraphs(id) ON DELETE CASCADE,
  manuscript_id TEXT NOT NULL,
  text TEXT NOT NULL,
  previous_text TEXT,
  source TEXT NOT NULL,        -- author | suggestion | rewrite | restore | continuation | branch
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pv_ms ON paragraph_versions(manuscript_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pv_p ON paragraph_versions(paragraph_id, created_at);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  job_id TEXT,
  chapter_id TEXT,
  paragraph_id TEXT,
  stage TEXT NOT NULL,         -- proofread | copy | line | developmental | continuity | publication
  category TEXT NOT NULL,
  rule TEXT,
  severity TEXT NOT NULL,      -- critical | major | moderate | minor
  objective INTEGER NOT NULL,  -- 1 = objective error, 0 = subjective recommendation
  original_text TEXT,
  explanation TEXT NOT NULL,
  suggestion TEXT,             -- replacement for original_text (if applicable)
  revised_text TEXT,           -- full suggested revised version of the passage
  reason TEXT,
  refs_json TEXT,              -- related references e.g. where a fact was first established
  source TEXT NOT NULL,        -- rule | ai
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'open', -- open | accepted | rejected | modified | stale
  resolution_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_is_ms ON issues(manuscript_id, stage, severity);
CREATE INDEX IF NOT EXISTS idx_is_ch ON issues(chapter_id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,        -- queued | running | interrupted | paused | failed | completed | cancelled
  stage TEXT,
  stage_index INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  error TEXT,
  ai_used INTEGER NOT NULL DEFAULT 0,
  log_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  heartbeat_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Each finished unit of work is recorded so interrupted jobs can resume without redoing work.
CREATE TABLE IF NOT EXISTS job_units (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  unit_key TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (job_id, stage, unit_key)
);

-- Cache of AI responses keyed by hash(provider, model, prompt): prevents duplicate processing.
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- The Story Bible: a living database of the book.
CREATE TABLE IF NOT EXISTS bible_entries (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  section TEXT NOT NULL,       -- characters | locations | objects | rules | events | conflicts | themes | arcs | history | relationships | organizations
  name TEXT NOT NULL,
  summary TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  refs_json TEXT NOT NULL DEFAULT '[]',   -- [{chapterId, chapterIdx, paragraphIdx, quote}]
  status TEXT NOT NULL DEFAULT 'official', -- official | proposed
  origin TEXT NOT NULL,        -- builtin | ai | author | continuation
  author_locked INTEGER NOT NULL DEFAULT 0, -- 1 when the author edited it; automated passes won't overwrite
  sort_key INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bible_ms ON bible_entries(manuscript_id, section);

-- Atomic, chapter-referenced facts used for continuity checking.
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  chapter_id TEXT,
  chapter_idx INTEGER,
  paragraph_idx INTEGER,
  quote TEXT,
  source TEXT NOT NULL,        -- rule | ai | author | continuation
  status TEXT NOT NULL DEFAULT 'official',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_ms ON facts(manuscript_id, subject, attribute);

-- Book intelligence and reports (JSON documents).
CREATE TABLE IF NOT EXISTS analyses (
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (manuscript_id, kind)
);

-- Creative companion results (scenarios, what-ifs, plans ...).
CREATE TABLE IF NOT EXISTS creative_items (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ci_ms ON creative_items(manuscript_id, created_at);

-- Generated or hand-written drafts awaiting the author's decision.
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  branch_id TEXT,
  creative_item_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | incorporated | discarded
  anchor_paragraph_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Story branches: alternative directions kept apart from the official manuscript.
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  from_chapter_idx INTEGER,
  status TEXT NOT NULL DEFAULT 'experimental', -- experimental | merged | archived
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS branch_versions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  format TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __cashlessDb: Database.Database | undefined;
}

export function db(): Database.Database {
  if (!globalThis.__cashlessDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, "exports"), { recursive: true });
    const d = new Database(path.join(DATA_DIR, "cashless-edit.db"));
    d.exec(SCHEMA);
    d.pragma("busy_timeout = 5000");
    globalThis.__cashlessDb = d;
  }
  return globalThis.__cashlessDb;
}

export function now() {
  return Date.now();
}

export function uid(prefix = ""): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const r = crypto.getRandomValues(new Uint8Array(16));
  let out = prefix;
  for (const b of r) out += A[b & 63];
  return out;
}

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}
