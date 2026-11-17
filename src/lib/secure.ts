import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

/**
 * Encryption at rest for API keys and uploaded manuscripts (AES-256-GCM).
 * The key is derived from APP_SECRET. If APP_SECRET is not set, a random secret is
 * generated once and stored in DATA_DIR/.secret (fine for single-machine installs).
 */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  let secret = process.env.APP_SECRET;
  if (!secret || secret === "change-me-to-a-long-random-string") {
    const p = path.join(DATA_DIR, ".secret");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(p)) secret = fs.readFileSync(p, "utf8").trim();
    else {
      secret = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(p, secret, { mode: 0o600 });
    }
  }
  cachedKey = crypto.createHash("sha256").update("cashless-edit:" + secret).digest();
  return cachedKey;
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from("CE1"), iv, c.getAuthTag(), enc]);
}

export function decryptBuffer(data: Buffer): Buffer {
  if (data.subarray(0, 3).toString() !== "CE1") return data;
  const iv = data.subarray(3, 15);
  const tag = data.subarray(15, 31);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data.subarray(31)), d.final()]);
}

export function encryptString(s: string): string {
  return encryptBuffer(Buffer.from(s, "utf8")).toString("base64");
}
export function decryptString(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return decryptBuffer(Buffer.from(s, "base64")).toString("utf8");
  } catch {
    return "";
  }
}

export function sha256(s: string | Buffer): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
