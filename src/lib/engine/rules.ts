import type { DraftIssue, Ref, Severity, Stage } from "../types";
import { countWords, dialogueRanges, inRanges, levenshtein, numberWord, sentences, STOPWORDS, truncate, words } from "../text";
import { AGREEMENT, CLICHES, CONFUSED, FANCY_TAGS, ACTION_TAGS, NOT_ADVERBS, REDUNDANT, TELLING_EMOTIONS, WORDY } from "./wordlists";
import { getSpeller, isCorrect } from "./spell";

/**
 * Built-in editorial engine. Deterministic, offline and free.
 * Design principle: precision over recall — a rule only fires on patterns that are almost always
 * genuine problems; stylistic findings are marked as subjective recommendations, and patterns inside
 * dialogue are softened because characters may legitimately speak non-standard English.
 */

export type RPara = { id: string; idx: number; text: string; style: string };
export type RChapter = { id: string; idx: number; title: string; heading: string | null; kind: string; number: number | null; matterType: string | null; paragraphs: RPara[] };

type Ctx = { ch: RChapter; p: RPara; dlg: [number, number][]; out: DraftIssue[]; counts: Map<string, number> };

const CAP_PER_CHAPTER: Record<string, number> = {
  adverb_tag: 6, telling: 6, filter: 5, passive: 6, long_sentence: 5, began_to: 4, echo: 5, cliche: 12, wordy: 12, redundant: 12, repetitive_start: 4, fancy_tag: 5, spelling: 60,
};

function push(c: Ctx, start: number, end: number, d: Omit<DraftIssue, "chapterId" | "paragraphId" | "original" | "revised" | "source"> & { suggestion?: string | null }) {
  const key = d.rule ?? d.category;
  const cap = CAP_PER_CHAPTER[key];
  const n = (c.counts.get(key) ?? 0) + 1;
  c.counts.set(key, n);
  if (cap && n > cap) return;
  const text = c.p.text;
  const original = text.slice(start, end);
  // Revised version = the containing sentence with the suggestion applied.
  let revised: string | null = null;
  if (d.suggestion != null) {
    const s = sentences(text).find((s) => start >= s.start && start < s.end + 1) ?? { start: 0, end: text.length, text };
    const sStart = Math.min(s.start, start);
    const sEnd = Math.max(s.end, end);
    revised = text.slice(sStart, start) + d.suggestion + text.slice(end, sEnd);
  }
  c.out.push({ ...d, chapterId: c.ch.id, paragraphId: c.p.id, original, revised, source: "rule" });
}

function inDialogue(c: Ctx, i: number) {
  return inRanges(i, c.dlg);
}

function matchCase(src: string, repl: string) {
  if (!repl) return repl;
  if (src[0] && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase()) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}

// ---------------------------------------------------------------- PROOFREAD
const REPEAT_OK = new Set(["had had", "that that", "is is", "do do", "bye bye", "no no", "very very", "so so", "now now", "there there", "well well", "come come", "tut tut", "knock knock", "boo boo", "yeah yeah", "yes yes", "ha ha", "go go", "chop chop", "mm mm"]);

function proofreadPara(c: Ctx, sp: Awaited<ReturnType<typeof getSpeller>>, vocab: Map<string, number>, known: Set<string>, nextPara?: RPara) {
  const t = c.p.text;
  if (c.p.style === "scene_break" || c.p.style === "heading") return;
  let m: RegExpExecArray | null;

  const rep = /\b([A-Za-z’']+)\s+\1\b/gi;
  while ((m = rep.exec(t))) {
    const pair = m[0].toLowerCase().replace(/\s+/g, " ");
    if (REPEAT_OK.has(pair)) continue;
    const dl = inDialogue(c, m.index);
    push(c, m.index, m.index + m[0].length, {
      stage: "proofread", category: "Repeated word", rule: "repeated_word", severity: "minor", objective: !dl,
      explanation: `The word “${m[1]}” appears twice in a row.` + (dl ? " Inside dialogue this may be intentional (a stammer or emphasis)." : ""),
      suggestion: m[1], reason: "Removes an accidental duplicated word.", confidence: dl ? 0.6 : 0.92,
    });
  }

  const spBefore = /(\S)\s+([,;:!?])(?![!?])/g;
  while ((m = spBefore.exec(t))) {
    if (/[–—\-]/.test(m[1])) continue;
    push(c, m.index, m.index + m[0].length, { stage: "proofread", category: "Punctuation spacing", rule: "space_before_punct", severity: "minor", objective: true, explanation: `There is a space before “${m[2]}”.`, suggestion: m[1] + m[2], reason: "In English typography, commas, semicolons, colons, question and exclamation marks follow the word directly.", confidence: 0.9 });
  }
  const spAfter = /([a-z]{2,})([,;])([A-Za-z]{2,})/g;
  while ((m = spAfter.exec(t))) {
    push(c, m.index, m.index + m[0].length, { stage: "proofread", category: "Punctuation spacing", rule: "space_after_punct", severity: "minor", objective: true, explanation: `A space is missing after “${m[2]}”.`, suggestion: `${m[1]}${m[2]} ${m[3]}`, reason: "Punctuation marks must be followed by a space.", confidence: 0.9 });
  }
  const joined = /([a-z]{3,})\.([A-Z][a-z]{2,})/g;
  while ((m = joined.exec(t))) {
    if (/^(com|org|net|io|co|uk)$/.test(m[2].toLowerCase())) continue;
    push(c, m.index, m.index + m[0].length, { stage: "proofread", category: "Missing space", rule: "missing_space_sentence", severity: "minor", objective: true, explanation: "Two sentences run together without a space after the full stop.", suggestion: `${m[1]}. ${m[2]}`, reason: "A space is required between sentences.", confidence: 0.85 });
  }

  const lowerI = /(^|[\s“"‘(])i(?=(\s|['’](m|ve|ll|d)\b))/g;
  while ((m = lowerI.exec(t))) {
    const at = m.index + m[1].length;
    push(c, at, at + 1, { stage: "proofread", category: "Capitalization", rule: "lowercase_i", severity: "minor", objective: true, explanation: "The pronoun “I” must always be capitalised.", suggestion: "I", reason: "Standard English capitalisation.", confidence: 0.95 });
  }

  const lowerStart = /\b([a-z]{2,})([.?!])\s+([a-z][a-z]+)/g;
  while ((m = lowerStart.exec(t))) {
    if (/^(etc|vs|approx|cf|al)$/.test(m[1]) || m[2] !== ".") continue;
    if (t.slice(Math.max(0, m.index - 2), m.index).includes(".")) continue;
    const start = m.index + m[1].length + 1;
    const wStart = t.indexOf(m[3], start);
    push(c, wStart, wStart + m[3].length, { stage: "proofread", category: "Capitalization", rule: "sentence_case", severity: "minor", objective: true, explanation: "A new sentence appears to begin with a lowercase letter after a full stop.", suggestion: m[3][0].toUpperCase() + m[3].slice(1), reason: "Sentences begin with a capital letter. (If the full stop is a typo for a comma, change that instead.)", confidence: 0.75 });
  }

  const doubles = /(,,|;;|::|(?<!\.)\.\.(?!\.)|\s\.(?=\s|$))/g;
  while ((m = doubles.exec(t))) {
    push(c, m.index, m.index + m[0].length, { stage: "proofread", category: "Punctuation", rule: "double_punct", severity: "minor", objective: true, explanation: `Doubled or stray punctuation: “${m[0].trim()}”.`, suggestion: m[0].trim()[0], reason: "Removes an accidental duplicate punctuation mark.", confidence: 0.85 });
  }
  const bangs = /[!?]{3,}|!!/g;
  while ((m = bangs.exec(t))) {
    push(c, m.index, m.index + m[0].length, { stage: "line", category: "Punctuation style", rule: "multi_exclaim", severity: "minor", objective: false, explanation: "Multiple exclamation or question marks read as amateurish in published prose.", suggestion: m[0].includes("?") ? "?" : "!", reason: "Professional fiction lets the words carry the emphasis; a single mark is the convention.", confidence: 0.7 });
  }

  // Quotation-mark balance (allowing for multi-paragraph speeches, where a paragraph has no closing quote but the next opens with one).
  const straight = (t.match(/"/g) ?? []).length;
  const opens = (t.match(/“/g) ?? []).length;
  const closes = (t.match(/”/g) ?? []).length;
  const nextOpens = !!nextPara && /^\s*[“"]/.test(nextPara.text);
  if (opens !== closes || straight % 2 === 1) {
    const unclosed = opens > closes || straight % 2 === 1;
    if (!(unclosed && nextOpens)) {
      const at = Math.max(0, closes > opens ? t.lastIndexOf("”") : opens > closes ? t.lastIndexOf("“") : t.lastIndexOf('"'));
      const s = sentences(t).find((s) => at >= s.start && at <= s.end) ?? { start: 0, end: Math.min(t.length, 160) };
      push(c, s.start, s.end, { stage: "proofread", category: "Quotation marks", rule: "unbalanced_quotes", severity: "moderate", objective: true, explanation: closes > opens ? "This paragraph has a closing quotation mark without a matching opening mark." : "This paragraph opens a quotation that is never closed, and the next paragraph does not continue the speech.", suggestion: null, reason: "Unbalanced quotation marks confuse readers about who is speaking and are flagged by publishers' typesetters.", confidence: 0.8 });
    }
  }
  const po = (t.match(/\(/g) ?? []).length;
  const pc = (t.match(/\)/g) ?? []).length;
  if (po !== pc && !/^\s*\d+\)|\b[a-z]\)/.test(t)) {
    const at = Math.max(0, t.indexOf(po > pc ? "(" : ")"));
    push(c, at, Math.min(t.length, at + 60), { stage: "proofread", category: "Punctuation", rule: "unbalanced_parens", severity: "minor", objective: true, explanation: "Parentheses are not balanced in this paragraph.", suggestion: null, reason: "Every opening parenthesis needs a closing one.", confidence: 0.8 });
  }

  // Missing terminal punctuation on a prose paragraph.
  if (c.p.style === "p" && countWords(t) >= 8 && !/[.!?…"”’'):;—–\-*\]]$/.test(t.trim())) {
    const s = sentences(t);
    const last = s[s.length - 1];
    if (last) push(c, last.start, last.end, { stage: "proofread", category: "Missing punctuation", rule: "no_terminal_punct", severity: "minor", objective: true, explanation: "This paragraph ends without terminal punctuation.", suggestion: last.text + ".", reason: "Each sentence should end with a full stop, question mark or exclamation mark.", confidence: 0.7 });
  }

  // Spelling (lowercase words only; invented words used repeatedly are treated as intentional).
  const seen = new Set<string>();
  const wre = /(?<![\p{L}’'-])([a-z][a-z’']*[a-z]|[a-z]{2,})(?![\p{L}-])/gu;
  while ((m = wre.exec(t))) {
    const w = m[1];
    if (w.length < 3 || seen.has(w)) continue;
    seen.add(w);
    const base = w.replace(/[’']s$/, "").replace(/[’']$/, "");
    if ((vocab.get(base) ?? 0) >= 3 || known.has(base)) continue;
    if (/[’']/.test(base) && !/n[’']t$|[’'](ll|ve|re|d|m)$/.test(base)) continue; // dialect contractions (e.g. “goin’”)
    if (isCorrect(sp, base) || isCorrect(sp, base.replace(/’/g, "'"))) continue;
    const dl = inDialogue(c, m.index);
    const suggestions = sp.suggest(base).slice(0, 3);
    push(c, m.index, m.index + w.length, {
      stage: "proofread", category: "Spelling", rule: "spelling", severity: "minor", objective: !dl,
      explanation: `“${w}” is not in the dictionary.` + (suggestions.length ? ` Did you mean ${suggestions.map((s) => `“${s}”`).join(", ")}?` : "") + (dl ? " It occurs in dialogue, so it may be intentional dialect or slang." : ""),
      suggestion: suggestions[0] ? w.replace(base, suggestions[0]) : null, reason: "Corrects a likely misspelling. If the word is intentional (a coined term or dialect), reject this suggestion.", confidence: dl ? 0.55 : suggestions.length ? 0.8 : 0.6,
    });
  }
}

// ---------------------------------------------------------------- COPY EDIT
const DAYS_MONTHS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|september|october|november|december)\b/g;
const A_AN_EXCEPT_A = /^(one|once|uni|use|usu|usa|uti|ure|uro|eu|ewe|ufo|uk|us\b|u-|u\b|ubiq|ukul|uran|ufol)/i; // "a university", "a one-time"
const A_AN_EXCEPT_AN = /^(hour|honest|honou?r|heir|herb\b|hors d)/i;

function copyPara(c: Ctx) {
  const t = c.p.text;
  if (c.p.style === "scene_break") return;
  let m: RegExpExecArray | null;
  for (const r of CONFUSED) {
    r.re.lastIndex = 0;
    while ((m = r.re.exec(t))) {
      const dl = inDialogue(c, m.index);
      push(c, m.index, m.index + m[0].length, { stage: "copy", category: "Misused word", rule: "confused_word", severity: "moderate", objective: !dl, explanation: r.why + (dl ? " (This is in dialogue — keep it only if the character is meant to speak this way.)" : ""), suggestion: matchCase(m[0], r.fix(m)), reason: "Standard usage expected by publishers and readers.", confidence: dl ? r.conf * 0.7 : r.conf });
    }
  }
  for (const r of AGREEMENT) {
    r.re.lastIndex = 0;
    while ((m = r.re.exec(t))) {
      const dl = inDialogue(c, m.index);
      push(c, m.index, m.index + m[0].length, { stage: "copy", category: "Subject–verb agreement", rule: "agreement", severity: dl ? "minor" : "major", objective: !dl, explanation: r.why + (dl ? " In dialogue this may be the character’s natural voice or dialect." : ""), suggestion: matchCase(m[0], r.fix(m)), reason: "Subject and verb must agree in number and person.", confidence: dl ? 0.5 : 0.9 });
    }
  }
  const art = /\b(a|an|A|An)\s+([A-Za-z][\w-]*)/g;
  while ((m = art.exec(t))) {
    const a = m[1].toLowerCase();
    const w = m[2];
    if (/^[A-Z]{2,}$/.test(w)) continue; // acronyms – pronunciation dependent
    const vowel = /^[aeiou]/i.test(w);
    let wrong = false;
    if (a === "a" && vowel && !A_AN_EXCEPT_A.test(w)) wrong = true;
    if (a === "an" && !vowel && !A_AN_EXCEPT_AN.test(w) && !/^[0-9]/.test(w)) wrong = true;
    if (a === "a" && A_AN_EXCEPT_AN.test(w)) wrong = true;
    if (!wrong) continue;
    const fix = a === "a" ? "an" : "a";
    push(c, m.index, m.index + m[0].length, { stage: "copy", category: "Article", rule: "a_an", severity: "minor", objective: true, explanation: `Use “${fix}” before “${w}” (the choice depends on the sound of the next word).`, suggestion: matchCase(m[1], fix) + " " + w, reason: "“A” comes before consonant sounds, “an” before vowel sounds.", confidence: 0.85 });
  }
  DAYS_MONTHS.lastIndex = 0;
  while ((m = DAYS_MONTHS.exec(t))) {
    push(c, m.index, m.index + m[0].length, { stage: "copy", category: "Capitalization", rule: "day_month_case", severity: "minor", objective: true, explanation: `Days of the week and months are capitalised: “${m[0][0].toUpperCase() + m[0].slice(1)}”.`, suggestion: m[0][0].toUpperCase() + m[0].slice(1), reason: "Proper nouns are capitalised.", confidence: 0.9 });
  }
  for (const s of sentences(t)) {
    const wc = countWords(s.text);
    const commas = (s.text.match(/[,;:—–]/g) ?? []).length;
    if (wc > 70 && commas <= 2 && !inDialogue(c, s.start)) {
      push(c, s.start, s.end, { stage: "copy", category: "Run-on sentence", rule: "run_on", severity: "moderate", objective: false, explanation: `This sentence runs to ${wc} words with almost no internal punctuation, which makes it hard to follow.`, suggestion: null, reason: "Breaking it into two or three sentences, or adding punctuation at the natural pauses, will restore clarity.", confidence: 0.7 });
    }
  }
}

// ---------------------------------------------------------------- LINE EDIT
const CLICHES_BY_LENGTH = [...CLICHES].sort((a, b) => b.length - a.length);
const NON_MANNER = new Set(["finally", "eventually", "immediately", "presently", "simply", "only", "early", "lately", "really", "actually", "suddenly", "again"]);
function linePara(c: Ctx, knownLower: Set<string>) {
  const t = c.p.text;
  if (c.p.style === "scene_break" || c.p.style === "heading") return;
  let m: RegExpExecArray | null;
  for (const [re, repl, why] of WORDY) {
    re.lastIndex = 0;
    while ((m = re.exec(t))) push(c, m.index, m.index + m[0].length, { stage: "line", category: "Wordiness", rule: "wordy", severity: "minor", objective: false, explanation: why, suggestion: repl ? matchCase(m[0], repl) : null, reason: "Tighter phrasing improves pace without changing meaning.", confidence: 0.75 });
  }
  for (const [re, repl] of REDUNDANT) {
    re.lastIndex = 0;
    while ((m = re.exec(t))) {
      const fix = m[0].replace(new RegExp(re.source, "i"), repl);
      push(c, m.index, m.index + m[0].length, { stage: "line", category: "Redundancy", rule: "redundant", severity: "minor", objective: false, explanation: `“${m[0]}” contains a redundancy — the extra words repeat what the verb or noun already says.`, suggestion: matchCase(m[0], fix), reason: "Removing redundant words makes prose crisper.", confidence: 0.8 });
    }
  }
  const lower = t.toLowerCase();
  const taken: [number, number][] = [];
  for (const cl of CLICHES_BY_LENGTH) {
    let at = lower.indexOf(cl);
    while (at >= 0) {
      const before = lower[at - 1];
      const after = lower[at + cl.length];
      const overlaps = taken.some(([a, b]) => at < b && at + cl.length > a);
      if (!overlaps && (!before || !/[a-z]/.test(before)) && (!after || !/[a-z]/.test(after))) {
        taken.push([at, at + cl.length]);
        const dl = inDialogue(c, at);
        push(c, at, at + cl.length, { stage: "line", category: "Cliché", rule: "cliche", severity: "minor", objective: false, explanation: `“${t.slice(at, at + cl.length)}” is a familiar stock phrase.` + (dl ? " Characters do speak in clichés, so this may be deliberate in dialogue." : ""), suggestion: null, reason: "Replacing clichés with a fresh, specific image tied to this character or setting makes the writing feel original.", confidence: dl ? 0.45 : 0.7 });
      }
      at = lower.indexOf(cl, at + cl.length);
    }
  }
  const tagAdv = /\b(said|asked|replied|whispered|shouted|muttered|answered|called|cried|snapped|murmured)\s+([a-z]+ly)\b/gi;
  while ((m = tagAdv.exec(t))) {
    if (NOT_ADVERBS.has(m[2].toLowerCase()) || NON_MANNER.has(m[2].toLowerCase())) continue;
    push(c, m.index, m.index + m[0].length, { stage: "line", category: "Adverb in dialogue tag", rule: "adverb_tag", severity: "minor", objective: false, explanation: `The adverb “${m[2]}” tells the reader how the line was spoken instead of letting the dialogue or an action beat show it.`, suggestion: m[1], reason: "Strong dialogue usually conveys tone by itself; if not, a brief action beat is more vivid than an adverb.", confidence: 0.6 });
  }
  const fancy = new RegExp(`[,!?…—]["”]\\s+(?:[A-Z][a-z]+|he|she|they|I|we)\\s+(${FANCY_TAGS})\\b`, "g");
  while ((m = fancy.exec(t))) {
    const at = t.indexOf(m[1], m.index);
    push(c, at, at + m[1].length, { stage: "line", category: "Dialogue tags", rule: "fancy_tag", severity: "minor", objective: false, explanation: `“${m[1]}” is an ornate dialogue tag that draws attention away from the dialogue.`, suggestion: "said", reason: "“Said” and “asked” are nearly invisible to readers, keeping focus on what is said.", confidence: 0.55 });
  }
  const action = new RegExp(`([,])(["”])\\s+((?:[A-Z][a-z]+|he|she|they|I|we)\\s+(${ACTION_TAGS}))\\b`, "g");
  while ((m = action.exec(t))) {
    push(c, m.index, m.index + m[0].length, { stage: "copy", category: "Dialogue punctuation", rule: "action_as_tag", severity: "minor", objective: true, explanation: `“${m[4]}” is an action, not a way of speaking — you can’t ${m[4].replace(/ed$|d$/, "")} words. It should be a separate action beat.`, suggestion: `.${m[2]} ${m[3][0].toUpperCase() + m[3].slice(1)}`, reason: "Use a full stop before the closing quotation mark and start the action beat as its own sentence.", confidence: 0.75 });
  }
  const tell = new RegExp(`\\b(felt|feel|feels|feeling|was|were|became|grew)\\s+(so\\s+|very\\s+|really\\s+|incredibly\\s+|extremely\\s+)?(${TELLING_EMOTIONS})\\b`, "gi");
  while ((m = tell.exec(t))) {
    if (inDialogue(c, m.index)) continue;
    push(c, m.index, m.index + m[0].length, { stage: "line", category: "Telling instead of showing", rule: "telling", severity: "minor", objective: false, explanation: `“${m[0]}” names the emotion directly.`, suggestion: null, reason: "Showing the emotion through physical reactions, actions, thoughts or dialogue lets readers feel it rather than be told it. Use telling deliberately, e.g. for pace.", confidence: 0.55 });
  }
  const filter = /\b(he|she|they|I|we)\s+(saw|heard|noticed|watched|realized|realised|wondered|felt)\s+(that|how)\b/gi;
  while ((m = filter.exec(t))) {
    if (inDialogue(c, m.index)) continue;
    push(c, m.index, m.index + m[0].length, { stage: "line", category: "Filter words", rule: "filter", severity: "minor", objective: false, explanation: `“${m[0]}” filters the experience through the character's perception, adding distance.`, suggestion: null, reason: "Presenting the observation directly (e.g. “The door was open.” instead of “She saw that the door was open.”) is more immediate.", confidence: 0.5 });
  }
  const passive = /\b(was|were|is|are|been|being)\s+((?:[a-z]+ed)|written|taken|given|seen|done|made|known|shown|told|held|found|broken|eaten|driven|chosen|forgotten|hidden|stolen|thrown|beaten|bitten|caught|brought|bought|built|sent|kept|left|lost|paid|sold|struck|torn|worn|woken|killed|shot)\s+by\s+(the\s+|a\s+|an\s+|his\s+|her\s+|their\s+)?\w+/gi;
  while ((m = passive.exec(t))) {
    if (inDialogue(c, m.index)) continue;
    push(c, m.index, m.index + m[0].length, { stage: "line", category: "Passive voice", rule: "passive", severity: "minor", objective: false, explanation: `“${m[0]}” is in the passive voice.`, suggestion: null, reason: "Active constructions (who did what) are usually more direct and energetic. Passive voice is fine when the actor is unknown or unimportant.", confidence: 0.55 });
  }
  const began = /\b(began|started|begun)\s+to\s+(\w+)/gi;
  while ((m = began.exec(t))) {
    if (inDialogue(c, m.index)) continue;
    push(c, m.index, m.index + m[0].length, { stage: "line", category: "Weak verb construction", rule: "began_to", severity: "minor", objective: false, explanation: `“${m[0]}” delays the action.`, suggestion: null, reason: "Unless the beginning of the action matters, the simple past verb (e.g. “ran” for “began to run”) is stronger.", confidence: 0.5 });
  }
  const ss = sentences(t);
  for (const s of ss) {
    const wc = countWords(s.text);
    if (wc > 48 && !inDialogue(c, s.start)) push(c, s.start, s.end, { stage: "line", category: "Long sentence", rule: "long_sentence", severity: "minor", objective: false, explanation: `This sentence is ${wc} words long.`, suggestion: null, reason: "Very long sentences can tire readers. Consider whether it would land harder split in two — unless the length is a deliberate rhythmic effect.", confidence: 0.5 });
  }
  // Repetitive sentence openings within a paragraph.
  for (let i = 0; i + 2 < ss.length; i++) {
    const f = (s: string) => (s.replace(/^[“"‘(]+/, "").match(/^[A-Za-z’']+/)?.[0] ?? "").toLowerCase();
    const a = f(ss[i].text);
    if (a && a.length > 1 && a === f(ss[i + 1].text) && a === f(ss[i + 2].text) && !["and"].includes(a)) {
      push(c, ss[i].start, ss[i + 2].end, { stage: "line", category: "Repetitive sentence openings", rule: "repetitive_start", severity: "minor", objective: false, explanation: `Three consecutive sentences begin with “${a}”.`, suggestion: null, reason: "Varying sentence openings improves rhythm (unless the repetition is a deliberate rhetorical device).", confidence: 0.6 });
      i += 2;
    }
  }
  // Word echoes: the same distinctive word three or more times in one paragraph.
  const freq = new Map<string, number[]>();
  const wre = /[A-Za-z’']+/g;
  while ((m = wre.exec(t))) {
    const w = m[0].toLowerCase();
    if (w.length < 6 || STOPWORDS.has(w) || knownLower.has(w) || /^[A-Z]/.test(m[0])) continue;
    const stem = w.replace(/(ing|ed|ly|s)$/, "");
    if (!freq.has(stem)) freq.set(stem, []);
    freq.get(stem)!.push(m.index);
  }
  for (const [w, pos] of freq) {
    if (pos.length >= 3 && countWords(t) < 400) {
      const end = t.slice(pos[2]).match(/^[A-Za-z’']+/)![0].length + pos[2];
      push(c, pos[0], end, { stage: "line", category: "Unnecessary repetition", rule: "echo", severity: "minor", objective: false, explanation: `Forms of “${w}” appear ${pos.length} times in this paragraph.`, suggestion: null, reason: "Repeating a distinctive word in a short space creates an echo the reader notices. Vary or cut some instances unless the repetition is intentional.", confidence: 0.6 });
    }
  }
  // Very long unbroken speech.
  for (const [a, b] of c.dlg) {
    const wc = countWords(t.slice(a, b));
    if (wc > 220) push(c, a, Math.min(b, a + 200), { stage: "line", category: "Dialogue", rule: "monologue", severity: "minor", objective: false, explanation: `A single uninterrupted speech of about ${wc} words.`, suggestion: null, reason: "Long speeches can feel unnatural. Consider breaking it with action beats, reactions or interruptions from other characters.", confidence: 0.5 });
  }
}

// ---------------------------------------------------------------- MANUSCRIPT-LEVEL CHECKS
function ref(ch: RChapter, p: RPara, quote: string): Ref {
  return { chapterId: ch.id, chapterIdx: ch.idx, paragraphId: p.id, paragraphIdx: p.idx, quote: truncate(quote, 160), label: ch.title };
}

async function manuscriptChecks(chapters: RChapter[], stages: Set<Stage>, knownNames: Set<string>): Promise<DraftIssue[]> {
  const out: DraftIssue[] = [];
  const body = chapters.filter((c) => c.kind === "chapter");
  const allParas = chapters.flatMap((ch) => ch.paragraphs.map((p) => ({ ch, p })));

  if (stages.has("proofread")) {
    // Chapter numbering.
    const numbered = body.filter((c) => c.number !== null && c.matterType !== "auto");
    for (let i = 1; i < numbered.length; i++) {
      const a = numbered[i - 1].number!,
        b = numbered[i].number!;
      if (b === a) out.push(msIssue("proofread", "Chapter numbering", "chapter_dup", "major", true, numbered[i], `Chapter number ${b} is used twice (“${numbered[i - 1].heading}” and “${numbered[i].heading}”).`, "Renumber the chapters so each number is used once and in order.", [hRef(numbered[i - 1]), hRef(numbered[i])], numbered[i].heading));
      else if (b !== a + 1 && !(b === 1 && a > 1)) out.push(msIssue("proofread", "Chapter numbering", "chapter_gap", "major", true, numbered[i], b < a ? `Chapter ${b} appears after Chapter ${a} — chapters are out of order.` : `Chapter numbering jumps from ${a} to ${b}; ${b - a - 1 === 1 ? `chapter ${a + 1} is` : `chapters ${a + 1}–${b - 1} are`} missing.`, "Check whether a chapter is missing from the file or the numbering needs correcting.", [hRef(numbered[i - 1]), hRef(numbered[i])], numbered[i].heading));
    }
    // Heading style consistency.
    const forms = new Map<string, RChapter[]>();
    for (const c of body) {
      if (!c.heading || c.matterType) continue;
      const h = c.heading;
      const f = /^chapter\s+\d+/i.test(h) ? "digits" : /^chapter\s+[ivxlc]+\b/i.test(h) ? "roman" : /^chapter\s+[a-z]/i.test(h) ? "words" : /^\d+/.test(h) ? "bare-number" : "other";
      const caseF = h === h.toUpperCase() ? "UPPER" : "Title";
      const k = `${f}/${caseF}`;
      if (!forms.has(k)) forms.set(k, []);
      forms.get(k)!.push(c);
    }
    if (forms.size > 1) {
      const sorted = [...forms.entries()].sort((a, b) => b[1].length - a[1].length);
      const minority = sorted.slice(1).flatMap(([, v]) => v);
      out.push(msIssue("proofread", "Heading inconsistency", "heading_style", "moderate", true, minority[0], `Chapter headings use ${forms.size} different styles (e.g. “${sorted[0][1][0].heading}” vs “${minority[0].heading}”).`, `Use one heading style throughout; the most common here is like “${sorted[0][1][0].heading}”.`, minority.slice(0, 6).map(hRef), minority[0].heading));
    }
    // Empty or near-empty chapters.
    for (const c of body) {
      const wc = c.paragraphs.reduce((n, p) => n + countWords(p.text), 0);
      if (wc < 40) out.push(msIssue("proofread", "Formatting", "empty_chapter", "major", true, c, `“${c.title}” contains only ${wc} words.`, "Check whether text is missing, or whether this heading was detected by mistake.", [hRef(c)], c.heading));
    }
    // Quote style mix.
    let straight = 0,
      curly = 0;
    const straightRefs: Ref[] = [];
    for (const { ch, p } of allParas) {
      const s = (p.text.match(/"/g) ?? []).length;
      straight += s;
      curly += (p.text.match(/[“”]/g) ?? []).length;
      if (s && straightRefs.length < 5) straightRefs.push(ref(ch, p, p.text));
    }
    if (straight > 4 && curly > 4) out.push(msIssue("proofread", "Quotation marks", "quote_style_mix", "moderate", true, null, `The manuscript mixes straight quotation marks (") ${straight} times with curly quotation marks (“ ”) ${curly} times.`, "Convert all quotation marks to one style — curly (typographic) quotes are standard in published books.", straightRefs));
    else if (straight > 20 && curly === 0) out.push(msIssue("proofread", "Quotation marks", "straight_quotes", "minor", true, null, `The manuscript uses straight quotation marks (") throughout.`, "Typeset books use curly quotes (“ ” ‘ ’). Use your word processor's AutoFormat or Cashless Edit's clean export, which can convert them.", straightRefs.slice(0, 2)));
    // Dash and ellipsis style.
    const dashForms = { emdash: 0, double: 0, spacedHyphen: 0 };
    const dashRefs: Ref[] = [];
    let ell3 = 0,
      ellU = 0;
    for (const { ch, p } of allParas) {
      dashForms.emdash += (p.text.match(/—/g) ?? []).length;
      const d = (p.text.match(/--/g) ?? []).length;
      const sh = (p.text.match(/\w - \w/g) ?? []).length;
      dashForms.double += d;
      dashForms.spacedHyphen += sh;
      if ((d || sh) && dashRefs.length < 5) dashRefs.push(ref(ch, p, p.text));
      ell3 += (p.text.match(/\.\.\./g) ?? []).length;
      ellU += (p.text.match(/…/g) ?? []).length;
    }
    if (dashForms.double + dashForms.spacedHyphen > 2) out.push(msIssue("proofread", "Dashes", "dash_style", "minor", true, null, `Dashes are typed as “--” (${dashForms.double}×) or “ - ” (${dashForms.spacedHyphen}×)${dashForms.emdash ? ` alongside true em dashes (${dashForms.emdash}×)` : ""}.`, "Use the em dash (—) for breaks in thought and interruptions; hyphens are only for compound words.", dashRefs));
    if (ell3 > 3 && ellU > 3) out.push(msIssue("proofread", "Ellipses", "ellipsis_mix", "minor", true, null, `Ellipses are written both as three full stops (${ell3}×) and as the single ellipsis character (${ellU}×).`, "Pick one form and apply it consistently.", []));
    // Scene break consistency.
    const sb = new Map<string, Ref[]>();
    for (const { ch, p } of allParas) if (p.style === "scene_break") {
      const k = p.text.replace(/\s/g, "");
      if (!sb.has(k)) sb.set(k, []);
      sb.get(k)!.push(ref(ch, p, p.text));
    }
    if (sb.size > 1) out.push(msIssue("proofread", "Formatting", "scene_break_mix", "minor", true, null, `Scene breaks use ${sb.size} different markers (${[...sb.keys()].map((k) => `“${k}”`).join(", ")}).`, "Use a single, consistent scene-break marker (e.g. “* * *” or a centred “#”).", [...sb.values()].map((v) => v[0])));
  }

  if (stages.has("copy")) {
    // Name variants: rare spellings that differ by one letter from a frequent name.
    const sp = await getSpeller();
    const counts = new Map<string, { n: number; refs: Ref[]; inCompound: number }>();
    for (const { ch, p } of allParas) {
      const re = /(?<![.!?]\s|^)\b([A-Z][a-z]{3,})\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(p.text))) {
        const w = m[1];
        const e = counts.get(w) ?? { n: 0, refs: [], inCompound: 0 };
        e.n++;
        // Part of a longer proper name ("Mary Ellen", "Port Ardent")?
        if (/^\s+[A-Z][a-z]/.test(p.text.slice(m.index + w.length)) || /[A-Z][a-z]+\s+$/.test(p.text.slice(0, m.index))) e.inCompound++;
        if (e.refs.length < 4) e.refs.push(ref(ch, p, p.text.slice(Math.max(0, m.index - 60), m.index + 80)));
        counts.set(w, e);
      }
    }
    const names = [...counts.entries()].filter(([w, e]) => e.n >= 8 || knownNames.has(w));
    for (const [rare, re] of counts) {
      if (re.n > 3) continue;
      // Real names/words in the dictionary (e.g. “Mary”) and parts of longer names are unlikely to be typos.
      if (re.inCompound >= re.n || sp.correct(rare)) continue;
      for (const [main, me] of names) {
        if (main === rare || me.n < re.n * 4) continue;
        if (Math.abs(main.length - rare.length) > 1 || levenshtein(main.toLowerCase(), rare.toLowerCase()) !== 1) continue;
        if (main.toLowerCase() + "s" === rare.toLowerCase()) continue;
        out.push({
          stage: "copy", category: "Inconsistent names", rule: "name_variant", severity: "major", objective: true, chapterId: re.refs[0].chapterId, paragraphId: re.refs[0].paragraphId,
          original: rare, explanation: `“${rare}” appears ${re.n}× but “${main}” appears ${me.n}× — this looks like an inconsistent spelling of the same name.`, suggestion: main, revised: null,
          reason: "Character and place names must be spelled identically throughout. If these are two different people or places, reject this.", refs: [...re.refs.slice(0, 3), ...me.refs.slice(0, 2).map((r) => ({ ...r, label: `“${main}” used in ${r.label}` }))], source: "rule", confidence: 0.8,
        });
        break;
      }
    }
    // Number style: numerals under 100 in prose vs spelled-out numbers.
    let numerals = 0,
      spelled = 0;
    const numRefs: Ref[] = [];
    for (const { ch, p } of allParas) {
      const nm = p.text.match(/(?<![\d:.,$£€#/-])\b([1-9]\d?)\b(?![\d:.,%/]|\s?(?:am|pm|a\.m|p\.m|percent|%|st|nd|rd|th))/gi) ?? [];
      numerals += nm.length;
      if (nm.length && numRefs.length < 5) numRefs.push(ref(ch, p, p.text));
      spelled += (p.text.match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)\b/gi) ?? []).length;
    }
    if (numerals >= 5 && spelled >= 5) out.push(msIssue("copy", "Inconsistent numbers", "number_style", "minor", false, null, `Numbers under 100 appear both as numerals (${numerals}×) and spelled out (${spelled}×).`, `Fiction conventionally spells out numbers from zero to one hundred (Chicago Manual of Style), e.g. “${numberWord(7)}” rather than “7”. Choose one approach and apply it consistently.`, numRefs));
    // Measurement systems.
    let imperial = 0,
      metric = 0;
    const mRefs: Ref[] = [];
    for (const { ch, p } of allParas) {
      const im = (p.text.match(/\b(miles?|feet|foot|inch(es)?|yards?|pounds?|ounces?|fahrenheit|mph)\b/gi) ?? []).length;
      const me = (p.text.match(/\b(kilomet(er|re)s?|met(er|re)s?|centimet(er|re)s?|kilograms?|kilos?|grams?|celsius|km|kph)\b/gi) ?? []).length;
      imperial += im;
      metric += me;
      if ((im || me) && mRefs.length < 6) mRefs.push(ref(ch, p, p.text));
    }
    if (imperial >= 2 && metric >= 2) out.push(msIssue("copy", "Inconsistent measurements", "measure_mix", "minor", false, null, `Both imperial (${imperial}×) and metric (${metric}×) units are used.`, "Unless a character's background explains it, use one measurement system consistently for the setting.", mRefs));
    // Narrative tense consistency per chapter (very conservative).
    for (const ch of body) {
      let past = 0,
        present = 0;
      const presRefs: Ref[] = [];
      for (const p of ch.paragraphs) {
        const dl = dialogueRanges(p.text);
        const re = /\b(?:he|she|they|I|we|[A-Z][a-z]+)\s+(said|says|asked|asks|walked|walks|looked|looks|turned|turns|smiled|smiles|nodded|nods)\b/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(p.text))) {
          if (inRanges(m.index, dl)) continue;
          if (/s$/.test(m[1]) && !/ed$/.test(m[1])) {
            present++;
            if (presRefs.length < 3) presRefs.push(ref(ch, p, p.text.slice(Math.max(0, m.index - 40), m.index + 60)));
          } else past++;
        }
      }
      const tot = past + present;
      if (tot >= 12 && Math.min(past, present) / tot > 0.2) out.push(msIssue("copy", "Tense consistency", "tense_shift", "major", false, ch, `The narration in “${ch.title}” mixes past tense (${past}×) and present tense (${present}×) for the same kinds of verbs.`, "Check for unintended tense shifts; narration should normally hold one tense within a scene.", presRefs, null));
    }
  }

  if (stages.has("developmental")) {
    // Chapter length outliers (pacing signal).
    const lens = body.map((c) => ({ c, wc: c.paragraphs.reduce((n, p) => n + countWords(p.text), 0) }));
    if (lens.length >= 5) {
      const sorted = lens.map((x) => x.wc).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      for (const { c, wc } of lens) {
        if (wc > med * 2.6 && wc > 5000) out.push(msIssue("developmental", "Pacing", "long_chapter", "moderate", false, c, `“${c.title}” is ${wc.toLocaleString()} words — about ${(wc / med).toFixed(1)}× the typical chapter length in this manuscript (${med.toLocaleString()}).`, "Unusually long chapters can sag. Consider whether it contains a natural break where it could be split, or material that could be trimmed.", [hRef(c)], null));
        if (wc < med * 0.25 && wc >= 40 && med > 1500) out.push(msIssue("developmental", "Pacing", "short_chapter", "minor", false, c, `“${c.title}” is only ${wc.toLocaleString()} words, much shorter than the typical chapter (${med.toLocaleString()}).`, "Very short chapters can be powerful for emphasis; make sure this one is deliberate.", [hRef(c)], null));
      }
    }
  }
  return out;
}

function hRef(c: RChapter): Ref {
  return { chapterId: c.id, chapterIdx: c.idx, paragraphIdx: 0, paragraphId: c.paragraphs[0]?.id, quote: c.heading ?? c.title, label: c.title };
}

function msIssue(stage: Stage, category: string, rule: string, severity: Severity, objective: boolean, ch: RChapter | null, explanation: string, reason: string, refs: Ref[], original?: string | null): DraftIssue {
  // When the finding is about a heading (passed explicitly), it is not anchored to a body paragraph.
  return { stage, category, rule, severity, objective, chapterId: ch?.id ?? refs[0]?.chapterId ?? null, paragraphId: original != null ? null : refs[0]?.paragraphId ?? null, original: original ?? refs[0]?.quote ?? null, explanation, suggestion: null, revised: null, reason, refs, source: "rule", confidence: 0.75 };
}

// ---------------------------------------------------------------- ENTRY POINT
export function buildVocab(chapters: RChapter[]) {
  const vocab = new Map<string, number>();
  for (const ch of chapters) for (const p of ch.paragraphs) for (const w of words(p.text)) {
    const l = w.toLowerCase().replace(/[’']s$/, "");
    vocab.set(l, (vocab.get(l) ?? 0) + 1);
  }
  return vocab;
}

export async function runRulesOnChapter(ch: RChapter, stages: Set<Stage>, vocab: Map<string, number>, knownNames: Set<string>): Promise<DraftIssue[]> {
  const out: DraftIssue[] = [];
  const sp = stages.has("proofread") ? await getSpeller() : null;
  const knownLower = new Set([...knownNames].map((n) => n.toLowerCase()));
  const counts = new Map<string, number>();
  for (let i = 0; i < ch.paragraphs.length; i++) {
    const p = ch.paragraphs[i];
    const c: Ctx = { ch, p, dlg: dialogueRanges(p.text), out, counts };
    if (stages.has("proofread") && sp) proofreadPara(c, sp, vocab, knownLower, ch.paragraphs[i + 1]);
    if (stages.has("copy")) copyPara(c);
    if (stages.has("line")) linePara(c, knownLower);
  }
  // Report how many low-priority stylistic instances were suppressed by the per-chapter cap.
  for (const [rule, n] of counts) {
    const cap = CAP_PER_CHAPTER[rule];
    if (cap && n > cap && rule !== "spelling") {
      const sample = out.find((x) => x.rule === rule && x.chapterId === ch.id);
      if (sample) sample.explanation += ` (This pattern occurs ${n} times in this chapter; only the first ${cap} are listed individually.)`;
    }
  }
  return dedupe(out);
}

export async function runManuscriptRules(chapters: RChapter[], stages: Set<Stage>, knownNames: Set<string>) {
  return manuscriptChecks(chapters, stages, knownNames);
}

/** Drops overlapping findings on the same text, keeping the most severe / most objective one. */
export function dedupe(issues: DraftIssue[]): DraftIssue[] {
  const sevRank = { critical: 4, major: 3, moderate: 2, minor: 1 } as const;
  const byPara = new Map<string, DraftIssue[]>();
  const rest: DraftIssue[] = [];
  for (const i of issues) {
    if (!i.paragraphId || !i.original) {
      rest.push(i);
      continue;
    }
    if (!byPara.has(i.paragraphId)) byPara.set(i.paragraphId, []);
    byPara.get(i.paragraphId)!.push(i);
  }
  for (const list of byPara.values()) {
    const kept: DraftIssue[] = [];
    for (const i of list.sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || Number(b.objective) - Number(a.objective))) {
      const dup = kept.some((k) => k.original === i.original || (k.rule === i.rule && k.original && i.original && (k.original.includes(i.original) || i.original.includes(k.original))));
      if (!dup) kept.push(i);
    }
    rest.push(...kept);
  }
  return rest;
}
