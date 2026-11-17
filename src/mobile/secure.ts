/**
 * Phone version of lib/secure: data already lives in the app's private Android storage,
 * which other apps cannot read, so files are stored as-is. sha256 is a pure-JS implementation.
 */
import { sha256 as js256 } from "js-sha256";
export function encryptBuffer(b: Buffer): Buffer {
  return b;
}
export function decryptBuffer(b: Buffer): Buffer {
  return b;
}
export function encryptString(s: string) {
  return s;
}
export function decryptString(s: string | null | undefined) {
  return s ?? "";
}
export function sha256(s: string | Uint8Array) {
  return js256(s as any);
}
