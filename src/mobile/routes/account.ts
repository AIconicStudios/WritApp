import { route, body } from "@/lib/http";
import { db } from "@/lib/db";
import { kvDel } from "../store";

/** On the phone there is one local profile. “Delete” erases every manuscript and file on this device. */
export const PATCH = route(async (req, user) => {
  const b = await body(req);
  if (b.name !== undefined && String(b.name).trim()) db().prepare("UPDATE users SET name = ? WHERE id = ?").run(String(b.name).trim(), user.id);
  return { ok: true };
});
export const DELETE = route(async () => {
  await kvDel("db");
  const { kvKeys } = await import("../store");
  for (const k of await kvKeys("file:")) await kvDel(k);
  setTimeout(() => location.replace("/"), 50);
  return { ok: true };
});
