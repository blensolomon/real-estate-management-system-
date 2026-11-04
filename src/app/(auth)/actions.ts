"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { back, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { createCompanyWithOwner, signupEnabled } from "@/lib/tenancy";

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const user = await db.user.findUnique({ where: { email }, include: { company: true } });
  if (!user || !user.active || !(await bcrypt.compare(str(fd, "password"), user.passwordHash)))
    back("/login", { error: "Invalid email or password" });
  if (!user.company.active) back("/login", { error: "This company account is suspended. Contact support." });
  await createSession({
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
    name: user.name,
    companyName: user.company.name,
    calendar: user.company.calendar,
    locale: user.company.locale,
  });
  redirect("/dashboard");
}

export async function register(fd: FormData) {
  if (!signupEnabled()) back("/register", { error: "Sign-up is closed. Contact us to open a company account." });
  let created;
  try {
    created = await createCompanyWithOwner({ company: str(fd, "company"), name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") });
  } catch (e) {
    if (e instanceof RuleError) back("/register", { error: e.message });
    throw e;
  }
  const { company: c, owner: u } = created;
  await createSession({ userId: u.id, companyId: c.id, role: u.role, name: u.name, companyName: c.name, calendar: c.calendar, locale: c.locale });
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
