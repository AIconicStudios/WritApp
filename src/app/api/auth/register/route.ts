import { NextResponse } from "next/server";
import { createUser, startSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const u = await createUser(String(b.email ?? ""), String(b.name ?? ""), String(b.password ?? ""));
    await startSession(u.id);
    return NextResponse.json({ user: u });
  } catch (e) {
    return errorResponse(e);
  }
}
