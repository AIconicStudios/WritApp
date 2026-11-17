/** Text utilities shared by the parser, rule engine, scoring and exports. */

export function countWords(s: string): number {
  if (!s) return 0;
  const m = s.match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

export function words(s: string): string[] {
  return s.match(/[\p{L}\p{N}]+(?:[’'][\p{L}]+)*/gu) ?? [];
}

const ABBREV = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "vs", "etc", "e.g", "i.e", "no", "vol", "capt", "col", "gen", "lt", "sgt", "rev", "fr", "gov", "sen", "rep", "ft", "inc", "ltd", "co", "jan", "feb", "mar", "apr", "aug", "sep", "sept", "oct", "nov", "dec", "a.m", "p.m", "u.s", "u.k",
]);

export type Sentence = { text: string; start: number; end: number };

/** Sentence splitter that respects abbreviations, initials, ellipses and closing quotes. */
export function sentences(p: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const re = /([.!?…]+)(["”’')\]]*)(\s+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    const endPunct = m.index + m[1].length + m[2].length;
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const before = p.slice(start, m.index);
    const lastWord = (before.match(/([A-Za-z.]+)$/)?.[1] ?? "").toLowerCase();
    const isInitial = /(^|\s)[A-Z]$/.test(before);
    if (m[1] === "." && (ABBREV.has(lastWord.replace(/\.$/, "")) || isInitial)) continue;
    const next = p.charAt(m.index + m[0].length);
    if (next && /[a-z]/.test(next)) continue; // “Wait!” she said.  -> same sentence
    const lead = p.slice(start).length - p.slice(start).trimStart().length;
    const text = p.slice(start, endPunct).trim();
    if (text) out.push({ text, start: start + lead, end: endPunct });
    start = m.index + m[0].length;
  }
  const rest = p.slice(start).trim();
  if (rest) out.push({ text: rest, start: p.length - p.slice(start).trimStart().length, end: p.length });
  return out;
}

export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

/** Returns ranges of the paragraph that are inside quotation marks (dialogue). */
export function dialogueRanges(p: string): [number, number][] {
  const ranges: [number, number][] = [];
  let open = -1;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "“") open = i;
    else if (c === "”" && open >= 0) {
      ranges.push([open, i + 1]);
      open = -1;
    } else if (c === '"') {
      if (open < 0) open = i;
      else {
        ranges.push([open, i + 1]);
        open = -1;
      }
    }
  }
  if (open >= 0) ranges.push([open, p.length]); // multi-paragraph dialogue continues
  return ranges;
}

export function inRanges(i: number, ranges: [number, number][]) {
  return ranges.some(([a, b]) => i >= a && i < b);
}

export function dialogueWordRatio(p: string): number {
  const total = countWords(p);
  if (!total) return 0;
  let d = 0;
  for (const [a, b] of dialogueRanges(p)) d += countWords(p.slice(a, b));
  return Math.min(1, d / total);
}

export function normalizeForMatch(s: string): string {
  return s
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Locates `quote` inside `text`, tolerating differences in quote marks, dashes and whitespace.
 * Returns the exact substring of `text` (so suggestions can be applied precisely) or null.
 * This is how Cashless Edit guarantees that every AI-reported issue refers to real manuscript text.
 */
export function locateQuote(text: string, quote: string): { start: number; end: number; exact: string } | null {
  if (!quote || !text) return null;
  const q = quote.trim().replace(/^["“”']+|["“”']+$/g, (m) => (quote.trim().length > 3 ? m : m));
  const direct = text.indexOf(q);
  if (direct >= 0) return { start: direct, end: direct + q.length, exact: q };
  // Build normalised text with an index map back to the original.
  const map: number[] = [];
  let norm = "";
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (/\s/.test(c)) {
      if (prevSpace) continue;
      c = " ";
      prevSpace = true;
    } else prevSpace = false;
    if (c === "…") {
      for (const ch of "...") {
        norm += ch;
        map.push(i);
      }
      continue;
    }
    norm += c.replace(/[“”„‟″]/, '"').replace(/[‘’‚‛′]/, "'").replace(/[–—]/, "-").toLowerCase();
    map.push(i);
  }
  const nq = normalizeForMatch(q);
  if (nq.length < 2) return null;
  let at = norm.indexOf(nq);
  let len = nq.length;
  if (at < 0) {
    // Try without surrounding quotation marks / trailing punctuation.
    const stripped = nq.replace(/^["']+|["'.,!?;:]+$/g, "");
    if (stripped.length < 4) return null;
    at = norm.indexOf(stripped);
    len = stripped.length;
    if (at < 0) return null;
  }
  const start = map[at];
  const end = map[at + len - 1] + 1;
  return { start, end, exact: text.slice(start, end) };
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  // Optimal string alignment distance: counts a transposition ("Tobias"/"Tobais") as one edit.
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[m][n];
}

export const STOPWORDS = new Set(
  "a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves said says say like back one two get got go went come came know knew see saw look looked think thought make made take took want even still well yes oh also us let into upon again never ever every much many would could might must shall".split(
    " ",
  ),
);

export function romanToInt(s: string): number | null {
  const r = s.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(r)) return null;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const a = v[r[i]],
      b = v[r[i + 1]] ?? 0;
    total += a < b ? -a : a;
  }
  return total > 0 && total < 400 ? total : null;
}

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

export function wordsToNumber(s: string): number | null {
  const parts = s.toLowerCase().replace(/-/g, " ").split(/\s+/).filter((x) => x && x !== "and");
  if (!parts.length) return null;
  let total = 0;
  for (const p of parts) {
    if (!(p in NUM_WORDS)) return null;
    const n = NUM_WORDS[p];
    if (n === 100) total = (total || 1) * 100;
    else total += n;
  }
  return total;
}

export function numberWord(n: number): string {
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
  return String(n);
}
