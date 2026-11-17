import { NextResponse } from "next/server";
import { HttpError, requireUser, ownManuscript, type User } from "./auth";
import type { ManuscriptRow } from "./types";
import { ZodError } from "zod";

type Ctx = { params: Promise<Record<string, string>> };

export function route<T>(fn: (req: Request, user: User, params: Record<string, string>) => Promise<T>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await requireUser();
      const params = ctx?.params ? await ctx.params : {};
      const out = await fn(req, user, params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function msRoute<T>(fn: (req: Request, user: User, ms: ManuscriptRow, params: Record<string, string>) => Promise<T>) {
  return route(async (req, user, params) => {
    const ms = ownManuscript(user.id, params.id);
    return fn(req, user, ms, params);
  });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request: " + e.issues.map((i) => i.path.join(".") + " " + i.message).join("; ") }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
}

export async function body<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}
