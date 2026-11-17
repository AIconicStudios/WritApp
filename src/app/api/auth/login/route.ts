import { NextResponse } from "next/server";
import { startSession, verifyLogin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const attempts = new Map<string, number[]>();

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const key = String(b.email ?? "").toLowerCase();
    const t = Date.now();
    const recent = (attempts.get(key) ?? []).filter((x) => t - x < 15 * 60_000);
    if (recent.length >= 10) return NextResponse.json({ error: "Too many sign-in attempts. Please wait 15 minutes." }, { status: 429 });
    try {
      const u = await verifyLogin(key, String(b.password ?? ""));
      attempts.delete(key);
      await startSession(u.id);
      return NextResponse.json({ user: u });
    } catch (e) {
      attempts.set(key, [...recent, t]);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
