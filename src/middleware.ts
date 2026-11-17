import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const has = req.cookies.get("ce_session");
  if (!has && req.nextUrl.pathname.startsWith("/app")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };
