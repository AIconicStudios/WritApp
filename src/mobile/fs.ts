/** Minimal `fs` for the phone: files live in memory and are persisted to IndexedDB. */
import { kvDel, kvGet, kvKeys, kvSet } from "./store";
import { Buffer } from "buffer";

const files = new Map<string, Uint8Array>();
const key = (p: string) => "file:" + String(p).replace(/^\.?\//, "");

export async function loadFiles() {
  for (const k of await kvKeys("file:")) {
    const v = await kvGet<Uint8Array>(k);
    if (v) files.set(k, v);
  }
}

export function mkdirSync() {}
export function existsSync(p: string) {
  return files.has(key(p));
}
export function writeFileSync(p: string, data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  files.set(key(p), bytes);
  void kvSet(key(p), bytes);
}
export function readFileSync(p: string, enc?: string) {
  const b = files.get(key(p));
  if (!b) throw new Error("ENOENT: " + p);
  return enc ? new TextDecoder().decode(b) : Buffer.from(b);
}
export function rmSync(p: string) {
  files.delete(key(p));
  void kvDel(key(p));
}
const fs = { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync };
export default fs;
