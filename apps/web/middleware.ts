import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/_next", "/favicon.ico"];
const REFRESH_COOKIE = "travel_refreshToken";

// Gates on cookie PRESENCE only, not validity — real enforcement happens API-side
// per request (Quest pattern). This just avoids flashing authed UI with no cookie.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const hasRefreshCookie = request.cookies.has(REFRESH_COOKIE);
  if (!hasRefreshCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
