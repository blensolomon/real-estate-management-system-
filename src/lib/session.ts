import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { accountActive } from "./tenancy";
import type { CalendarPref, Role } from "@prisma/client";

export type Session = {
  userId: string;
  companyId: string;
  role: Role;
  name: string;
  companyName: string;
  calendar: CalendarPref;
  locale?: string;
};

const COOKIE = "resms_session";
const key = new TextEncoder().encode(process.env.AUTH_SECRET);

export async function encrypt(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function decrypt(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function createSession(session: Session) {
  const store = await cookies();
  store.set(COOKIE, await encrypt(session), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}

/** Valid token AND user + company still active (checked against the database once per request). */
export const getSession = cache(async (): Promise<Session | null> => {
  const s = await decrypt((await cookies()).get(COOKIE)?.value);
  if (!s || !(await accountActive(s.userId, s.companyId))) return null;
  return s;
});

export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/api/auth/signout?inactive=1");
  if (roles && !roles.includes(s.role)) redirect("/dashboard?denied=1");
  return s;
}

export const SESSION_COOKIE = COOKIE;
