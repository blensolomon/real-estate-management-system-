"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { back, str } from "@/lib/actions-util";

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const user = await db.user.findUnique({ where: { email }, include: { company: true } });
  if (!user || !user.active || !(await bcrypt.compare(str(fd, "password"), user.passwordHash)))
    back("/login", { error: "Invalid email or password" });
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
  const company = str(fd, "company");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!company || !name || !email || password.length < 8)
    back("/register", { error: "All fields are required; password must be at least 8 characters" });
  if (await db.user.findUnique({ where: { email } })) back("/register", { error: "Email already registered" });
  const c = await db.company.create({
    data: {
      name: company,
      users: { create: { name, email, passwordHash: await bcrypt.hash(password, 10), role: "OWNER" } },
    },
    include: { users: true },
  });
  const u = c.users[0];
  await createSession({ userId: u.id, companyId: c.id, role: u.role, name: u.name, companyName: c.name, calendar: c.calendar, locale: c.locale });
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
