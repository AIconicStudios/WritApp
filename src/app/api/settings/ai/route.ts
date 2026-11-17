import { body, route } from "@/lib/http";
import { db, now } from "@/lib/db";
import { getAISettings, PRESETS } from "@/lib/ai/provider";
import { encryptString } from "@/lib/secure";
import { HttpError } from "@/lib/auth";

export const GET = route(async (_req, user) => {
  const s = getAISettings(user.id);
  return { settings: { ...s, apiKey: undefined, hasKey: !!s.apiKey }, presets: PRESETS };
});

export const PUT = route(async (req, user) => {
  const b = await body(req);
  if (!["builtin", "ollama", "openai_compat"].includes(b.provider)) throw new HttpError(400, "Unknown provider.");
  if (b.baseUrl && !/^https?:\/\/[^\s]+$/i.test(b.baseUrl)) throw new HttpError(400, "Base URL must start with http:// or https://");
  const cur = getAISettings(user.id);
  const key = b.apiKey === undefined || b.apiKey === null ? (cur.apiKey ? encryptString(cur.apiKey) : null) : b.apiKey === "" ? null : encryptString(String(b.apiKey));
  db().prepare(`INSERT INTO ai_settings (user_id, provider, base_url, model, api_key_enc, temperature, context_words, concurrency, requests_per_minute, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider, base_url=excluded.base_url, model=excluded.model, api_key_enc=excluded.api_key_enc, temperature=excluded.temperature, context_words=excluded.context_words, concurrency=excluded.concurrency, requests_per_minute=excluded.requests_per_minute, updated_at=excluded.updated_at`).run(
    user.id, b.provider, b.baseUrl ?? "", b.model ?? "", key, clamp(+b.temperature || 0.3, 0, 1.5), Math.round(clamp(+b.contextWords || 2200, 600, 20000)), Math.round(clamp(+b.concurrency || 1, 1, 4)), Math.round(clamp(+b.requestsPerMinute || 0, 0, 1000)), now());
  return { ok: true };
});

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
