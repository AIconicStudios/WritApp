/**
 * TEST-ONLY mock of an OpenAI-compatible AI server (no real intelligence).
 * It lets the automated tests exercise every AI stage of Cashless Edit — structured JSON parsing,
 * grounding / quote verification, Story Bible merging, creative tools — without downloading a model.
 * Responses are assembled from the text in the prompt, and each edit response also contains one
 * deliberately FAKE quotation so the tests can confirm that ungrounded AI output is discarded.
 *
 *   npx tsx scripts/mock-ai-server.ts      (listens on http://127.0.0.1:8787/v1)
 */
import http from "node:http";

function paragraphs(prompt: string) {
  return [...prompt.matchAll(/\[P(\d+)\] ([^\n]+)/g)].map((m) => ({ n: +m[1], text: m[2] }));
}
function sentencesOf(t: string) {
  return t.match(/[^.!?]+[.!?]+["”’]?/g)?.map((s) => s.trim()) ?? [];
}
function names(prompt: string) {
  const counts = new Map<string, number>();
  for (const m of prompt.matchAll(/(?<![.!?]\s)\b([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?)\b/g)) {
    if (/^(The|This|That|When|What|Then|There|They|She|Her|His|And|But|Chapter|Book|Return|Known|Story|Section|Characters|Read|Only|SECTION|Paragraphs)$/.test(m[1].split(" ")[0])) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6);
}

function respond(prompt: string): unknown {
  const ps = paragraphs(prompt);
  const ns = names(prompt);
  const firstSentence = ps.map((p) => sentencesOf(p.text)[0]).find(Boolean) ?? "";
  if (/\{"ok": true\}/.test(prompt)) return { ok: true };
  if (/extract what it ESTABLISHES/.test(prompt)) {
    const p = ps[0];
    return {
      summary: `In this section ${ns.slice(0, 2).join(" and ") || "the characters"} face developments. ${sentencesOf(p?.text ?? "")[0] ?? ""}`,
      pov: "third person limited, past tense",
      tone: "tense, atmospheric",
      characters: ns.slice(0, 4).map((n) => ({ name: n, role: "appears in this section", traits: ["determined"], quote: n, paragraph: ps.find((x) => x.text.includes(n))?.n ?? 1 })),
      locations: [],
      events: p ? [{ title: "Key moment", description: sentencesOf(p.text)[0], characters: ns.slice(0, 1), importance: "major", quote: sentencesOf(p.text)[0], paragraph: p.n }] : [],
      facts: [{ subject: ns[0] ?? "Someone", attribute: "invented attribute", value: "x", quote: "This sentence does not exist anywhere in the manuscript.", paragraph: 1 }],
      relationships: ns.length >= 2 ? [{ a: ns[0], b: ns[1], type: "family", description: "related", quote: "", paragraph: 1 }] : [],
      objects: [],
      rules: [],
      conflicts: [{ description: "A central tension develops", type: "character_vs_self", parties: ns.slice(0, 1) }],
      themes: ["truth", "duty"],
      revelations: [],
      unresolved: ["What happens next?"],
    };
  }
  if (/Report at most/.test(prompt)) {
    const p = ps.find((x) => sentencesOf(x.text).length > 1) ?? ps[0];
    const s = p ? sentencesOf(p.text)[0] : "";
    const words = s.split(" ");
    const quote = words.slice(0, Math.min(6, words.length)).join(" ");
    return {
      issues: [
        p && { paragraph: p.n, quote, category: "Awkward sentence", severity: "minor", objective: false, explanation: "The opening of this sentence could be smoother.", suggestion: quote, reason: "Flow." }, // no-op suggestion → must be skipped
        p && { paragraph: p.n, quote, category: "Word choice", severity: "moderate", objective: false, explanation: "Consider a more vivid opening.", suggestion: quote.replace(/^\w+/, (w) => w.toUpperCase()), reason: "Emphasis." },
        { paragraph: 1, quote: "The quick brown fox jumps over the lazy dog in Saltmere", category: "Grammar", severity: "major", objective: true, explanation: "FAKE — this quote is not in the text and must be discarded.", suggestion: "x", reason: "x" },
      ].filter(Boolean),
    };
  }
  if (/Assess the chapter/.test(prompt)) return { score: 72, score_explanation: "Solid but uneven.", summary: "A chapter summary.", strengths: ["Atmosphere"], observations: [{ type: "pacing", severity: "moderate", problem: "The middle slows down.", recommendation: "Trim the exposition.", quote: firstSentence.split(" ").slice(0, 5).join(" "), paragraph: ps[0]?.n ?? 1 }], weak_paragraphs: [], character_issues: [], pacing: "Even", connection_to_story: "Sets up the mystery.", character_developments: [], conflicts_developed: [] };
  if (/continuity editor/.test(prompt)) {
    const q = [...prompt.matchAll(/\| "([^"]+)"/g)].map((m) => m[1]);
    return { contradictions: q.length >= 2 ? [{ kind: "possible", subject: "test", description: "Two facts may disagree.", first_chapter: 0, first_quote: q[0], second_chapter: 1, second_quote: q[1], severity: "moderate", recommendation: "Check them." }, { kind: "direct", description: "Invented contradiction.", first_quote: "Nothing like this appears.", second_quote: "Nor this.", recommendation: "-" }] : [] };
  }
  if (/full DEVELOPMENTAL EDIT/.test(prompt)) {
    const sc = (n: number) => ({ score: n, explanation: "Mock assessment." });
    return { scores: { plot: sc(70), character: sc(74), dialogue: sc(68), pacing: sc(66), emotional: sc(72), originality: sc(64), consistency: sc(70) }, verdict: "A promising draft with a strong premise.", strengths: ["Premise"], major_weaknesses: ["Pacing in the middle"], minor_weaknesses: [], critical_corrections: [], recommendations: ["Tighten the middle."], opening: "Strong.", ending: "Satisfying.", issues: [{ category: "Pacing", severity: "moderate", chapter: 2, problem: "Middle chapters sag.", recommendation: "Cut repetition." }] };
  }
  if (/write the book's summaries/.test(prompt)) return { short: "Short summary.", detailed: "Detailed summary.", short_spoiler_free: "Spoiler-free short.", detailed_spoiler_free: "Spoiler-free detailed.", beginning: "b", middle: "m", ending: "e", central_storyline: "c", main_message: "m", themes: ["truth"], underlying_ideas: ["i"], emotional_journey: "j", central_conflict: "c", resolution: "r" };
  if (/Build detailed character profiles/.test(prompt)) {
    const n = [...prompt.matchAll(/^## ([^\n(]+)/gm)].map((m) => m[1].trim()).slice(0, 3);
    return { characters: n.map((name) => ({ name, role: "role", classification: "main", physical: "Not established in the manuscript.", personality: "p", background: "b", motivations: "m", goals: "g", fears: "f", strengths: "s", internal_struggles: "i", external_struggles: "e", relationships: [], development: "d", change: "Grows more confident over the course of the story.", plot_contribution: "c", fate: "f", flags: [] })), ensemble_notes: [] };
  }
  if (/Identify and analyse every major conflict/.test(prompt)) return { conflicts: [{ title: "The secret", type: "Character vs Character", central: true, involved: ns.slice(0, 2), cause: "c", wants: "w", stakes: "s", development: "d", turning_points: ["t"], resolution: "r", convincing: "yes", strengthen: "s", chapters: [1, 2] }] };
  if (/Analyse the plot/.test(prompt)) return { structure_note: "Classic structure.", stages: [{ stage: "Exposition", chapters: [1], description: "d" }], twists: [], subplots: [], arcs: [{ name: "Main arc", description: "d" }], unresolved: ["Who kept the light lit?"], foreshadowing: [], suspense: [], reveals: [], plot_holes: [], weak_coincidences: [] };
  if (/Analyse themes/.test(prompt)) return { main: [{ theme: "Truth", how: "h", chapters: [1] }], secondary: [], recurring_ideas: [], symbols: [], metaphors: [], motifs: [], cultural_references: [], moral_questions: [], philosophical_questions: [], social_commentary: [], underdeveloped: [] };
  if (/Analyse the setting/.test(prompt)) return { locations: [], time_period: "Not established in the manuscript.", historical_context: "", social_environment: "", cultural_environment: "", world_rules: [], influence: "", inconsistencies: [] };
  if (/help continuing the story/.test(prompt)) return { situation: { so_far: "s", current_scene: "c", characters_present: ns.slice(0, 2), character_wants: [], atmosphere: "a", conflicts: [], unresolved: [], direction: "d" }, scenarios: [1, 2, 3, 4, 5].map((i) => ({ title: `Scenario ${i}`, direction_type: "complication", description: `${ns[0] ?? "The hero"} faces option ${i}.`, characters: ns.slice(0, 2), motivation: "m", conflict: "c", emotional_impact: "e", plot_advance: "p", consequences: "c", continuity_risks: [], why_it_fits: "w" })) };
  if (/strict continuity checker/.test(prompt)) return { flags: [], verdict: "consistent" };
  if (/hypothetical "What if\?"/.test(prompt)) return { premise: "p", established_facts_involved: [], plausibility: "p", effects: { relationships: "r", conflicts: "c", plot: "p", timeline: "t", future_chapters: "f", ending: "e" }, required_changes: [], opportunities: [], risks: [], ways_to_make_it_work: [] };
  if (/The author is stuck/.test(prompt)) return { understanding: "u", relevant_context: [], solutions: [{ title: "t", approach: "a", how_it_uses_the_story: "h", example: "e", pros: "p", cons: "c" }], craft_tips: [] };
  if (/long-term story-planning/.test(prompt)) return { answer: "a", options: [], threads_to_address: [], cautions: [] };
  if (/POSSIBLE, flexible structure/.test(prompt)) return { overview: "o", chapters: [{ number: 11, working_title: "w", purpose: "p", events: [], character_developments: [], conflicts: [], revelations: [], turning_point: "", threads_advanced: [] }], arcs: [], flexibility_notes: [] };
  if (/developing the chosen scenario/.test(prompt)) return { title: "New scene", content: `${ns[0] ?? "She"} stood at the window and watched the water.\n\nThe light turned, and turned again.`, notes: ["New fact: the window faces the sea."] };
  if (/Extract the NEW story facts/.test(prompt)) return { characters: [{ name: ns[0] ?? "Mara", update: "watched the water" }], relationships: [], events: [{ title: "Watching the light", description: "d" }], facts: [{ subject: ns[0] ?? "Mara", attribute: "location", value: "at the window" }], conflicts: [], locations: [] };
  if (/Rewrite the passage below/.test(prompt)) {
    const t = prompt.split("PASSAGE TO REWRITE:\n")[1] ?? "";
    return { revised: t.trim().replace(/\bvery\b/g, "truly"), explanation: "Tightened wording.", changes: ["Replaced weak intensifiers"] };
  }
  return { error: "unrecognised prompt" };
}

export function startMock(port = 8787) {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url?.endsWith("/models")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "mock-editor" }] }));
      }
      try {
        const j = JSON.parse(body || "{}");
        const prompt = (j.messages ?? []).map((m: any) => m.content).join("\n\n");
        const content = JSON.stringify(respond(prompt));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
      } catch (e) {
        res.writeHead(400);
        res.end(String(e));
      }
    });
  });
  return new Promise<http.Server>((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

if (require.main === module) startMock().then(() => console.log("Mock AI server on http://127.0.0.1:8787/v1 (TEST ONLY)"));
