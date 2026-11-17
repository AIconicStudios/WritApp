import type { Block } from "./extract";
import { countWords, romanToInt, wordsToNumber } from "../text";

/**
 * Stage 1b — organise the manuscript: detect chapters, parts, front matter and back matter
 * while keeping every paragraph in its original order.
 */
export type Section = {
  kind: "chapter" | "front" | "back" | "part";
  matterType: string | null;
  title: string;
  heading: string | null;
  number: number | null;
  paragraphs: { text: string; style: string }[];
};

export type Structure = { sections: Section[]; inferredTitle: string | null; warnings: string[] };

const MATTER: [RegExp, string, "front" | "back" | "either"][] = [
  [/^(table of )?contents$/i, "toc", "front"],
  [/^copyright( page)?$/i, "copyright", "front"],
  [/^dedication$/i, "dedication", "front"],
  [/^epigraph$/i, "epigraph", "front"],
  [/^(foreword|preface)$/i, "foreword", "front"],
  [/^(introduction)$/i, "introduction", "either"],
  [/^(praise for .*)$/i, "praise", "front"],
  [/^(also by .*)$/i, "also_by", "either"],
  [/^acknowledg(e)?ments?$/i, "acknowledgements", "either"],
  [/^about the authors?$/i, "about_author", "back"],
  [/^(bibliography|references|works cited|sources)$/i, "bibliography", "back"],
  [/^(notes|endnotes)$/i, "notes", "back"],
  [/^glossary$/i, "glossary", "back"],
  [/^(appendix|appendices)\b.*$/i, "appendix", "back"],
  [/^(afterword|author'?s note|a note from the author)$/i, "afterword", "back"],
  [/^(reading group guide|discussion questions|book club questions)$/i, "reading_guide", "back"],
];

const CH_RE = /^(chapter|chap\.?|ch\.)\s+([0-9]{1,3}|[ivxlcdm]{1,7}|[a-z]+(?:[-\s][a-z]+)?)\b[\s.:—–-]*(.*)$/i;
const SPECIAL_RE = /^(prologue|epilogue|interlude|coda|postscript)\b[\s.:—–-]*(.*)$/i;
const PART_RE = /^(part|book)\s+([0-9]{1,2}|[ivxlc]{1,5}|[a-z]+)\b[\s.:—–-]*(.*)$/i;

type Cand = { i: number; type: "chapter" | "part" | "matter" | "special"; title: string; heading: string; number: number | null; matter?: string; side?: string };

function parseNumber(tok: string): number | null {
  if (/^\d+$/.test(tok)) return +tok;
  const r = romanToInt(tok);
  if (r) return r;
  return wordsToNumber(tok);
}

function headingCandidate(b: Block, next: Block | undefined): Cand | null {
  const t = b.text.trim().replace(/\s+/g, " ");
  if (!t || t.length > 120) return null;
  const isShort = t.length <= 80 && !/[.,;]$/.test(t.replace(/\.{3}\s*\d+$/, ""));
  for (const [re, type, side] of MATTER) if (re.test(t.replace(/[.:]$/, "")) && (b.kind === "heading" || isShort)) return { i: 0, type: "matter", title: titleCase(t), heading: t, number: null, matter: type, side };
  let m = t.match(CH_RE);
  if (m && (b.kind === "heading" || isShort)) {
    const n = parseNumber(m[2].trim());
    if (n !== null || b.kind === "heading") return { i: 0, type: "chapter", title: m[3]?.trim() || "", heading: t, number: n };
  }
  m = t.match(SPECIAL_RE);
  if (m && (b.kind === "heading" || isShort)) return { i: 0, type: "special", title: titleCase(m[1]) + (m[2] ? ": " + m[2] : ""), heading: t, number: null };
  m = t.match(PART_RE);
  if (m && (b.kind === "heading" || isShort) && parseNumber(m[2]) !== null) return { i: 0, type: "part", title: t, heading: t, number: parseNumber(m[2]) };
  // Bare numerals / number words ("1", "IV", "ONE") on their own line, followed by prose.
  if (/^(\d{1,3}|[IVXLC]{1,6}|[A-Z][a-z]+(-[a-z]+)?|[A-Z]+(-[A-Z]+)?)\.?$/.test(t) && next && next.text.length > 0) {
    const tok = t.replace(/\.$/, "");
    const n = /^\d+$/.test(tok) || /^[IVXLC]+$/.test(tok) ? parseNumber(tok) : wordsToNumber(tok);
    if (n !== null && n < 300) return { i: 0, type: "chapter", title: "", heading: t, number: n };
  }
  if (b.kind === "heading") return { i: 0, type: "chapter", title: t, heading: t, number: null };
  return null;
}

function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Of|The|And|A|An|In|On|To|For)\b(?!$)/g, (w, _1, off) => (off === 0 ? w : w.toLowerCase()));
}

export function organize(blocks: Block[], fileTitle: string): Structure {
  const warnings: string[] = [];
  const bl = blocks.filter((b) => b.kind !== "page_break" || true);
  let cands: Cand[] = [];
  for (let i = 0; i < bl.length; i++) {
    if (bl[i].kind === "page_break" || bl[i].kind === "scene_break") continue;
    const c = headingCandidate(bl[i], bl[i + 1]);
    if (c) cands.push({ ...c, i });
  }

  // If explicit heading styles exist, ignore generic headings at levels deeper than the chapter level.
  const styled = cands.filter((c) => bl[c.i].kind === "heading");
  if (styled.length >= 2) {
    const levelsWithChapters = styled.filter((c) => c.type === "chapter" && c.number !== null).map((c) => bl[c.i].level ?? 1);
    const chapterLevel = levelsWithChapters.length ? Math.min(...levelsWithChapters) : mostCommon(styled.filter((c) => c.type === "chapter").map((c) => bl[c.i].level ?? 1));
    cands = cands.filter((c) => {
      if (bl[c.i].kind !== "heading") return c.type !== "chapter" || c.number !== null;
      const lvl = bl[c.i].level ?? 1;
      if (c.type === "chapter" && c.number === null && lvl > chapterLevel) return false; // sub-headings stay inside chapters
      return true;
    });
  }

  // Table-of-contents detection: a run of headings with almost no prose between them near the start.
  const tocRanges: [number, number][] = [];
  const longPara = (a: number, b: number) => bl.slice(a + 1, b).filter((x) => countWords(x.text) > 25).length;
  for (const c of cands) {
    if (c.matter !== "toc") continue;
    // TOC lines are short; the TOC ends at the first real prose paragraph or the next front-matter heading.
    let j = c.i + 1;
    while (j < bl.length && countWords(bl[j].text) <= 20 && !cands.find((x) => x.i === j && x.type === "matter")) j++;
    const entries = cands.filter((x) => x.i > c.i && x.i < j);
    // The real first chapter heading sits just before the prose, so it is kept (range end is exclusive).
    tocRanges.push([c.i, entries.length ? entries[entries.length - 1].i : j]);
  }
  // Implicit TOC: >= 4 chapter candidates in a row with no prose between them, before any prose.
  if (!tocRanges.length) {
    let run: Cand[] = [];
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      const prev = run[run.length - 1];
      if (prev && longPara(prev.i, c.i) === 0 && c.i - prev.i <= 3) run.push(c);
      else {
        if (run.length >= 4) break;
        run = [c];
      }
    }
    if (run.length >= 4 && longPara(-1, run[0].i) < 3) {
      tocRanges.push([run[0].i, run[run.length - 1].i]);
      warnings.push("Detected a table of contents and excluded its entries from chapter detection.");
    }
  }
  const inToc = (i: number) => tocRanges.some(([a, b]) => i > a && i < b);
  cands = cands.filter((c) => !inToc(c.i));

  // Bare-number headings are only trusted when there are several and they mostly form a sequence.
  const bare = cands.filter((c) => c.type === "chapter" && /^(\d{1,3}|[IVXLC]{1,6}|[A-Za-z-]+)\.?$/.test(c.heading) && !CH_RE.test(c.heading) && bl[c.i].kind !== "heading");
  if (bare.length && bare.length < 3) cands = cands.filter((c) => !bare.includes(c));

  const sections: Section[] = [];
  const firstChapterIdx = cands.findIndex((c) => c.type === "chapter" || c.type === "special" || c.type === "part");
  const firstChapterBlock = firstChapterIdx >= 0 ? cands[firstChapterIdx].i : bl.length;

  // ----- Front matter before the first chapter -----
  let inferredTitle: string | null = null;
  const front = bl.slice(0, firstChapterBlock);
  const frontCands = cands.filter((c) => c.i < firstChapterBlock);
  if (front.length) {
    let cursor = 0;
    const frontStarts = frontCands.map((c) => c.i);
    const pre = front.slice(0, frontStarts[0] ?? front.length);
    // Split un-headed front matter into title page / copyright / dedication / prose-intro.
    if (pre.length) {
      const groups = splitUnheadedFront(pre);
      for (const g of groups) sections.push(g);
      const tp = groups.find((g) => g.matterType === "title_page");
      if (tp?.paragraphs[0]) inferredTitle = tp.paragraphs[0].text;
      cursor = pre.length;
    }
    for (let k = 0; k < frontCands.length; k++) {
      const c = frontCands[k];
      const end = frontCands[k + 1]?.i ?? firstChapterBlock;
      const paras = toParas(bl.slice(c.i + 1, end));
      sections.push({ kind: c.type === "matter" && c.side === "back" ? "front" : "front", matterType: c.matter ?? "front_section", title: c.title || c.heading, heading: c.heading, number: null, paragraphs: paras });
    }
    void cursor;
  }

  // ----- Body: chapters, parts and back matter -----
  const body = cands.filter((c) => c.i >= firstChapterBlock);
  let seenChapter = false;
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    const end = body[k + 1]?.i ?? bl.length;
    let startPara = c.i + 1;
    let title = c.title;
    // "CHAPTER ONE" followed by a short title line ("The Storm") — merge it into the title.
    const nxt = bl[startPara];
    if (c.type === "chapter" && !title && nxt && nxt.text.length < 70 && countWords(nxt.text) <= 10 && !/[.!?,;”"]$/.test(nxt.text) && startPara < end - 1) {
      title = nxt.text;
      startPara++;
    }
    const paras = toParas(bl.slice(startPara, end));
    if (c.type === "matter") {
      const kind: Section["kind"] = seenChapter || c.side === "back" ? "back" : "front";
      sections.push({ kind, matterType: c.matter!, title: c.title || c.heading, heading: c.heading, number: null, paragraphs: paras });
    } else if (c.type === "part") {
      sections.push({ kind: "part", matterType: null, title: c.title, heading: c.heading, number: c.number, paragraphs: paras });
    } else {
      seenChapter = true;
      const fallbackTitle = c.type === "special" ? c.title : c.number !== null ? `Chapter ${c.number}` : c.heading;
      sections.push({
        kind: "chapter",
        matterType: c.type === "special" ? c.heading.split(/[\s:.]/)[0].toLowerCase() : null,
        title: c.type === "chapter" && c.number !== null ? `Chapter ${c.number}${title ? ": " + title : ""}` : title || fallbackTitle,
        heading: c.heading,
        number: c.number,
        paragraphs: paras,
      });
    }
  }

  // No chapters at all: split long manuscripts into processing sections at scene breaks / paragraph boundaries.
  if (!sections.some((s) => s.kind === "chapter")) {
    const all = toParas(bl.slice(firstChapterBlock));
    const total = all.reduce((n, p) => n + countWords(p.text), 0);
    warnings.push("No chapter headings were detected. The manuscript was divided into sections automatically. Add headings such as “Chapter 1” for best results.");
    const target = total > 9000 ? 4000 : Math.max(total, 1);
    let cur: Section | null = null;
    let wc = 0;
    let n = 0;
    for (const p of all) {
      if (!cur || (wc >= target && (p.style === "scene_break" || wc >= target * 1.4))) {
        n++;
        cur = { kind: "chapter", matterType: "auto", title: `Section ${n} (auto-detected)`, heading: null, number: n, paragraphs: [] };
        sections.push(cur);
        wc = 0;
        if (p.style === "scene_break") continue;
      }
      cur.paragraphs.push(p);
      wc += countWords(p.text);
    }
  }

  // Drop empty part dividers' noise but keep the parts themselves.
  const cleaned = sections.filter((s) => s.paragraphs.length || s.kind === "part" || s.heading);
  if (!inferredTitle) inferredTitle = fileTitle;
  return { sections: cleaned, inferredTitle, warnings };
}

function toParas(blocks: Block[]) {
  return blocks
    .filter((b) => b.kind !== "page_break" && b.text.trim())
    .map((b) => ({ text: b.text.trim(), style: b.kind === "scene_break" ? "scene_break" : b.kind === "quote" ? "quote" : b.kind === "center" ? "center" : b.kind === "heading" ? "heading" : "p" }));
}

function splitUnheadedFront(pre: Block[]): Section[] {
  const out: Section[] = [];
  const paras = toParas(pre);
  const copyrightIdx = paras.findIndex((p) => /©|copyright|all rights reserved|isbn/i.test(p.text));
  const proseIdx = paras.findIndex((p) => countWords(p.text) > 40);
  const titleEnd = [copyrightIdx, proseIdx].filter((x) => x >= 0).reduce((a, b) => Math.min(a, b), paras.length);
  if (titleEnd > 0 && paras.slice(0, titleEnd).every((p) => countWords(p.text) <= 20)) {
    out.push({ kind: "front", matterType: "title_page", title: "Title Page", heading: null, number: null, paragraphs: paras.slice(0, titleEnd) });
  }
  let rest = paras.slice(titleEnd > 0 && out.length ? titleEnd : 0);
  if (copyrightIdx >= 0) {
    const cStart = copyrightIdx - (paras.length - rest.length);
    let cEnd = cStart;
    while (cEnd < rest.length && (countWords(rest[cEnd].text) <= 60 && /©|copyright|rights|isbn|published|printed|fiction|edition|cover|library|resemblance|coincidental|www\.|\d{4}/i.test(rest[cEnd].text) || cEnd === cStart)) cEnd++;
    if (cStart > 0) out.push({ kind: "front", matterType: "front_section", title: "Front Matter", heading: null, number: null, paragraphs: rest.slice(0, cStart) });
    out.push({ kind: "front", matterType: "copyright", title: "Copyright", heading: null, number: null, paragraphs: rest.slice(cStart, cEnd) });
    rest = rest.slice(cEnd);
  }
  if (rest.length) {
    const ded = rest.length <= 3 && rest.every((p) => countWords(p.text) < 30) && /^(for|to|in memory)\b/i.test(rest[0].text);
    out.push({ kind: "front", matterType: ded ? "dedication" : "front_section", title: ded ? "Dedication" : "Opening Material", heading: null, number: null, paragraphs: rest });
  }
  return out;
}

function mostCommon(a: number[]): number {
  const m = new Map<number, number>();
  for (const x of a) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 1;
}
