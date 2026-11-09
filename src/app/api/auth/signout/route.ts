import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Clears the session cookie (e.g. after a user or company was deactivated) and returns to sign-in. */
export async function GET(req: NextRequest) {
  const url = new URL("/login", req.url);
  if (req.nextUrl.searchParams.get("inactive") && req.cookies.get(SESSION_COOKIE))
    url.searchParams.set("error", "Your account or company is no longer active. Contact your administrator.");
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
