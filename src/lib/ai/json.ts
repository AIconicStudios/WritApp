import { z } from "zod";
import { chat, type AISettings, type ChatMessage, AIError } from "./provider";

/** Extracts the first JSON object/array from a model response and repairs common formatting slips. */
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error("No JSON found in the AI response.");
  s = s.slice(start);
  // Find the matching closing bracket.
  let depth = 0,
    inStr = false,
    esc = false,
    end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  let body = end > 0 ? s.slice(0, end + 1) : s;
  try {
    return JSON.parse(body);
  } catch {
    body = body.replace(/,\s*([}\]])/g, "$1").replace(/[\u0000-\u001f]+/g, " ");
    if (end < 0) {
      // Truncated output: close open brackets.
      const stack: string[] = [];
      let str = false,
        e2 = false;
      for (const c of body) {
        if (str) {
          if (e2) e2 = false;
          else if (c === "\\") e2 = true;
          else if (c === '"') str = false;
          continue;
        }
        if (c === '"') str = true;
        else if (c === "{") stack.push("}");
        else if (c === "[") stack.push("]");
        else if (c === "}" || c === "]") stack.pop();
      }
      if (str) body += '"';
      body = body.replace(/,\s*$/, "") + stack.reverse().join("");
    }
    return JSON.parse(body);
  }
}

/**
 * Structured output: asks for JSON, validates it against a zod schema, and re-asks once with the
 * validation error if the model's output was malformed.
 */
export async function chatJson<T extends z.ZodTypeAny>(s: AISettings, messages: ChatMessage[], schema: T, opts: { maxTokens?: number; temperature?: number } = {}): Promise<z.infer<T>> {
  let raw = await chat(s, messages, { json: true, ...opts });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = extractJson(raw);
      const r = schema.safeParse(parsed);
      if (r.success) return r.data;
      if (attempt === 1) throw new AIError("The AI returned data in an unexpected shape: " + r.error.issues.slice(0, 3).map((i) => i.path.join(".") + ": " + i.message).join("; "), true);
      raw = await chat(s, [...messages, { role: "assistant", content: raw.slice(0, 6000) }, { role: "user", content: `Your JSON did not match the required format (${r.error.issues.slice(0, 3).map((i) => i.path.join(".") + ": " + i.message).join("; ")}). Return ONLY the corrected JSON object.` }], { json: true, cache: false, ...opts });
    } catch (e) {
      if (e instanceof AIError) throw e;
      if (attempt === 1) throw new AIError("The AI did not return valid JSON.", true);
      raw = await chat(s, [...messages, { role: "assistant", content: raw.slice(0, 6000) }, { role: "user", content: "That was not valid JSON. Return ONLY one valid JSON object, with no commentary." }], { json: true, cache: false, ...opts });
    }
  }
  throw new AIError("Unreachable");
}

// Lenient helpers: small local models often return null, numbers as strings, or a single item instead of an array.
export const str = () => z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)), z.string());
export const optStr = () => z.preprocess((v) => (v == null ? undefined : typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : String(v)), z.string().optional());
export const arr = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(t));
export const strArr = () => arr(str());
export const num = () => z.preprocess((v) => (typeof v === "string" ? parseFloat(v) : v), z.number().catch(NaN));
export const int = () => z.preprocess((v) => (typeof v === "string" ? parseInt(v, 10) : v), z.number().int().catch(-1));
export const bool = () => z.preprocess((v) => (typeof v === "string" ? /^(true|yes|1)$/i.test(v) : !!v), z.boolean());
