import { db, now } from "../db";
import { decryptString, sha256 } from "../secure";

/**
 * Configurable AI provider layer.
 *  - builtin:        no AI (rule engine only) — always free.
 *  - ollama:         local models via Ollama — free and unlimited (runs on your machine).
 *  - openai_compat:  any OpenAI-compatible Chat Completions endpoint: LM Studio / llama.cpp / vLLM (free, local),
 *                    or hosted free tiers such as Google Gemini, Groq and OpenRouter ":free" models.
 * New providers only need to implement `chat()`.
 */
export type ProviderKind = "builtin" | "ollama" | "openai_compat";

export type AISettings = {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  contextWords: number; // max words of manuscript text per request
  concurrency: number;
  requestsPerMinute: number; // 0 = unlimited
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const PRESETS: { id: string; name: string; provider: ProviderKind; baseUrl: string; model: string; free: string; needsKey: boolean; contextWords: number; rpm: number; notes: string }[] = [
  { id: "builtin", name: "Built-in engine only (no AI)", provider: "builtin", baseUrl: "", model: "", free: "Free, unlimited, offline", needsKey: false, contextWords: 0, rpm: 0, notes: "Proofreading, copy-edit and line-edit rules, spelling, statistics, continuity of names/ages/eye colours, publication audit. Story analysis, summaries and creative tools need an AI model." },
  { id: "ollama", name: "Ollama (local)", provider: "ollama", baseUrl: "http://localhost:11434", model: "qwen2.5:7b-instruct", free: "Free & unlimited — runs on your computer", needsKey: false, contextWords: 2200, rpm: 0, notes: "Install from ollama.com, then run: ollama pull qwen2.5:7b-instruct (8 GB RAM) or llama3.1:8b / qwen2.5:14b-instruct / gemma2:9b for better quality. Nothing leaves your machine." },
  { id: "lmstudio", name: "LM Studio (local)", provider: "openai_compat", baseUrl: "http://localhost:1234/v1", model: "local-model", free: "Free & unlimited — runs on your computer", needsKey: false, contextWords: 2200, rpm: 0, notes: "Start LM Studio's local server and load an instruct model." },
  { id: "gemini", name: "Google Gemini (free tier)", provider: "openai_compat", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", free: "Free tier with daily/minute rate limits", needsKey: true, contextWords: 6000, rpm: 10, notes: "Create a free key at aistudio.google.com. Free-tier data may be used by Google to improve products — use a local model for confidential manuscripts." },
  { id: "groq", name: "Groq (free tier)", provider: "openai_compat", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", free: "Free tier with rate limits", needsKey: true, contextWords: 3500, rpm: 20, notes: "Create a free key at console.groq.com." },
  { id: "openrouter", name: "OpenRouter (free models)", provider: "openai_compat", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free", free: "Free “:free” models with rate limits", needsKey: true, contextWords: 4000, rpm: 15, notes: "Create a key at openrouter.ai and pick any model ending in “:free”." },
];

export function getAISettings(userId: string): AISettings {
  const row = db().prepare("SELECT * FROM ai_settings WHERE user_id = ?").get(userId) as any;
  if (row)
    return {
      provider: row.provider,
      baseUrl: row.base_url ?? "",
      model: row.model ?? "",
      apiKey: decryptString(row.api_key_enc),
      temperature: row.temperature,
      contextWords: row.context_words,
      concurrency: row.concurrency,
      requestsPerMinute: row.requests_per_minute,
    };
  const p = (process.env.AI_PROVIDER as ProviderKind) || "builtin";
  return {
    provider: ["builtin", "ollama", "openai_compat"].includes(p) ? p : "builtin",
    baseUrl: p === "ollama" ? process.env.OLLAMA_URL || "http://localhost:11434" : process.env.AI_BASE_URL || "",
    model: process.env.AI_MODEL || (p === "ollama" ? "qwen2.5:7b-instruct" : ""),
    apiKey: process.env.AI_API_KEY || "",
    temperature: 0.3,
    contextWords: 2200,
    concurrency: 1,
    requestsPerMinute: 0,
  };
}

export function aiEnabled(s: AISettings) {
  return s.provider !== "builtin" && !!s.model;
}

export class AIError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

const lastCall = new Map<string, number[]>();

async function rateLimit(s: AISettings) {
  if (!s.requestsPerMinute) return;
  const k = s.baseUrl + s.model;
  for (;;) {
    const t = Date.now();
    const arr = (lastCall.get(k) ?? []).filter((x) => t - x < 60_000);
    if (arr.length < s.requestsPerMinute) {
      arr.push(t);
      lastCall.set(k, arr);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (t - arr[0]) + 50));
  }
}

export type ChatOptions = { json?: boolean; temperature?: number; maxTokens?: number; cache?: boolean; signal?: AbortSignal };

/** Sends a chat request. Retries transient failures (timeouts, 429, 5xx) with exponential back-off. */
export async function chat(s: AISettings, messages: ChatMessage[], o: ChatOptions = {}): Promise<string> {
  if (!aiEnabled(s)) throw new AIError("No AI provider is configured. Open Settings → AI Provider to connect a free local model (Ollama) or a free-tier API.");
  const cacheKey = sha256(JSON.stringify([s.provider, s.baseUrl, s.model, o.temperature ?? s.temperature, o.json, messages]));
  if (o.cache !== false) {
    const hit = db().prepare("SELECT response FROM ai_cache WHERE key = ?").get(cacheKey) as { response: string } | undefined;
    if (hit) return hit.response;
  }
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      await rateLimit(s);
      const out = s.provider === "ollama" ? await ollamaChat(s, messages, o) : await openaiChat(s, messages, o);
      if (o.cache !== false) db().prepare("INSERT OR REPLACE INTO ai_cache (key, response, created_at) VALUES (?,?,?)").run(cacheKey, out, now());
      return out;
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError(e instanceof Error ? e.message : String(e), true);
      if (!err.retryable || attempt >= 4 || o.signal?.aborted) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt + Math.random() * 1000));
    }
  }
}

async function post(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal, timeoutMs = 600_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      const retry = res.status === 429 || res.status >= 500;
      let msg = text.slice(0, 400);
      try {
        const j = JSON.parse(text);
        msg = j.error?.message ?? j.error ?? msg;
      } catch {}
      if (res.status === 401 || res.status === 403) throw new AIError(`The AI provider rejected the API key (${res.status}). Check Settings → AI Provider.`);
      if (res.status === 404) throw new AIError(`Model or endpoint not found (${res.status}): ${msg}. For Ollama, run “ollama pull <model>”.`);
      throw new AIError(`AI provider error ${res.status}: ${msg}`, retry);
    }
    return text;
  } catch (e: any) {
    if (e instanceof AIError) throw e;
    if (e?.name === "AbortError") throw new AIError("The AI request timed out.", true);
    const cause = e?.cause?.code ?? e?.message;
    throw new AIError(`Could not reach the AI provider at ${url} (${cause}). Is it running?`, true);
  } finally {
    clearTimeout(timer);
  }
}

async function ollamaChat(s: AISettings, messages: ChatMessage[], o: ChatOptions) {
  const base = (s.baseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const ctxTokens = Math.min(32768, Math.max(8192, Math.round(s.contextWords * 1.4 * 2.2)));
  const text = await post(
    `${base}/api/chat`,
    { model: s.model, messages, stream: false, format: o.json ? "json" : undefined, options: { temperature: o.temperature ?? s.temperature, num_ctx: ctxTokens, num_predict: o.maxTokens ?? 4096 }, keep_alive: "30m" },
    {},
    o.signal,
  );
  const j = JSON.parse(text);
  return String(j.message?.content ?? "");
}

async function openaiChat(s: AISettings, messages: ChatMessage[], o: ChatOptions) {
  const base = s.baseUrl.replace(/\/+$/, "");
  if (!base) throw new AIError("No base URL configured for the OpenAI-compatible provider.");
  const headers: Record<string, string> = {};
  if (s.apiKey) headers.Authorization = `Bearer ${s.apiKey}`;
  if (base.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://cashless-edit.local";
    headers["X-Title"] = "Cashless Edit";
  }
  const body: any = { model: s.model, messages, temperature: o.temperature ?? s.temperature, max_tokens: o.maxTokens ?? 4096 };
  if (o.json) body.response_format = { type: "json_object" };
  let text: string;
  try {
    text = await post(`${base}/chat/completions`, body, headers, o.signal);
  } catch (e) {
    // Some servers reject response_format — retry once without it.
    if (o.json && e instanceof AIError && /response_format|json_object|unsupported/i.test(e.message)) {
      delete body.response_format;
      text = await post(`${base}/chat/completions`, body, headers, o.signal);
    } else throw e;
  }
  const j = JSON.parse(text);
  const c = j.choices?.[0]?.message?.content;
  if (typeof c !== "string") throw new AIError("The AI provider returned an empty response.", true);
  return c;
}

/** Connection test used by the Settings page. */
export async function testConnection(s: AISettings): Promise<{ ok: boolean; message: string; models?: string[] }> {
  if (s.provider === "builtin") return { ok: true, message: "Built-in engine selected — no AI connection needed." };
  let models: string[] | undefined;
  try {
    if (s.provider === "ollama") {
      const base = (s.baseUrl || "http://localhost:11434").replace(/\/+$/, "");
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      models = (j.models ?? []).map((m: any) => m.name);
      if (models && !models.some((m) => m === s.model || m.split(":")[0] === s.model)) return { ok: false, message: `Ollama is running, but the model “${s.model}” is not installed. Run: ollama pull ${s.model}`, models };
    } else {
      try {
        const r = await fetch(`${s.baseUrl.replace(/\/+$/, "")}/models`, { headers: s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}, signal: AbortSignal.timeout(8000) });
        if (r.ok) models = ((await r.json()).data ?? []).map((m: any) => m.id).slice(0, 200);
      } catch {}
    }
    const out = await chat(s, [{ role: "user", content: 'Reply with the JSON object {"ok": true} and nothing else.' }], { json: true, cache: false, maxTokens: 20 });
    return { ok: /ok/i.test(out), message: `Connected to ${s.model}. Response: ${out.slice(0, 80)}`, models };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), models };
  }
}
