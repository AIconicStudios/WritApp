/** Phone version of lib/http: the same route handlers, returning standard Response objects. */
import { HttpError, ownManuscript, requireUser, type User } from "@/lib/auth";
import type { ManuscriptRow } from "@/lib/types";
import { ZodError } from "zod";

type Ctx = { params: Promise<Record<string, string>> };

export function route<T>(fn: (req: Request, user: User, params: Record<string, string>) => Promise<T>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await requireUser();
      const out = await fn(req, user, ctx?.params ? await ctx.params : {});
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
export function msRoute<T>(fn: (req: Request, user: User, ms: ManuscriptRow, params: Record<string, string>) => Promise<T>) {
  return route(async (req, user, params) => fn(req, user, ownManuscript(user.id, params.id), params));
}
export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
  console.error(e);
  return Response.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
}
export async function body<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}
