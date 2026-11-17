import { body, msRoute } from "@/lib/http";
import { db, json } from "@/lib/db";
import { getAnalysis, getChapters, bibleEntries } from "@/lib/repo";
import { regenerateIntelligence } from "@/lib/pipeline/stages";
import { getAISettings, AIError } from "@/lib/ai/provider";
import { HttpError } from "@/lib/auth";

export const maxDuration = 900;

/** Everything the Story Intelligence dashboard needs in one request. */
export const GET = msRoute(async (_req, _user, ms) => {
  const chapters = getChapters(ms.id).filter((c) => c.kind === "chapter").map((c) => ({ id: c.id, idx: c.idx, title: c.title, number: c.number, wordCount: c.word_count, score: c.score, intel: json(c.intel_json, null) }));
  const chars = bibleEntries(ms.id, "characters").map((b) => ({ id: b.id, name: b.name, summary: b.summary, data: json(b.data_json, {}), refs: json(b.refs_json, []) }));
  const rels = bibleEntries(ms.id, "relationships").map((b) => ({ id: b.id, name: b.name, summary: b.summary, data: json<any>(b.data_json, {}), refs: json(b.refs_json, []) }));
  const builtin = getAnalysis<any>(ms.id, "builtin_intel");
  return {
    summary: getAnalysis(ms.id, "summary"),
    characters: getAnalysis(ms.id, "characters"),
    conflicts: getAnalysis(ms.id, "conflicts"),
    plot: getAnalysis(ms.id, "plot"),
    themes: getAnalysis(ms.id, "themes"),
    setting: getAnalysis(ms.id, "setting"),
    timeline: getAnalysis(ms.id, "timeline"),
    developmental: getAnalysis(ms.id, "developmental"),
    builtin,
    bibleCharacters: chars,
    relationships: rels,
    chapters,
    locations: bibleEntries(ms.id, "locations").map((b) => ({ id: b.id, name: b.name, summary: b.summary, data: json(b.data_json, {}) })),
  };
});

export const POST = msRoute(async (req, user, ms) => {
  const b = await body(req);
  if (!["summary", "characters", "conflicts", "plot", "themes", "setting"].includes(b.kind)) throw new HttpError(400, "Unknown section.");
  try {
    return await regenerateIntelligence(ms, getAISettings(user.id), b.kind);
  } catch (e) {
    if (e instanceof AIError) throw new HttpError(412, e.message);
    throw e;
  }
});
