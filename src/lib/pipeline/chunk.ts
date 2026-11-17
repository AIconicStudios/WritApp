import type { RChapter, RPara } from "../engine/rules";
import { countWords } from "../text";

export type Section = { key: string; chapter: RChapter; part: number; parts: number; paragraphs: RPara[]; words: number };

/**
 * Splits chapters into processing sections that fit the model's context window,
 * always at paragraph boundaries (preferring scene breaks), so no text is lost or reordered.
 */
export function sectionize(chapters: RChapter[], maxWords: number): Section[] {
  const out: Section[] = [];
  for (const ch of chapters) {
    const paras = ch.paragraphs.filter((p) => p.text.trim());
    if (!paras.length) continue;
    const groups: RPara[][] = [];
    let cur: RPara[] = [];
    let wc = 0;
    for (let i = 0; i < paras.length; i++) {
      const p = paras[i];
      const w = countWords(p.text);
      const sceneBreakHere = p.style === "scene_break" && wc > maxWords * 0.6;
      if (cur.length && (wc + w > maxWords || sceneBreakHere)) {
        groups.push(cur);
        cur = [];
        wc = 0;
      }
      cur.push(p);
      wc += w;
    }
    if (cur.length) {
      // Avoid a tiny trailing section: merge into the previous one if it stays within 130% of the budget.
      const last = groups[groups.length - 1];
      if (last && wc < maxWords * 0.25 && countWords(last.map((p) => p.text).join(" ")) + wc <= maxWords * 1.3) last.push(...cur);
      else groups.push(cur);
    }
    groups.forEach((g, i) => out.push({ key: `${ch.id}:${i}`, chapter: ch, part: i, parts: groups.length, paragraphs: g, words: g.reduce((n, p) => n + countWords(p.text), 0) }));
  }
  return out;
}

export function sectionText(s: Section) {
  return s.paragraphs.map((p) => `[P${p.idx + 1}] ${p.text}`).join("\n\n");
}

/** For chapter-level analysis of chapters longer than the budget: opening, middle sample and ending, with paragraph numbers. */
export function excerptChapter(ch: RChapter, maxWords: number): string {
  const total = ch.paragraphs.reduce((n, p) => n + countWords(p.text), 0);
  if (total <= maxWords) return ch.paragraphs.map((p) => `[P${p.idx + 1}] ${p.text}`).join("\n\n");
  const take = (list: RPara[], budget: number) => {
    const o: RPara[] = [];
    let w = 0;
    for (const p of list) {
      const pw = countWords(p.text);
      if (w + pw > budget && o.length) break;
      o.push(p);
      w += pw;
    }
    return o;
  };
  const head = take(ch.paragraphs, maxWords * 0.45);
  const tail = take([...ch.paragraphs].reverse(), maxWords * 0.3).reverse();
  const midStart = Math.floor(ch.paragraphs.length / 2);
  const mid = take(ch.paragraphs.slice(midStart), maxWords * 0.2).filter((p) => !head.includes(p) && !tail.includes(p));
  const fmt = (l: RPara[]) => l.map((p) => `[P${p.idx + 1}] ${p.text}`).join("\n\n");
  return `${fmt(head)}\n\n[... excerpt omitted ...]\n\n${fmt(mid)}\n\n[... excerpt omitted ...]\n\n${fmt(tail)}`;
}
