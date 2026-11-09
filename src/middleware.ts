import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/register", "/api/cron", "/api/auth/signout"];
const key = new TextEncoder().encode(process.env.AUTH_SECRET);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  const token = req.cookies.get("resms_session")?.value;
  let authed = false;
  if (token) {
    try {
      await jwtVerify(token, key, { algorithms: ["HS256"] });
      authed = true;
    } catch {}
  }
  if (!authed && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  if (authed && (pathname === "/" || pathname === "/login" || pathname === "/register"))
    return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
