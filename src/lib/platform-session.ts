import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { PlatformUserRole } from "@prisma/client";

export type PlatformSession = {
  platformUserId: string;
  email: string;
  name: string;
  role: PlatformUserRole;
  createdAt: number;
};

const COOKIE = "platform_admin_session";
const key = new TextEncoder().encode(process.env.AUTH_SECRET);

export async function encryptPlatformSession(session: PlatformSession) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function decryptPlatformSession(token: string | undefined): Promise<PlatformSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload as unknown as PlatformSession;
  } catch {
    return null;
  }
}

export async function createPlatformSession(session: PlatformSession) {
  const store = await cookies();
  store.set(COOKIE, await encryptPlatformSession(session), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function deletePlatformSession() {
  (await cookies()).delete(COOKIE);
}

/** Valid token AND user still active (checked against database once per request). */
export const getPlatformSession = cache(async (): Promise<PlatformSession | null> => {
  const s = await decryptPlatformSession((await cookies()).get(COOKIE)?.value);
  if (!s) return null;

  // Verify user is still active in database
  const { db } = await import("@/lib/db");
  const user = await db.platformUser.findUnique({
    where: { id: s.platformUserId },
  });

  if (!user || !user.active) return null;
  return s;
});

export async function requirePlatformSession(roles?: PlatformUserRole[]): Promise<PlatformSession> {
  const s = await getPlatformSession();
  if (!s) redirect("/platform-admin/login?session=expired");
  if (roles && !roles.includes(s.role)) redirect("/platform-admin/dashboard?denied=1");
  return s;
}

export const PLATFORM_SESSION_COOKIE = COOKIE;
