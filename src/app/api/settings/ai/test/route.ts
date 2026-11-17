import { body, route } from "@/lib/http";
import { getAISettings, testConnection } from "@/lib/ai/provider";

export const POST = route(async (req, user) => {
  const b = await body(req);
  const cur = getAISettings(user.id);
  const s = { ...cur, ...b, apiKey: b.apiKey ? b.apiKey : cur.apiKey };
  return testConnection(s);
});
