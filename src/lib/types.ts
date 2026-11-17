export type Severity = "critical" | "major" | "moderate" | "minor";
export type Stage = "proofread" | "copy" | "line" | "developmental" | "continuity" | "publication";

export type ManuscriptRow = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  genre: string | null;
  audience: string | null;
  file_name: string | null;
  file_type: string | null;
  file_path: string | null;
  content_hash: string;
  word_count: number;
  status: string;
  overall_score: number | null;
  last_mode: string | null;
  created_at: number;
  updated_at: number;
};

export type ChapterRow = {
  id: string;
  manuscript_id: string;
  idx: number;
  kind: "chapter" | "front" | "back" | "part";
  matter_type: string | null;
  title: string;
  heading: string | null;
  number: number | null;
  word_count: number;
  score: number | null;
  stats_json: string | null;
  intel_json: string | null;
  notes_json: string | null;
};

export type ParagraphRow = {
  id: string;
  manuscript_id: string;
  chapter_id: string;
  idx: number;
  global_idx: number;
  style: string;
  original_text: string;
  current_text: string;
  inserted: number;
  deleted: number;
  updated_at: number;
};

export type IssueRow = {
  id: string;
  manuscript_id: string;
  job_id: string | null;
  chapter_id: string | null;
  paragraph_id: string | null;
  stage: Stage;
  category: string;
  rule: string | null;
  severity: Severity;
  objective: number;
  original_text: string | null;
  explanation: string;
  suggestion: string | null;
  revised_text: string | null;
  reason: string | null;
  refs_json: string | null;
  source: "rule" | "ai";
  confidence: number | null;
  status: "open" | "accepted" | "rejected" | "modified" | "stale";
  resolution_text: string | null;
  created_at: number;
  updated_at: number;
};

export type Ref = { chapterId?: string; chapterIdx?: number; paragraphIdx?: number; paragraphId?: string; quote?: string; label?: string };

/** A candidate issue produced by the rule engine or the AI before it is stored. */
export type DraftIssue = {
  stage: Stage;
  category: string;
  rule?: string;
  severity: Severity;
  objective: boolean;
  chapterId?: string | null;
  paragraphId?: string | null;
  original?: string | null;
  explanation: string;
  suggestion?: string | null;
  revised?: string | null;
  reason?: string | null;
  refs?: Ref[];
  source: "rule" | "ai";
  confidence?: number;
};

export type JobRow = {
  id: string;
  manuscript_id: string;
  user_id: string;
  mode: EditMode;
  content_hash: string;
  status: "queued" | "running" | "interrupted" | "paused" | "failed" | "completed" | "cancelled";
  stage: string | null;
  stage_index: number;
  progress: number;
  message: string | null;
  error: string | null;
  ai_used: number;
  log_json: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  heartbeat_at: number | null;
};

export type EditMode = "proofread" | "copy" | "line" | "developmental" | "full" | "audit";

export const MODES: { id: EditMode; name: string; blurb: string; needsAI: "no" | "partial" | "yes" }[] = [
  { id: "proofread", name: "Quick Proofread", blurb: "Fast spelling, punctuation, typo, repeated-word and formatting checks.", needsAI: "no" },
  { id: "copy", name: "Copy Edit", blurb: "Detailed grammar, usage, consistency of names, numbers, dates and terminology.", needsAI: "partial" },
  { id: "line", name: "Line Edit", blurb: "Sentence-level craft: wordiness, clichés, weak verbs, dialogue, show-don't-tell.", needsAI: "partial" },
  { id: "developmental", name: "Developmental Edit", blurb: "Deep story analysis: plot, character, pacing, structure, continuity and Story Bible.", needsAI: "yes" },
  { id: "full", name: "Full Editorial Review", blurb: "Every stage combined: proofread, copy, line, developmental, continuity, report and audit.", needsAI: "partial" },
  { id: "audit", name: "Publication Audit", blurb: "Final quality and publication-readiness assessment for KDP, print and submission.", needsAI: "no" },
];

export type BibleSection =
  | "characters"
  | "relationships"
  | "locations"
  | "objects"
  | "rules"
  | "events"
  | "conflicts"
  | "themes"
  | "arcs"
  | "history"
  | "organizations";

export const BIBLE_SECTIONS: { id: BibleSection; name: string }[] = [
  { id: "characters", name: "Characters" },
  { id: "relationships", name: "Relationships" },
  { id: "locations", name: "Locations" },
  { id: "events", name: "Timeline & Major Events" },
  { id: "objects", name: "Important Objects" },
  { id: "rules", name: "Story & World Rules" },
  { id: "conflicts", name: "Conflicts" },
  { id: "themes", name: "Themes" },
  { id: "arcs", name: "Character Arcs" },
  { id: "history", name: "Established History & Facts" },
  { id: "organizations", name: "Groups & Organizations" },
];
