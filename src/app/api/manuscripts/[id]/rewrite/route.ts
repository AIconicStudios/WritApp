import { body, msRoute } from "@/lib/http";
import { rewrite } from "@/lib/creative";
import { AIError } from "@/lib/ai/provider";
import { HttpError } from "@/lib/auth";

export const maxDuration = 600;

export const POST = msRoute(async (req, user, ms) => {
  const b = await body(req);
  try {
    return await rewrite(user.id, ms, b);
  } catch (e) {
    if (e instanceof AIError) throw new HttpError(502, e.message);
    throw e;
  }
});
