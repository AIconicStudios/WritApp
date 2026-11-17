import type { DraftIssue, Ref } from "../types";
import { truncate } from "../text";
import { NAME_STOP } from "./wordlists";
import type { RChapter } from "./rules";

/**
 * Built-in (no-AI) story database bootstrap: proper-noun extraction, character / location
 * classification, chapter appearances, co-occurrence and attribute facts for continuity checks.
 * Everything here is grounded: each item carries references to the paragraphs it came from.
 */

export type Entity = {
  name: string;
  kind: "character" | "location" | "other";
  count: number;
  chapters: number[]; // chapter idx list
  firstRef: Ref;
  refs: Ref[];
  aliases: string[];
  evidence: { speech: number; place: number; title: number };
};

export type Fact = { subject: string; attribute: string; value: string; ref: Ref };

const TITLES = /^(Mr|Mrs|Ms|Miss|Dr|Doctor|Professor|Prof|Captain|Capt|Lord|Lady|Sir|Dame|Father|Sister|Brother|Aunt|Uncle|Detective|Inspector|Officer|Sergeant|Agent|King|Queen|Prince|Princess|Duke|Duchess|General|Colonel|Lieutenant|Major|Grandma|Grandpa|Nana)\.?$/;
const PLACE_WORDS = /\b(Street|St|Road|Rd|Avenue|Ave|Lane|Park|River|Lake|Mountain|Mountains|Hill|Hills|Valley|Forest|Wood|Woods|Bay|Island|City|Town|Village|County|Castle|Manor|Hall|House|Hotel|Church|Cathedral|Station|Hospital|School|Academy|University|College|Bridge|Harbour|Harbor|Market|Square|Tower|Palace|Abbey|Inn|Tavern|Farm|Ranch|Desert|Sea|Ocean|Coast|Cove|Falls|Gardens|Prison|Library|Museum|Temple)\b/;

export function extractEntities(chapters: RChapter[]): Entity[] {
  const map = new Map<string, Entity>();
  const midCap = new Map<string, number>(); // capitalised mid-sentence
  const lowerSeen = new Map<string, number>();
  const body = chapters.filter((c) => c.kind === "chapter" || c.kind === "part");

  for (const ch of body) {
    for (const p of ch.paragraphs) {
      const t = p.text;
      for (const w of t.match(/\b[a-z][a-z’']+\b/g) ?? []) lowerSeen.set(w, (lowerSeen.get(w) ?? 0) + 1);
      // Multi-word proper names (e.g. "Eleanor Vance", "Mr. Hale", "Thornfield Hall").
      const re = /\b((?:(?:Mr|Mrs|Ms|Dr|St)\.?\s)?[A-Z][a-zA-Z’'-]+(?:\s(?:of\s|de\s|van\s|von\s)?[A-Z][a-zA-Z’'-]+){0,2})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        let name = m[1].replace(/[’']s$/, "").trim();
        const first = name.split(/\s/)[0].replace(/\.$/, "");
        const before = t.slice(0, m.index);
        const sentenceStart = /(^|[.!?…]["”’]?\s+|["“‘]\s*|—\s*)$/.test(before);
        if (NAME_STOP.has(first) && !TITLES.test(first)) {
          // "The Black Swan" style names: drop leading stopword
          const parts = name.split(/\s/);
          if (parts.length > 1 && !NAME_STOP.has(parts[1])) name = parts.slice(1).join(" ");
          else continue;
        }
        if (name.length < 2 || NAME_STOP.has(name)) continue;
        if (!sentenceStart) midCap.set(name, (midCap.get(name) ?? 0) + 1);
        const e = map.get(name) ?? { name, kind: "other" as const, count: 0, chapters: [], firstRef: mkRef(ch, p, t, m.index), refs: [], aliases: [], evidence: { speech: 0, place: 0, title: 0 } };
        e.count++;
        if (!e.chapters.includes(ch.idx)) e.chapters.push(ch.idx);
        if (e.refs.length < 12 && !e.refs.some((r) => r.chapterIdx === ch.idx)) e.refs.push(mkRef(ch, p, t, m.index));
        const after = t.slice(m.index + m[0].length, m.index + m[0].length + 30);
        const pre = before.slice(-25);
        if (/^\s*(said|asked|replied|whispered|shouted|muttered|answered|nodded|smiled|laughed|sighed|frowned|thought|felt|knew|wanted|looked|turned|walked|ran|stood|sat|was\s+(?:a|an|the)\s+\w+\s+(?:man|woman|girl|boy))\b/.test(after) || /\b(said|asked|replied|told|whispered\s+to)\s+$/.test(pre)) e.evidence.speech++;
        if (/^[’']s\s+(eyes|hair|face|hand|hands|voice|mother|father|sister|brother|wife|husband|son|daughter|smile|heart|mind)\b/.test(after)) e.evidence.speech++;
        if (/\b(in|at|from|to|toward|towards|near|across|through|into|outside|inside|reached|left|visited)\s+(the\s+)?$/.test(pre)) e.evidence.place++;
        if (TITLES.test(first)) e.evidence.title++;
        map.set(name, e);
      }
    }
  }

  let ents = [...map.values()].filter((e) => {
    if (e.count < 3) return false;
    const single = !e.name.includes(" ");
    // Words that are usually common nouns written lower-case elsewhere are unreliable unless strongly evidenced.
    const lc = lowerSeen.get(e.name.toLowerCase()) ?? 0;
    if (single && lc > e.count * 0.5 && e.evidence.speech < 3) return false;
    // Must be capitalised mid-sentence at least sometimes (rules out sentence-initial common words).
    if ((midCap.get(e.name) ?? 0) < Math.min(2, e.count * 0.2) && e.evidence.speech < 2) return false;
    return true;
  });

  for (const e of ents) {
    if (e.evidence.title > 0 || e.evidence.speech >= Math.max(1, e.evidence.place)) e.kind = "character";
    else if (PLACE_WORDS.test(e.name) || e.evidence.place >= 2) e.kind = "location";
    else if (e.evidence.speech > 0) e.kind = "character";
  }

  // Merge partial names into full names: "Eleanor" into "Eleanor Vance", "Mr. Hale" alias of "Hale".
  ents.sort((a, b) => b.name.length - a.name.length);
  const merged: Entity[] = [];
  for (const e of ents) {
    const host = merged.find((m) => m.kind !== "location" && e.kind !== "location" && m.name.split(/\s/).includes(e.name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s/, "")) && m.name !== e.name);
    if (host && e.name.split(/\s/).length < host.name.split(/\s/).length) {
      host.count += e.count;
      host.aliases.push(e.name);
      for (const c of e.chapters) if (!host.chapters.includes(c)) host.chapters.push(c);
      host.evidence.speech += e.evidence.speech;
      if (host.kind === "other" && e.kind === "character") host.kind = "character";
      if ((e.firstRef.chapterIdx ?? 0) < (host.firstRef.chapterIdx ?? 0)) host.firstRef = e.firstRef;
      continue;
    }
    merged.push(e);
  }
  // If the bare first name is far more common than the full name, display the most-used form as the primary name.
  for (const e of merged) e.chapters.sort((a, b) => a - b);
  return merged.sort((a, b) => b.count - a.count).slice(0, 80);
}

function mkRef(ch: RChapter, p: { id: string; idx: number }, t: string, at: number): Ref {
  const s = Math.max(0, t.lastIndexOf(" ", Math.max(0, at - 70)));
  return { chapterId: ch.id, chapterIdx: ch.idx, paragraphId: p.id, paragraphIdx: p.idx, quote: truncate(t.slice(s, at + 110).trim(), 180), label: ch.title };
}

/** Co-occurrence of characters in the same paragraph — a grounded, weak signal of relationships. */
export function coOccurrence(chapters: RChapter[], ents: Entity[]) {
  const chars = ents.filter((e) => e.kind === "character").slice(0, 30);
  const pairs = new Map<string, { a: string; b: string; n: number; refs: Ref[] }>();
  for (const ch of chapters) for (const p of ch.paragraphs) {
    const present = chars.filter((e) => [e.name, ...e.aliases].some((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(p.text)));
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
      const [a, b] = [present[i].name, present[j].name].sort();
      const k = a + "|" + b;
      const e = pairs.get(k) ?? { a, b, n: 0, refs: [] };
      e.n++;
      if (e.refs.length < 3) e.refs.push({ chapterId: ch.id, chapterIdx: ch.idx, paragraphId: p.id, paragraphIdx: p.idx, quote: truncate(p.text, 180), label: ch.title });
      pairs.set(k, e);
    }
  }
  return [...pairs.values()].filter((p) => p.n >= 2).sort((a, b) => b.n - a.n).slice(0, 60);
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COLORS = "blue|green|brown|grey|gray|hazel|amber|black|violet|red|blonde|blond|auburn|golden|silver|white|dark brown|light brown|chestnut|ginger|copper|raven|jet-black";
const RELATIONS = "brother|sister|mother|father|wife|husband|son|daughter|cousin|aunt|uncle|grandmother|grandfather|niece|nephew|fiancée|fiancé|stepmother|stepfather|half-brother|half-sister|twin";

/** Attribute facts with exact references — used to detect contradictions across chapters. */
export function extractFacts(chapters: RChapter[], ents: Entity[]): Fact[] {
  const chars = ents.filter((e) => e.kind === "character");
  const names = new Map<string, string>(); // any form -> canonical
  for (const e of chars) for (const n of [e.name, ...e.aliases]) names.set(n, e.name);
  const facts: Fact[] = [];
  const nameAlt = [...names.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  if (!nameAlt) return facts;
  const N = `(${nameAlt})`;
  const pats: { re: RegExp; attr: string; subj: number; val: number; obj?: number }[] = [
    { re: new RegExp(`\\b${N}[’']s\\s+(?:\\w+\\s+)?(${COLORS})\\s+eyes\\b`, "g"), attr: "eye colour", subj: 1, val: 2 },
    { re: new RegExp(`\\b${N}\\s+had\\s+(?:\\w+\\s+)?(${COLORS})\\s+eyes\\b`, "g"), attr: "eye colour", subj: 1, val: 2 },
    { re: new RegExp(`\\b${N}[’']s\\s+(?:\\w+\\s+)?(${COLORS})\\s+hair\\b`, "g"), attr: "hair colour", subj: 1, val: 2 },
    { re: new RegExp(`\\b${N}\\s+had\\s+(?:\\w+\\s+)?(${COLORS})\\s+hair\\b`, "g"), attr: "hair colour", subj: 1, val: 2 },
    { re: new RegExp(`\\b${N}\\s+(?:was|is|had\\s+turned|turned)\\s+([a-z]+(?:-[a-z]+)?|\\d{1,3})\\s+years?\\s+old\\b`, "g"), attr: "age", subj: 1, val: 2 },
    { re: new RegExp(`\\b${N},\\s+(?:a|an|the)?\\s*([a-z]+(?:-[a-z]+)?|\\d{1,3})-year-old\\b`, "g"), attr: "age", subj: 1, val: 2 },
    { re: new RegExp(`\\b${N}[’']s\\s+(?:older\\s+|younger\\s+|little\\s+|big\\s+|late\\s+)?(${RELATIONS}),?\\s+${N}\\b`, "g"), attr: "relation", subj: 3, val: 2, obj: 1 },
    { re: new RegExp(`\\b${N},\\s+${N}[’']s\\s+(?:older\\s+|younger\\s+|little\\s+|big\\s+|late\\s+)?(${RELATIONS})\\b`, "g"), attr: "relation", subj: 1, val: 3, obj: 2 },
  ];
  for (const ch of chapters) for (const p of ch.paragraphs) for (const pat of pats) {
    pat.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.re.exec(p.text))) {
      const subj = names.get(m[pat.subj]) ?? m[pat.subj];
      let val = m[pat.val].toLowerCase().replace("gray", "grey").replace("blond", "blonde").replace("blondee", "blonde");
      const attr = pat.obj ? `relation to ${names.get(m[pat.obj]) ?? m[pat.obj]}` : pat.attr;
      if (pat.attr === "age") {
        const n = /^\d+$/.test(val) ? +val : wordsToNum(val);
        if (n === null) continue;
        val = String(n);
      }
      facts.push({ subject: subj, attribute: attr, value: val, ref: { chapterId: ch.id, chapterIdx: ch.idx, paragraphId: p.id, paragraphIdx: p.idx, quote: truncate(m[0], 160), label: ch.title } });
    }
  }
  return facts;
}

function wordsToNum(s: string): number | null {
  const units: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const tens: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const parts = s.split("-");
  if (parts.length === 1) return units[parts[0]] ?? tens[parts[0]] ?? null;
  if (parts.length === 2 && tens[parts[0]] && units[parts[1]] && units[parts[1]] < 10) return tens[parts[0]] + units[parts[1]];
  return null;
}

/**
 * Continuity: contradictions between facts. Ages may legitimately change as story time passes,
 * so age differences are reported as *possible* inconsistencies unless they occur in the same or adjacent chapter.
 */
export function factContradictions(facts: { subject: string; attribute: string; value: string; ref: Ref }[]): DraftIssue[] {
  const out: DraftIssue[] = [];
  const groups = new Map<string, typeof facts>();
  for (const f of facts) {
    const k = f.subject + "|" + f.attribute;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(f);
  }
  for (const [, list] of groups) {
    list.sort((a, b) => (a.ref.chapterIdx ?? 0) - (b.ref.chapterIdx ?? 0) || (a.ref.paragraphIdx ?? 0) - (b.ref.paragraphIdx ?? 0));
    const first = list[0];
    for (const f of list.slice(1)) {
      if (f.value === first.value) continue;
      if (first.attribute === "age") {
        const diff = +f.value - +first.value;
        const gap = (f.ref.chapterIdx ?? 0) - (first.ref.chapterIdx ?? 0);
        if (diff > 0 && gap > 1) continue; // plausibly time has passed
        out.push(contra(first, f, diff < 0 ? "major" : "moderate", diff < 0 ? `${f.subject} is ${first.value} in “${first.ref.label}” but ${f.value} in “${f.ref.label}” — younger later in the story.` : `${f.subject}'s age changes from ${first.value} to ${f.value} between nearby chapters.`, diff < 0 ? "Direct contradiction" : "Possible inconsistency (check how much story time has passed)"));
      } else {
        out.push(contra(first, f, first.attribute.startsWith("relation") ? "major" : "moderate", `${f.subject}'s ${first.attribute} is “${first.value}” in “${first.ref.label}” but “${f.value}” in “${f.ref.label}”.`, "Direct contradiction"));
      }
      break; // one report per subject/attribute
    }
  }
  return out;
}

function contra(a: { ref: Ref; value: string }, b: { ref: Ref; value: string; subject: string; attribute: string }, sev: "major" | "moderate", why: string, kind: string): DraftIssue {
  return {
    stage: "continuity", category: "Continuity: " + b.attribute, rule: "fact_conflict", severity: sev, objective: kind === "Direct contradiction",
    chapterId: b.ref.chapterId, paragraphId: b.ref.paragraphId, original: b.ref.quote, explanation: `${why} [${kind}]`,
    suggestion: null, revised: null, reason: `Readers notice when established details change. The detail was first established in “${a.ref.label}”: “${a.ref.quote}”. Make the two passages agree, or add an explanation in the text if the change is intentional.`,
    refs: [{ ...a.ref, label: `First established — ${a.ref.label}` }, { ...b.ref, label: `Contradiction — ${b.ref.label}` }], source: "rule", confidence: 0.85,
  };
}

/** Characters established early who vanish for the rest of the book. */
export function vanishedCharacters(ents: Entity[], chapterCount: number, chapterIds: Map<number, string>): DraftIssue[] {
  const out: DraftIssue[] = [];
  if (chapterCount < 6) return out;
  const top = ents.filter((e) => e.kind === "character").slice(0, 15);
  const maxIdx = Math.max(...chapterIds.keys());
  for (const e of top) {
    if (e.count < 12 || e.chapters.length < 2) continue;
    const last = Math.max(...e.chapters);
    const remaining = [...chapterIds.keys()].filter((i) => i > last).length;
    if (remaining >= Math.max(3, chapterCount * 0.35) && last < maxIdx) {
      out.push({
        stage: "developmental", category: "Character continuity", rule: "vanished_character", severity: "moderate", objective: false, chapterId: chapterIds.get(last) ?? null, paragraphId: null, original: e.name,
        explanation: `${e.name} appears ${e.count} times across ${e.chapters.length} chapters, then is never mentioned again for the final ${remaining} chapters.`,
        suggestion: null, revised: null, reason: "A significant character who disappears without explanation can feel like a dropped thread. Consider giving them a resolution, a mention of their fate, or reducing their early prominence.",
        refs: e.refs.slice(-2), source: "rule", confidence: 0.6,
      });
    }
  }
  return out;
}
