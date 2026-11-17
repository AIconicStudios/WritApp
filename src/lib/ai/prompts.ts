import { z } from "zod";
import { arr, bool, int, num, optStr, str, strArr } from "./json";

/** Prompts and structured-output schemas for every AI task. Each prompt insists on grounding. */

export const EDITOR_SYSTEM = `You are Cashless Edit, a team of senior professional book editors (developmental editor, line editor, copy editor and proofreader) with decades of publishing experience.
Principles you never break:
1. Ground everything in the manuscript text you are given. Never invent scenes, quotations, characters, motivations or events.
2. Any "quote" field must be copied EXACTLY, character for character, from the provided text (a short span, at most 2 sentences). If you cannot quote it exactly, leave "quote" empty.
3. If a detail is not stated in the text, say "Not established in the manuscript." Do not guess.
4. Do not flag correct writing as an error. Respect deliberate style, dialect in dialogue, sentence fragments used for effect, and intentional ambiguity.
5. Distinguish objective errors (grammar, spelling, punctuation, factual contradiction) from subjective recommendations (style, craft).
6. Be honest and specific. Do not inflate praise. Preserve the author's voice in every suggested revision.
7. Respond with a single valid JSON object only — no markdown, no commentary.`;

export const CREATIVE_SYSTEM = `You are Cashless Edit's creative writing partner: an experienced novelist and story editor who knows this author's whole book.
Rules:
1. Use only established facts from the Story Bible and manuscript excerpts provided. Clearly separate ESTABLISHED FACTS from POSSIBILITIES.
2. Keep characters true to their established personality, history, fears and motivations. Character change must have a believable trigger.
3. Prefer developments that grow from what already exists (unresolved threads, earlier events, secrets) over new characters or random twists.
4. Avoid generic, clichéd or repetitive ideas. Make options meaningfully different from each other.
5. Respect the author's creative ownership: you offer options; the author decides.
6. Respond with a single valid JSON object only.`;

export function numbered(paras: { n: number; text: string }[]) {
  return paras.map((p) => `[P${p.n}] ${p.text}`).join("\n\n");
}

// ---------------------------------------------------------------- Stage 2: story facts per section
export const FactsSchema = z.object({
  summary: str(),
  pov: optStr(),
  tone: optStr(),
  characters: arr(z.object({ name: str(), aliases: strArr().optional(), role: optStr(), description: optStr(), traits: strArr().optional(), wants: optStr(), quote: optStr(), paragraph: int().optional() })),
  locations: arr(z.object({ name: str(), description: optStr(), quote: optStr(), paragraph: int().optional() })),
  events: arr(z.object({ title: str(), description: optStr(), characters: strArr().optional(), when: optStr(), importance: optStr(), quote: optStr(), paragraph: int().optional() })),
  facts: arr(z.object({ subject: str(), attribute: str(), value: str(), quote: optStr(), paragraph: int().optional() })),
  relationships: arr(z.object({ a: str(), b: str(), type: str(), description: optStr(), quote: optStr(), paragraph: int().optional() })),
  objects: arr(z.object({ name: str(), description: optStr(), quote: optStr(), paragraph: int().optional() })),
  rules: arr(z.object({ rule: str(), quote: optStr(), paragraph: int().optional() })),
  conflicts: arr(z.object({ description: str(), type: optStr(), parties: strArr().optional() })),
  themes: strArr(),
  revelations: strArr(),
  unresolved: strArr(),
});
export type Facts = z.infer<typeof FactsSchema>;

export function factsPrompt(title: string, chapterTitle: string, part: string, text: string, known: string) {
  return `Book: "${title}". Section: ${chapterTitle}${part}.
Known story context so far (from earlier chapters):
${known || "(this is the beginning of the book)"}

Read the section below (paragraphs are numbered [P#]) and extract what it ESTABLISHES. Only include what the text states or clearly shows.

Return JSON:
{
 "summary": "4-6 sentence factual summary of what happens",
 "pov": "narrative perspective and tense, e.g. 'third person limited (Mara), past tense'",
 "tone": "emotional atmosphere in a few words",
 "characters": [{"name": "full name as used", "aliases": ["other names used"], "role": "what they do in this section", "description": "physical description only if stated", "traits": ["personality traits shown"], "wants": "goal/motivation if shown", "quote": "exact short quote", "paragraph": 3}],
 "locations": [{"name": "", "description": "", "quote": "", "paragraph": 1}],
 "events": [{"title": "short title", "description": "", "characters": [""], "when": "time marker if stated (e.g. 'three days later', 'June 1999')", "importance": "major|minor", "quote": "", "paragraph": 1}],
 "facts": [{"subject": "character or thing", "attribute": "e.g. age, eye colour, occupation, sibling of, owns, lives in, is dead", "value": "", "quote": "exact quote", "paragraph": 1}],
 "relationships": [{"a": "", "b": "", "type": "family|romantic|friendship|rivalry|enemy|professional|alliance|betrayal|conflict|other", "description": "", "quote": "", "paragraph": 1}],
 "objects": [{"name": "important object", "description": "", "quote": "", "paragraph": 1}],
 "rules": [{"rule": "rule of the world/magic/society established", "quote": "", "paragraph": 1}],
 "conflicts": [{"description": "", "type": "character_vs_character|character_vs_self|character_vs_society|character_vs_nature|character_vs_technology|character_vs_supernatural", "parties": [""]}],
 "themes": ["themes explored"],
 "revelations": ["important reveals"],
 "unresolved": ["questions raised and not answered in this section"]
}

SECTION TEXT:
${text}`;
}

// ---------------------------------------------------------------- Stage 5: line / copy edit per section
export const EditSchema = z.object({
  issues: arr(
    z.object({
      paragraph: int(),
      quote: str(),
      category: str(),
      severity: str(),
      objective: bool(),
      explanation: str(),
      suggestion: optStr(),
      reason: optStr(),
    }),
  ),
});

export function editPrompt(focus: "copy" | "line" | "both", chapterTitle: string, text: string, voice: string, max: number) {
  const copy = "COPY EDITING (objective): grammar errors, wrong tense, subject-verb disagreement, pronoun errors, sentence fragments that are not deliberate, run-on sentences and comma splices, misused words, incorrect prepositions, punctuation errors, capitalization errors.";
  const line = "LINE EDITING (mostly subjective): awkward or confusing sentences, weak or vague expressions, wordiness, unnecessary repetition, unnatural dialogue, weak description, poor transitions, unclear passages, imprecise word choice, excessive adverbs, clichés, telling instead of showing, inconsistent style.";
  return `Edit this section of the chapter "${chapterTitle}". Paragraphs are numbered [P#].
Focus: ${focus === "copy" ? copy : focus === "line" ? line : copy + "\n" + line}
Author's voice to preserve: ${voice}

Report at most ${max} of the MOST important issues. Skip anything that is acceptable published-fiction style. Ignore simple spelling typos (a separate checker handles them).
For each issue:
- "paragraph": the P number
- "quote": the exact original words (copied exactly, the smallest span that contains the problem)
- "category": e.g. "Grammar", "Comma splice", "Awkward sentence", "Wordiness", "Unnatural dialogue", "Telling not showing", "Weak transition", "Word choice", "Clarity"
- "severity": "critical" | "major" | "moderate" | "minor"
- "objective": true for a real error, false for a style recommendation
- "explanation": what the problem is
- "suggestion": the replacement text for the quoted words, in the author's voice
- "reason": why the revision is better

Return JSON: {"issues": [ ... ]}. If the section is clean, return {"issues": []}.

SECTION TEXT:
${text}`;
}

// ---------------------------------------------------------------- Stage 3 & 6: chapter-level developmental analysis
export const ChapterDevSchema = z.object({
  score: num(),
  score_explanation: optStr(),
  summary: optStr(),
  strengths: strArr(),
  observations: arr(z.object({ type: str(), severity: str(), problem: str(), recommendation: str(), quote: optStr(), paragraph: int().optional() })),
  weak_paragraphs: arr(z.object({ paragraph: int(), quote: optStr(), why: str(), suggestion: optStr() })),
  character_issues: strArr(),
  pacing: optStr(),
  connection_to_story: optStr(),
  character_developments: strArr(),
  conflicts_developed: strArr(),
});

export function chapterDevPrompt(bookTitle: string, chapterTitle: string, context: string, text: string) {
  return `Book: "${bookTitle}". Assess the chapter "${chapterTitle}" as a developmental editor.
STORY SO FAR (from the Story Bible and earlier chapter summaries):
${context || "(this is the first chapter)"}

Evaluate: purpose of the chapter, plot development, tension and conflict, pacing, character motivation and consistency, scene necessity, opening and closing hooks, clarity, world-building, dialogue.
Score the chapter 1–100 honestly (60 = competent but unremarkable draft, 75 = solid, 85+ = publishable quality, below 50 = serious problems).

Return JSON:
{
 "score": 0,
 "score_explanation": "why",
 "summary": "3-4 sentence summary",
 "strengths": [""],
 "observations": [{"type": "plot|pacing|character|tension|scene|opening|ending|dialogue|worldbuilding|clarity|continuity", "severity": "critical|major|moderate|minor", "problem": "specific problem", "recommendation": "actionable fix", "quote": "exact quote or empty", "paragraph": 0}],
 "weak_paragraphs": [{"paragraph": 0, "quote": "exact start of the paragraph", "why": "", "suggestion": "how to strengthen it"}],
 "character_issues": ["character inconsistency or weak motivation in this chapter, if any"],
 "pacing": "assessment of pacing",
 "connection_to_story": "how this chapter connects to the overall storyline",
 "character_developments": ["how characters change here"],
 "conflicts_developed": ["conflicts introduced or developed"]
}

CHAPTER TEXT (may be excerpted for length; [P#] numbers are paragraph positions):
${text}`;
}

// ---------------------------------------------------------------- Stage 4: continuity
export const ContinuitySchema = z.object({
  contradictions: arr(
    z.object({
      kind: str(),
      subject: optStr(),
      description: str(),
      first_chapter: int().optional(),
      first_quote: optStr(),
      second_chapter: int().optional(),
      second_quote: optStr(),
      severity: optStr(),
      recommendation: str(),
    }),
  ),
});

export function continuityPrompt(bookTitle: string, factTable: string, timeline: string) {
  return `Book: "${bookTitle}". You are the continuity editor. Below is a table of facts established across the manuscript (chapter number, subject, attribute, value, exact quote), followed by the event timeline.
Find CONTRADICTIONS between chapters: changes in physical description, age, relationships, names, locations, what a character knows, dead characters reappearing, timeline impossibilities, objects in two places, broken world rules.
Classify each as:
- "direct" — the text contradicts itself
- "possible" — may be inconsistent, depends on interpretation or elapsed time
- "intentional_mystery" — looks deliberate (unreliable narrator, foreshadowed twist); mention but do not treat as an error
Only report contradictions supported by the quotes provided. Never invent quotes; copy them from the table.

Return JSON: {"contradictions": [{"kind": "direct|possible|intentional_mystery", "subject": "", "description": "", "first_chapter": 1, "first_quote": "", "second_chapter": 5, "second_quote": "", "severity": "critical|major|moderate|minor", "recommendation": ""}]}

FACTS:
${factTable}

TIMELINE:
${timeline}`;
}

// ---------------------------------------------------------------- Stage 6: manuscript-wide developmental edit & scores
const ScoreObj = z.object({ score: num(), explanation: str() });
export const DevSchema = z.object({
  scores: z.object({
    plot: ScoreObj,
    character: ScoreObj,
    dialogue: ScoreObj,
    pacing: ScoreObj,
    emotional: ScoreObj,
    originality: ScoreObj,
    consistency: ScoreObj,
  }),
  verdict: str(),
  strengths: strArr(),
  major_weaknesses: strArr(),
  minor_weaknesses: strArr(),
  critical_corrections: strArr(),
  recommendations: strArr(),
  opening: optStr(),
  ending: optStr(),
  issues: arr(z.object({ category: str(), severity: str(), chapter: int().optional(), problem: str(), recommendation: str(), objective: bool().optional() })),
});

export function devPrompt(bookTitle: string, genre: string, outline: string, characters: string, dialogueSamples: string, extra: string) {
  return `Book: "${bookTitle}"${genre ? ` (${genre})` : ""}. You have read the whole manuscript; below are its chapter-by-chapter summaries, character database and dialogue samples.
Perform a full DEVELOPMENTAL EDIT of the complete work: plot structure, coherence, weak or confusing storylines, plot holes, character development and motivation, character inconsistencies, unnecessary or missing scenes, pacing, the opening, the ending, predictability, tension and conflict, themes, world-building, narrative problems.
Then score each category 1–100. Calibrate honestly: 50 = significant problems, 65 = competent draft, 75 = strong draft, 85 = publishable, 92+ = exceptional. Never inflate scores to encourage the author.

Return JSON:
{
 "scores": {"plot": {"score": 0, "explanation": ""}, "character": {...}, "dialogue": {...}, "pacing": {...}, "emotional": {...}, "originality": {...}, "consistency": {...}},
 "verdict": "overall editorial verdict, 4-6 sentences",
 "strengths": [""], "major_weaknesses": [""], "minor_weaknesses": [""],
 "critical_corrections": ["must-fix items"], "recommendations": ["prioritised improvements"],
 "opening": "assessment of the opening", "ending": "assessment of the ending",
 "issues": [{"category": "Plot hole|Pacing|Character motivation|Character inconsistency|Unnecessary scene|Missing scene|Weak opening|Unsatisfying ending|Predictability|Tension|Theme|World-building|Subplot|Setup and payoff", "severity": "critical|major|moderate|minor", "chapter": 3, "problem": "specific, referencing events", "recommendation": "actionable fix", "objective": false}]
}

${extra}
CHAPTER SUMMARIES:
${outline}

CHARACTERS:
${characters}

DIALOGUE SAMPLES:
${dialogueSamples}`;
}

// ---------------------------------------------------------------- Book Intelligence
export const SummarySchema = z.object({
  short: str(),
  detailed: str(),
  short_spoiler_free: str(),
  detailed_spoiler_free: str(),
  beginning: str(),
  middle: str(),
  ending: str(),
  central_storyline: str(),
  main_message: str(),
  themes: strArr(),
  underlying_ideas: strArr(),
  emotional_journey: str(),
  central_conflict: str(),
  resolution: str(),
});

export function summaryPrompt(bookTitle: string, outline: string) {
  return `Book: "${bookTitle}". Using ONLY the chapter summaries below (which cover the entire manuscript, in order), write the book's summaries.
Return JSON:
{"short": "100–200 word summary including the ending", "detailed": "500–1000 word summary including the ending, organised by the story's progression",
 "short_spoiler_free": "100–200 words, no ending or twists revealed", "detailed_spoiler_free": "300–600 words, no ending or twists",
 "beginning": "analysis of the beginning", "middle": "analysis of the middle", "ending": "analysis of the ending",
 "central_storyline": "", "main_message": "", "themes": [""], "underlying_ideas": [""], "emotional_journey": "", "central_conflict": "", "resolution": "how (or whether) it is resolved"}

CHAPTER SUMMARIES:
${outline}`;
}

export const CharactersSchema = z.object({
  characters: arr(
    z.object({
      name: str(),
      role: str(),
      classification: str(),
      physical: str(),
      personality: str(),
      background: str(),
      motivations: str(),
      goals: str(),
      fears: str(),
      strengths: str(),
      internal_struggles: str(),
      external_struggles: str(),
      relationships: arr(z.object({ with: str(), type: str(), description: optStr() })),
      development: str(),
      change: str(),
      plot_contribution: str(),
      fate: str(),
      flags: strArr(),
    }),
  ),
  ensemble_notes: strArr(),
});

export function charactersPrompt(bookTitle: string, dossiers: string, outline: string) {
  return `Book: "${bookTitle}". Build detailed character profiles from the evidence below (facts extracted from the manuscript with chapter references) and the chapter summaries.
For any field the manuscript does not establish, write exactly "Not established in the manuscript." Do not invent details.
"classification" is "main" or "supporting" or "minor". "flags" lists editorial problems such as "introduced but forgotten", "underdeveloped", "inconsistent", "unnecessary", "motivation unclear", "sudden personality change" — only when the evidence supports it.
Return JSON: {"characters": [{"name": "", "role": "", "classification": "", "physical": "", "personality": "", "background": "", "motivations": "", "goals": "", "fears": "", "strengths": "", "internal_struggles": "", "external_struggles": "", "relationships": [{"with": "", "type": "family|romantic|friendship|rivalry|enemy|professional|alliance|betrayal|conflict", "description": ""}], "development": "", "change": "how they change across the story", "plot_contribution": "", "fate": "their ending", "flags": []}], "ensemble_notes": ["observations about the cast as a whole"]}

CHARACTER EVIDENCE:
${dossiers}

CHAPTER SUMMARIES:
${outline}`;
}

export const ConflictsSchema = z.object({
  conflicts: arr(
    z.object({
      title: str(),
      type: str(),
      central: bool(),
      involved: strArr(),
      cause: str(),
      wants: str(),
      stakes: str(),
      development: str(),
      turning_points: strArr(),
      resolution: str(),
      convincing: str(),
      strengthen: str(),
      chapters: arr(int()),
    }),
  ),
});
export function conflictsPrompt(bookTitle: string, outline: string, conflicts: string) {
  return `Book: "${bookTitle}". Identify and analyse every major conflict across the whole book, using the chapter summaries and the conflict notes extracted chapter by chapter.
Types: "Character vs Character", "Character vs Self", "Character vs Society", "Character vs Nature", "Character vs Technology", "Character vs Supernatural". Mark exactly one (or rarely two) as "central": true.
If a conflict is not resolved, say so in "resolution" and explain the effect.
Return JSON: {"conflicts": [{"title": "", "type": "", "central": true, "involved": [""], "cause": "", "wants": "what each side wants", "stakes": "", "development": "", "turning_points": [""], "resolution": "", "convincing": "does the resolution feel convincing, and why", "strengthen": "what would make it stronger", "chapters": [1,2]}]}

CONFLICT NOTES:
${conflicts}

CHAPTER SUMMARIES:
${outline}`;
}

export const PlotSchema = z.object({
  structure_note: str(),
  stages: arr(z.object({ stage: str(), chapters: arr(int()), description: str() })),
  twists: strArr(),
  subplots: arr(z.object({ name: str(), description: str(), chapters: arr(int()), connected_to_main: str(), resolved: str() })),
  arcs: arr(z.object({ name: str(), description: str() })),
  unresolved: strArr(),
  foreshadowing: strArr(),
  suspense: strArr(),
  reveals: strArr(),
  plot_holes: strArr(),
  weak_coincidences: strArr(),
});
export function plotPrompt(bookTitle: string, outline: string) {
  return `Book: "${bookTitle}". Analyse the plot of the whole book from the chapter summaries.
Map it onto narrative stages: Exposition, Inciting incident, Rising action, First major turning point, Midpoint, Crisis, Climax, Falling action, Resolution. If the book does not follow this structure, adapt the stages to its real structure and explain in "structure_note" — never force it. If a stage is missing, say so in its description.
Return JSON: {"structure_note": "", "stages": [{"stage": "", "chapters": [1], "description": ""}], "twists": [""], "subplots": [{"name": "", "description": "", "chapters": [1], "connected_to_main": "how it connects (or that it does not)", "resolved": "yes/no and how"}], "arcs": [{"name": "story or character arc", "description": ""}], "unresolved": ["unresolved storylines"], "foreshadowing": [""], "suspense": [""], "reveals": [""], "plot_holes": [""], "weak_coincidences": [""]}

CHAPTER SUMMARIES:
${outline}`;
}

export const ThemesSchema = z.object({
  main: arr(z.object({ theme: str(), how: str(), chapters: arr(int()) })),
  secondary: arr(z.object({ theme: str(), how: str() })),
  recurring_ideas: strArr(),
  symbols: arr(z.object({ symbol: str(), meaning: str(), chapters: arr(int()) })),
  metaphors: strArr(),
  motifs: strArr(),
  cultural_references: strArr(),
  moral_questions: strArr(),
  philosophical_questions: strArr(),
  social_commentary: strArr(),
  underdeveloped: strArr(),
});
export function themesPrompt(bookTitle: string, outline: string, themeNotes: string) {
  return `Book: "${bookTitle}". Analyse themes and symbolism across the whole book. Explain how each element contributes to the story. List themes that are introduced but not sufficiently developed in "underdeveloped".
Return JSON: {"main": [{"theme": "", "how": "", "chapters": [1]}], "secondary": [{"theme": "", "how": ""}], "recurring_ideas": [""], "symbols": [{"symbol": "", "meaning": "", "chapters": [1]}], "metaphors": [""], "motifs": [""], "cultural_references": [""], "moral_questions": [""], "philosophical_questions": [""], "social_commentary": [""], "underdeveloped": [""]}

THEME NOTES PER CHAPTER:
${themeNotes}

CHAPTER SUMMARIES:
${outline}`;
}

export const SettingSchema = z.object({
  locations: arr(z.object({ name: str(), significance: str(), chapters: arr(int()) })),
  time_period: str(),
  historical_context: str(),
  social_environment: str(),
  cultural_environment: str(),
  world_rules: strArr(),
  influence: str(),
  inconsistencies: strArr(),
});
export function settingPrompt(bookTitle: string, outline: string, locations: string, rules: string) {
  return `Book: "${bookTitle}". Analyse the setting and world. Use "Not established in the manuscript." when something is not stated. Flag inconsistencies in geography, time and world-building only if supported by the notes.
Return JSON: {"locations": [{"name": "", "significance": "", "chapters": [1]}], "time_period": "", "historical_context": "", "social_environment": "", "cultural_environment": "", "world_rules": [""], "influence": "how the setting shapes characters and conflicts", "inconsistencies": [""]}

LOCATIONS (extracted):
${locations}

WORLD RULES (extracted):
${rules}

CHAPTER SUMMARIES:
${outline}`;
}

// ---------------------------------------------------------------- Creative companion
export const ScenariosSchema = z.object({
  situation: z.object({ so_far: str(), current_scene: str(), characters_present: strArr(), character_wants: strArr(), atmosphere: str(), conflicts: strArr(), unresolved: strArr(), direction: str() }),
  scenarios: arr(
    z.object({
      title: str(),
      direction_type: str(),
      description: str(),
      characters: strArr(),
      motivation: str(),
      conflict: str(),
      emotional_impact: str(),
      plot_advance: str(),
      consequences: str(),
      continuity_risks: strArr(),
      why_it_fits: str(),
    }),
  ),
});
export function scenariosPrompt(bookTitle: string, context: string, passage: string, request: string, count: number) {
  return `Book: "${bookTitle}". The author wants help continuing the story from the point marked below.
First analyse the situation, then propose ${count} meaningfully DIFFERENT continuation scenarios (different directions — e.g. a complication, deepening an existing conflict, revealing a secret, developing a relationship, a consequence of an earlier event, an internal struggle, a twist — not variations of one idea).
Every character action must fit that character's established personality and motivation (or show a believable reason for change).
${request ? `Author's note: ${request}` : ""}

Return JSON:
{"situation": {"so_far": "what has happened so far", "current_scene": "", "characters_present": [""], "character_wants": ["Name: what they want right now"], "atmosphere": "", "conflicts": ["existing conflicts in play"], "unresolved": ["unresolved plotlines relevant here"], "direction": "the established narrative direction"},
 "scenarios": [{"title": "", "direction_type": "", "description": "what happens next", "characters": [""], "motivation": "why the characters act this way, grounded in established traits", "conflict": "tension introduced", "emotional_impact": "", "plot_advance": "how it advances the plot", "consequences": "possible consequences for later chapters", "continuity_risks": ["risks of contradicting established facts"], "why_it_fits": "why this grows naturally from the book"}]}

STORY BIBLE & CONTEXT:
${context}

PASSAGE WHERE THE STORY CONTINUES (the last paragraphs before the continuation point):
${passage}`;
}

export const ValidationSchema = z.object({
  flags: arr(z.object({ kind: str(), area: str(), description: str(), established_fact: optStr(), chapter: int().optional() })),
  verdict: str(),
});
export function validatePrompt(context: string, proposal: string) {
  return `You are a strict continuity checker. Check the PROPOSAL against the ESTABLISHED story facts.
Check: character locations, relationships, motivations, what each character knows, chronology, previous events, important objects and where they are, world rules, unresolved conflicts, previous decisions, narrative perspective, earlier promises/secrets/revelations, and whether any character involved is dead or absent.
Classify each flag "kind" as: "direct_contradiction" | "possible_inconsistency" | "intentional_mystery" | "requires_revision" (would need earlier chapters to be revised).
Only flag real problems supported by the established facts. If there are none, return an empty list.
Return JSON: {"flags": [{"kind": "", "area": "e.g. character knowledge", "description": "", "established_fact": "the fact it conflicts with", "chapter": 0}], "verdict": "consistent | minor risks | conflicts with the manuscript"}

ESTABLISHED FACTS:
${context}

PROPOSAL:
${proposal}`;
}

export const WhatIfSchema = z.object({
  premise: str(),
  established_facts_involved: strArr(),
  plausibility: str(),
  effects: z.object({ relationships: str(), conflicts: str(), plot: str(), timeline: str(), future_chapters: str(), ending: str() }),
  required_changes: strArr(),
  opportunities: strArr(),
  risks: strArr(),
  ways_to_make_it_work: strArr(),
});
export function whatIfPrompt(bookTitle: string, context: string, question: string) {
  return `Book: "${bookTitle}". The author asks a hypothetical "What if?" question. Explore its consequences honestly. This is HYPOTHETICAL — clearly separate the established facts you rely on from speculation.
Question: ${question}

Return JSON: {"premise": "restate the hypothetical", "established_facts_involved": ["facts from the book this touches"], "plausibility": "how believable it is given established characters, and what setup it would need", "effects": {"relationships": "", "conflicts": "", "plot": "", "timeline": "", "future_chapters": "", "ending": ""}, "required_changes": ["earlier chapters/passages that would need revising"], "opportunities": [""], "risks": [""], "ways_to_make_it_work": [""]}

STORY BIBLE & CONTEXT:
${context}`;
}

export const StuckSchema = z.object({
  understanding: str(),
  relevant_context: strArr(),
  solutions: arr(z.object({ title: str(), approach: str(), how_it_uses_the_story: str(), example: str(), pros: str(), cons: str() })),
  craft_tips: strArr(),
});
export function stuckPrompt(bookTitle: string, context: string, problem: string, passage: string) {
  return `Book: "${bookTitle}". The author is stuck and describes the problem in their own words:
"${problem}"
Understand the real craft problem, look at the relevant story context, and give 4–6 practical, specific solutions that use this book's established characters, threads and setting (no generic advice).
Return JSON: {"understanding": "what the author is actually struggling with", "relevant_context": ["story facts that matter"], "solutions": [{"title": "", "approach": "", "how_it_uses_the_story": "", "example": "a brief example of how it could play out (1-3 sentences)", "pros": "", "cons": ""}], "craft_tips": [""]}

STORY BIBLE & CONTEXT:
${context}
${passage ? `\nCURRENT PASSAGE:\n${passage}` : ""}`;
}

export const PlanSchema = z.object({
  answer: str(),
  options: arr(z.object({ title: str(), description: str(), builds_on: str(), structural_role: str() })),
  threads_to_address: strArr(),
  cautions: strArr(),
});
export function planPrompt(bookTitle: string, context: string, structure: string, question: string) {
  return `Book: "${bookTitle}". The author asks a long-term story-planning question:
"${question}"
Consider the manuscript's overall structure (where we are in the arc), unresolved threads and character arcs — not just the next scene.
Return JSON: {"answer": "direct answer with reasoning", "options": [{"title": "", "description": "", "builds_on": "established elements it grows from", "structural_role": "what it does for the book's structure"}], "threads_to_address": ["unresolved storylines worth addressing"], "cautions": [""]}

STRUCTURE SO FAR:
${structure}

STORY BIBLE & CONTEXT:
${context}`;
}

export const FuturePlanSchema = z.object({
  overview: str(),
  chapters: arr(
    z.object({ number: int(), working_title: str(), purpose: str(), events: strArr(), character_developments: strArr(), conflicts: strArr(), revelations: strArr(), turning_point: optStr(), threads_advanced: strArr() }),
  ),
  arcs: arr(z.object({ character: str(), trajectory: str() })),
  flexibility_notes: strArr(),
});
export function futurePlanPrompt(bookTitle: string, context: string, outline: string, from: number, count: number, direction: string) {
  return `Book: "${bookTitle}". The author has written up to chapter ${from - 1}. Suggest a POSSIBLE, flexible structure for chapters ${from}–${from + count - 1}: character developments, conflicts, revelations and turning points that grow from what is established. This is a plan to inspire, not a rigid outline.
${direction ? `Author's direction: ${direction}` : ""}
Return JSON: {"overview": "the shape of this stretch of the book", "chapters": [{"number": ${from}, "working_title": "", "purpose": "", "events": [""], "character_developments": [""], "conflicts": [""], "revelations": [""], "turning_point": "", "threads_advanced": [""]}], "arcs": [{"character": "", "trajectory": ""}], "flexibility_notes": ["where the author could diverge and alternatives"]}

CHAPTER SUMMARIES SO FAR:
${outline}

STORY BIBLE:
${context}`;
}

export const DevelopSchema = z.object({ title: str(), content: str(), notes: strArr() });
export function developPrompt(bookTitle: string, context: string, passage: string, scenario: string, format: string, opts: { words: number; tone?: string; pacing?: string; pov?: string; style?: string; direction?: string }, voiceSample: string) {
  const formats: Record<string, string> = {
    outline: "a detailed scene-by-scene outline (bulleted beats)",
    paragraphs: "the next few paragraphs of prose",
    scene: "a complete scene in prose",
    chapter: "a complete chapter in prose, with scene breaks marked * * *",
    dialogue: "a dialogue-driven exchange in prose (with action beats)",
    confrontation: "an emotional confrontation scene in prose",
    redirect: "a rewrite of the scenario in a different direction (describe the new direction, then write the opening paragraphs)",
  };
  return `Book: "${bookTitle}". Write ${formats[format] ?? formats.paragraphs} developing the chosen scenario, approximately ${opts.words} words.
${opts.tone ? `Tone: ${opts.tone}. ` : ""}${opts.pacing ? `Pacing: ${opts.pacing}. ` : ""}${opts.pov ? `Narrative perspective: ${opts.pov}. ` : ""}${opts.style ? `Style: ${opts.style}. ` : ""}${opts.direction ? `Author's direction: ${opts.direction}` : ""}
Match the author's established voice (sentence rhythm, vocabulary, dialogue punctuation, tense and POV) as closely as possible — see the voice sample. Keep every character consistent with the Story Bible. Do not resolve threads the scenario does not call for.
Return JSON: {"title": "short title", "content": "the text (use \\n\\n between paragraphs)", "notes": ["new facts this text would establish, and any continuity notes"]}

SCENARIO:
${scenario}

STORY BIBLE & CONTEXT:
${context}

VOICE SAMPLE (author's own prose):
${voiceSample}

THE TEXT CONTINUES FROM:
${passage}`;
}

export const NewFactsSchema = z.object({
  characters: arr(z.object({ name: str(), update: str() })),
  relationships: arr(z.object({ a: str(), b: str(), type: str(), description: str() })),
  events: arr(z.object({ title: str(), description: str() })),
  facts: arr(z.object({ subject: str(), attribute: str(), value: str() })),
  conflicts: arr(z.object({ description: str(), status: str() })),
  locations: arr(z.object({ name: str(), description: str() })),
});
export function newFactsPrompt(text: string) {
  return `Extract the NEW story facts established by this newly added passage: character developments, relationship changes, events, facts (subject/attribute/value), conflict status changes (introduced / escalated / resolved), and new locations. Only what the passage states.
Return JSON: {"characters": [{"name": "", "update": ""}], "relationships": [{"a": "", "b": "", "type": "", "description": ""}], "events": [{"title": "", "description": ""}], "facts": [{"subject": "", "attribute": "", "value": ""}], "conflicts": [{"description": "", "status": ""}], "locations": [{"name": "", "description": ""}]}

PASSAGE:
${text}`;
}

export const RewriteSchema = z.object({ revised: str(), explanation: str(), changes: strArr() });
export const REWRITE_ACTIONS: Record<string, string> = {
  improve: "Improve the writing overall",
  professional: "Make it more polished and professional",
  engaging: "Make it more engaging and vivid",
  emotional: "Deepen the emotional resonance",
  dialogue: "Strengthen the dialogue (more natural, more subtext, distinct voices)",
  description: "Improve the descriptions (specific, sensory, purposeful)",
  concise: "Remove unnecessary words; tighten",
  readability: "Improve readability and clarity",
  natural: "Make the writing sound more natural",
  flow: "Improve narrative flow and transitions",
  voice: "Lightly polish while strictly preserving the author's original voice",
};
export function rewritePrompt(action: string, text: string, context: string, voiceSample: string, instructions: string) {
  return `Rewrite the passage below. Goal: ${REWRITE_ACTIONS[action] ?? action}.
${instructions ? `Author's instructions: ${instructions}\n` : ""}Preserve the author's voice, point of view, tense, character names, facts and meaning. Do not add new plot events. Keep roughly the same length unless the goal is tightening.
Return JSON: {"revised": "the rewritten passage (\\n\\n between paragraphs)", "explanation": "what you changed and why", "changes": ["specific change 1", "specific change 2"]}

CONTEXT (surrounding text, do not rewrite):
${context}

VOICE SAMPLE:
${voiceSample}

PASSAGE TO REWRITE:
${text}`;
}

export const PubAISchema = z.object({ notes: strArr(), blurb_readiness: str(), synopsis_readiness: str() });
