import { body, msRoute } from "@/lib/http";
import { db, json } from "@/lib/db";
import * as C from "@/lib/creative";
import { getAISettings, AIError } from "@/lib/ai/provider";
import { HttpError } from "@/lib/auth";

export const maxDuration = 900;

export const GET = msRoute(async (req, _user, ms) => {
  const kind = new URL(req.url).searchParams.get("kind");
  const rows = (kind ? db().prepare("SELECT * FROM creative_items WHERE manuscript_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 50").all(ms.id, kind) : db().prepare("SELECT * FROM creative_items WHERE manuscript_id = ? ORDER BY created_at DESC LIMIT 50").all(ms.id)) as any[];
  return { items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, created_at: r.created_at, input: json(r.input_json, {}), output: json(r.output_json, {}) })) };
});

export const POST = msRoute(async (req, user, ms) => {
  const b = await body(req);
  try {
    switch (b.action) {
      case "continue":
        return await C.helpMeContinue(user.id, ms, b);
      case "whatif":
        return await C.whatIf(user.id, ms, b.question, b.anchorId);
      case "stuck":
        return await C.imStuck(user.id, ms, b.problem, b.anchorId);
      case "plan":
        return await C.planStory(user.id, ms, b.question);
      case "future":
        return await C.futurePlanner(user.id, ms, b);
      case "develop":
        return await C.developScenario(user.id, ms, b);
      case "validate": {
        const s = getAISettings(user.id);
        const { chapterIdx } = C.passageBefore(ms.id, b.anchorId ?? null, 10);
        return await C.validateProposal(s, ms.id, chapterIdx, String(b.text ?? ""), b.characters ?? []);
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  } catch (e) {
    if (e instanceof AIError) throw new HttpError(502, e.message);
    throw e;
  }
});
