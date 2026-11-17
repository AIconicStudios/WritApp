/** Phone version of lib/auth: a single private local user, no passwords or network accounts. */
import { db } from "@/lib/db";
import type { ManuscriptRow } from "@/lib/types";

export const LOCAL_USER = { id: "local", email: "you@this-phone", name: "Author", created_at: 0 };
export type User = typeof LOCAL_USER;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export function ensureLocalUser() {
  if (!db().prepare("SELECT 1 FROM users WHERE id = ?").get("local")) db().prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)").run("local", LOCAL_USER.email, LOCAL_USER.name, "-", Date.now());
}
export async function currentUser(): Promise<User> {
  return LOCAL_USER;
}
export async function requireUser(): Promise<User> {
  return LOCAL_USER;
}
export async function createUser(): Promise<User> {
  return LOCAL_USER;
}
export async function verifyLogin(): Promise<User> {
  return LOCAL_USER;
}
export async function startSession() {}
export async function endSession() {}
export const SESSION_COOKIE = "local";
export function ownManuscript(userId: string, manuscriptId: string) {
  const m = db().prepare("SELECT * FROM manuscripts WHERE id = ? AND user_id = ?").get(manuscriptId, userId);
  if (!m) throw new HttpError(404, "Manuscript not found.");
  return m as ManuscriptRow;
}
