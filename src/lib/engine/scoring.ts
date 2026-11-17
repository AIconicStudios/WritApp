import { countWords, dialogueWordRatio, sentences, syllables, words } from "../text";
import { NOT_ADVERBS } from "./wordlists";

export type Metrics = {
  words: number;
  sentences: number;
  paragraphs: number;
  avgSentence: number;
  sentenceCv: number; // coefficient of variation of sentence length (variety)
  longSentencePct: number;
  fleschEase: number;
  fkGrade: number;
  dialoguePct: number;
  adverbsPer1k: number;
  fillerPer1k: number; // very / really / just / suddenly / quite / somewhat
  mattr: number; // moving-average type/token ratio (vocabulary richness)
  avgParagraph: number;
};

const FILLER = new Set(["very", "really", "just", "suddenly", "quite", "somewhat", "rather", "actually", "basically", "literally", "totally"]);

export function computeMetrics(paras: string[]): Metrics {
  let wc = 0,
    sc = 0,
    syl = 0,
    longS = 0,
    dlgWords = 0,
    adv = 0,
    filler = 0;
  const lens: number[] = [];
  const tokens: string[] = [];
  let pc = 0;
  for (const p of paras) {
    const w = countWords(p);
    if (!w) continue;
    pc++;
    wc += w;
    dlgWords += dialogueWordRatio(p) * w;
    for (const s of sentences(p)) {
      const n = countWords(s.text);
      if (!n) continue;
      sc++;
      lens.push(n);
      if (n > 35) longS++;
    }
    for (const t of words(p)) {
      const l = t.toLowerCase();
      tokens.push(l);
      syl += syllables(l);
      if (l.length > 4 && l.endsWith("ly") && !NOT_ADVERBS.has(l)) adv++;
      if (FILLER.has(l)) filler++;
    }
  }
  const avg = sc ? wc / sc : 0;
  const sd = lens.length ? Math.sqrt(lens.reduce((a, n) => a + (n - avg) ** 2, 0) / lens.length) : 0;
  const tw = tokens.length || 1;
  const fleschEase = sc ? 206.835 - 1.015 * (wc / sc) - 84.6 * (syl / tw) : 0;
  const fkGrade = sc ? 0.39 * (wc / sc) + 11.8 * (syl / tw) - 15.59 : 0;
  return {
    words: wc,
    sentences: sc,
    paragraphs: pc,
    avgSentence: round(avg, 1),
    sentenceCv: round(avg ? sd / avg : 0, 2),
    longSentencePct: round(sc ? (longS / sc) * 100 : 0, 1),
    fleschEase: round(fleschEase, 1),
    fkGrade: round(fkGrade, 1),
    dialoguePct: round(wc ? (dlgWords / wc) * 100 : 0, 1),
    adverbsPer1k: round((adv / tw) * 1000, 1),
    fillerPer1k: round((filler / tw) * 1000, 1),
    mattr: round(mattr(tokens, 400), 3),
    avgParagraph: round(pc ? wc / pc : 0, 1),
  };
}

function mattr(tokens: string[], win: number): number {
  if (tokens.length < 50) return 0;
  if (tokens.length <= win) return new Set(tokens).size / tokens.length;
  const counts = new Map<string, number>();
  let uniq = 0;
  for (let i = 0; i < win; i++) {
    const c = (counts.get(tokens[i]) ?? 0) + 1;
    counts.set(tokens[i], c);
    if (c === 1) uniq++;
  }
  let sum = uniq / win;
  let n = 1;
  const step = Math.max(1, Math.floor(tokens.length / 2000)); // sample for very long books
  for (let i = win; i < tokens.length; i++) {
    const out = tokens[i - win];
    const co = counts.get(out)! - 1;
    counts.set(out, co);
    if (co === 0) uniq--;
    const c = (counts.get(tokens[i]) ?? 0) + 1;
    counts.set(tokens[i], c);
    if (c === 1) uniq++;
    if (i % step === 0) {
      sum += uniq / win;
      n++;
    }
  }
  return sum / n;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));

export type ScoreItem = { score: number | null; explanation: string; basis: "measured" | "ai" | "combined" | "not_assessed" };
export type Scores = Record<
  "overall" | "plot" | "character" | "dialogue" | "grammar" | "sentence" | "vocabulary" | "pacing" | "readability" | "emotional" | "originality" | "consistency" | "publication",
  ScoreItem
>;

export const SCORE_LABELS: Record<keyof Scores, string> = {
  overall: "Overall manuscript quality",
  plot: "Plot & story structure",
  character: "Character development",
  dialogue: "Dialogue",
  grammar: "Grammar & mechanics",
  sentence: "Sentence construction",
  vocabulary: "Vocabulary",
  pacing: "Pacing",
  readability: "Readability",
  emotional: "Emotional impact",
  originality: "Originality",
  consistency: "Narrative consistency",
  publication: "Publication readiness",
};

type IssueStat = { objectiveWeighted: number; objectiveCount: number; continuityCount: number; continuityMajor: number; criticalOpen: number; lineCount: number };

/** Language-level scores are measured, not guessed. Story-level scores require an AI reading and are otherwise marked “not assessed”. */
export function languageScores(m: Metrics, s: IssueStat): Pick<Scores, "grammar" | "sentence" | "vocabulary" | "readability"> & { pacingEstimate: ScoreItem; dialogueEstimate: ScoreItem } {
  const per1k = m.words ? (s.objectiveWeighted / m.words) * 1000 : 0;
  const grammar = clamp(100 - per1k * 9);
  let sent = 92;
  sent -= Math.max(0, m.longSentencePct - 8) * 1.2;
  if (m.sentenceCv < 0.4) sent -= (0.4 - m.sentenceCv) * 60;
  if (m.avgSentence > 24) sent -= (m.avgSentence - 24) * 2;
  if (m.avgSentence < 8) sent -= (8 - m.avgSentence) * 3;
  sent -= Math.min(20, ((s.lineCount / Math.max(1, m.words)) * 1000) * 1.5);
  // MATTR (400-word window) for published fiction typically falls between ~0.48 and ~0.62.
  let vocab = 55 + (m.mattr - 0.45) * 230;
  vocab -= Math.max(0, m.fillerPer1k - 8) * 1.5;
  vocab -= Math.max(0, m.adverbsPer1k - 12) * 0.8;
  const fe = m.fleschEase;
  const read = fe >= 60 && fe <= 88 ? 92 - Math.abs(74 - fe) * 0.3 : fe > 88 ? 88 - (fe - 88) * 1.2 : 88 - (60 - fe) * 1.3;
  const dlg = m.dialoguePct;
  const pace = clamp(70 - Math.abs(dlg - 35) * 0.5 - Math.max(0, m.avgParagraph - 120) * 0.15);
  return {
    grammar: { score: grammar, basis: "measured", explanation: `${s.objectiveCount.toLocaleString()} objective mechanical errors were detected (${per1k.toFixed(2)} weighted per 1,000 words). ${grammar >= 90 ? "This is clean copy." : grammar >= 75 ? "A copy-edit pass will resolve most of these." : "Error density is high enough to distract readers and agents."}` },
    sentence: { score: clamp(sent), basis: "measured", explanation: `Average sentence length is ${m.avgSentence} words with ${m.longSentencePct}% over 35 words; sentence-length variety (CV) is ${m.sentenceCv} (${m.sentenceCv >= 0.5 ? "good variety" : m.sentenceCv >= 0.4 ? "adequate variety" : "monotonous rhythm"}). Line-level findings: ${s.lineCount}.` },
    vocabulary: { score: clamp(vocab), basis: "measured", explanation: `Vocabulary richness (moving-average type-token ratio) is ${m.mattr}; filler words (very, really, just, suddenly…) occur ${m.fillerPer1k} times per 1,000 words and -ly adverbs ${m.adverbsPer1k} per 1,000.` },
    readability: { score: clamp(read), basis: "measured", explanation: `Flesch Reading Ease ${fe} (grade level ${m.fkGrade}). Most commercial fiction falls between 60 and 85.` },
    pacingEstimate: { score: pace, basis: "measured", explanation: `Estimated from structure only: ${dlg}% dialogue, ${m.avgParagraph} words per paragraph. A full pacing judgement requires an AI reading of the story.` },
    dialogueEstimate: { score: null, basis: "not_assessed", explanation: `${dlg}% of the text is dialogue. Judging how natural and purposeful the dialogue is requires an AI reading.` },
  };
}

export function overallFrom(scores: Partial<Scores>): ScoreItem {
  const weights: [keyof Scores, number][] = [
    ["plot", 1.4], ["character", 1.4], ["dialogue", 0.9], ["grammar", 1], ["sentence", 1], ["vocabulary", 0.7], ["pacing", 1.1], ["readability", 0.7], ["emotional", 1.1], ["originality", 0.9], ["consistency", 1.1],
  ];
  let tot = 0,
    w = 0;
  const missing: string[] = [];
  for (const [k, wt] of weights) {
    const s = scores[k]?.score;
    if (s == null) missing.push(SCORE_LABELS[k]);
    else {
      tot += s * wt;
      w += wt;
    }
  }
  if (!w) return { score: null, basis: "not_assessed", explanation: "No scores available yet." };
  const score = clamp(tot / w);
  return {
    score,
    basis: missing.length ? "measured" : "combined",
    explanation: missing.length ? `Partial score based on measurable language quality only. Not assessed without an AI reading: ${missing.join(", ")}.` : "Weighted average of all category scores (story elements weighted more heavily than mechanics).",
  };
}
