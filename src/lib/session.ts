import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CalendarPref, Role } from "@prisma/client";

export type Session = {
  userId: string;
  companyId: string;
  role: Role;
  name: string;
  companyName: string;
  calendar: CalendarPref;
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
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession() {
  return decrypt((await cookies()).get(COOKIE)?.value);
}

export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/dashboard?denied=1");
  return s;
}

export const SESSION_COOKIE = COOKIE;
