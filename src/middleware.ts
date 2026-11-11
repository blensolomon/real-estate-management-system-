import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/register", "/api/cron", "/api/auth/signout", "/platform-admin/login"];
const PLATFORM_ADMIN_ROUTES = ["/platform-admin"];
const PLATFORM_ADMIN_COOKIE = "platform_admin_session";
const key = new TextEncoder().encode(process.env.AUTH_SECRET);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // Check if it's a public route
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  
  // Check if it's a platform-admin route
  const isPlatformAdminRoute = PLATFORM_ADMIN_ROUTES.some((p) => pathname.startsWith(p));
  
  // Check company session
  const companyToken = req.cookies.get("resms_session")?.value;
  let companyAuthed = false;
  if (companyToken) {
    try {
      await jwtVerify(companyToken, key, { algorithms: ["HS256"] });
      companyAuthed = true;
    } catch {}
  }
  
  // Check platform admin session
  const platformAdminToken = req.cookies.get(PLATFORM_ADMIN_COOKIE)?.value;
  let platformAdminAuthed = false;
  if (platformAdminToken) {
    try {
      await jwtVerify(platformAdminToken, key, { algorithms: ["HS256"] });
      platformAdminAuthed = true;
    } catch {}
  }
  
  // If it's a platform-admin route
  if (isPlatformAdminRoute) {
    // Allow if they have platform admin session or if it's the login page
    if (!platformAdminAuthed && !pathname.startsWith("/platform-admin/login")) {
      return NextResponse.redirect(new URL("/platform-admin/login", req.url));
    }
    // If they're authed and on login, go to dashboard
    if (platformAdminAuthed && pathname === "/platform-admin/login") {
      return NextResponse.redirect(new URL("/platform-admin", req.url));
    }
    return NextResponse.next();
  }
  
  // Company app routes - existing logic
  if (!companyAuthed && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (companyAuthed && (pathname === "/" || pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
