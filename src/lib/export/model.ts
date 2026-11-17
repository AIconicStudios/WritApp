/** A tiny document model so every report can be rendered to both DOCX and PDF. */
export type RBlock =
  | { t: "h1" | "h2" | "h3" | "p" | "quote" | "small"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "kv"; items: [string, string][] }
  | { t: "score"; label: string; score: number | null; text: string }
  | { t: "issue"; severity: string; category: string; where: string; original?: string | null; explanation: string; suggestion?: string | null; reason?: string | null; objective: boolean }
  | { t: "pagebreak" };

export type RDoc = { title: string; subtitle?: string; meta?: string[]; blocks: RBlock[] };

/** Typographic clean-up applied to exports only (never to the stored manuscript). */
export function typographic(s: string): string {
  return s
    .replace(/(^|[\s(\[{—–-])"(?=\S)/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s(\[{—–-])'(?=\S)/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/\s?--\s?/g, "—")
    .replace(/(\w) - (\w)/g, "$1 — $2")
    .replace(/\.\.\.(?!\.)/g, "…");
}
