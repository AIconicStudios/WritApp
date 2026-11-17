import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, now, uid } from "./db";
import { sha256 } from "./secure";

export const SESSION_COOKIE = "ce_session";
const SESSION_DAYS = 30;

export type User = { id: string; email: string; name: string; created_at: number };

export async function createUser(email: string, name: string, password: string): Promise<User> {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
  if (!name.trim()) throw new HttpError(400, "Please enter your name.");
  const exists = db().prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) throw new HttpError(409, "An account with this email already exists.");
  const hash = await bcrypt.hash(password, 11);
  const user: User = { id: uid("u_"), email, name: name.trim(), created_at: now() };
  db().prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)").run(user.id, user.email, user.name, hash, user.created_at);
  return user;
}

export async function verifyLogin(email: string, password: string): Promise<User> {
  const row = db().prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as (User & { password_hash: string }) | undefined;
  // Constant-ish time: always run a bcrypt comparison.
  const ok = await bcrypt.compare(password, row?.password_hash ?? "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!row || !ok) throw new HttpError(401, "Incorrect email or password.");
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

export async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = now() + SESSION_DAYS * 86400_000;
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)").run(sha256(token), userId, expires, now());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(t));
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const row = db()
    .prepare("SELECT u.id, u.email, u.name, u.created_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .get(sha256(t)) as (User & { expires_at: number }) | undefined;
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Please sign in.");
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Ensures the manuscript belongs to the user (document privacy). */
export function ownManuscript(userId: string, manuscriptId: string) {
  const m = db().prepare("SELECT * FROM manuscripts WHERE id = ? AND user_id = ?").get(manuscriptId, userId);
  if (!m) throw new HttpError(404, "Manuscript not found.");
  return m as import("./types").ManuscriptRow;
}
