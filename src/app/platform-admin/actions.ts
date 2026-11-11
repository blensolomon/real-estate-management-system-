"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createPlatformSession, deletePlatformSession } from "@/lib/platform-session";
import { back, str } from "@/lib/actions-util";
import type { PlatformUserRole } from "@prisma/client";
import { guardPlatformAction, logPlatformAudit } from "@/lib/permission-guards";

export async function platformAdminLogin(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");

  const user = await db.platformUser.findUnique({
    where: { email },
  });

  if (!user || !user.active) {
    back("/platform-admin/login", { error: "Invalid email or password" });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    back("/platform-admin/login", { error: "Invalid email or password" });
  }

  // Update lastLoginAt
  await db.platformUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Create platform session
  await createPlatformSession({
    platformUserId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: Date.now(),
  });

  // Log the login
  await logPlatformAudit(user.id, "LOGIN", "PlatformUser", user.id, `Login successful`);

  redirect("/platform-admin");
}

export async function platformAdminLogout() {
  await deletePlatformSession();
  redirect("/platform-admin/login");
}

export async function createPlatformUser(
  data: {
    email: string;
    name: string;
    password: string;
    role: PlatformUserRole;
  }
) {
  // Check permission
  const guard = await guardPlatformAction("CREATE_USER");
  const email = data.email.toLowerCase();

  // Verify email is unique
  const existing = await db.platformUser.findUnique({
    where: { email },
  });

  if (existing) {
    throw new Error("Email already in use");
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const newUser = await db.platformUser.create({
    data: {
      email,
      name: data.name,
      passwordHash,
      role: data.role,
      active: true,
    },
  });

  // Log the creation
  await logPlatformAudit(
    guard.userId,
    "CREATE_PLATFORM_USER",
    "PlatformUser",
    newUser.id,
    `Created new platform admin: ${newUser.email} (${newUser.role})`
  );

  return newUser;
}

export async function deactivatePlatformUser(userId: string) {
  // Check permission
  const guard = await guardPlatformAction("EDIT_USER");

  if (guard.userId === userId) {
    throw new Error("Cannot deactivate yourself");
  }

  const user = await db.platformUser.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const updated = await db.platformUser.update({
    where: { id: userId },
    data: { active: false },
  });

  // Log the deactivation
  await logPlatformAudit(
    guard.userId,
    "DEACTIVATE_PLATFORM_USER",
    "PlatformUser",
    userId,
    `Deactivated platform admin: ${user.email}`
  );

  return updated;
}

export async function suspendCompany(companyId: string, reason: string) {
  // Check permission
  const guard = await guardPlatformAction("SUSPEND_COMPANY");

  const company = await db.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  if (company.suspendedAt) {
    throw new Error("Company is already suspended");
  }

  const updated = await db.company.update({
    where: { id: companyId },
    data: {
      suspendedAt: new Date(),
      active: false,
    },
  });

  // Log the suspension
  await logPlatformAudit(
    guard.userId,
    "SUSPEND_COMPANY",
    "Company",
    companyId,
    `Company suspended: ${reason}`
  );

  return updated;
}

export async function createCompany(
  data: {
    name: string;
    email: string;
    ownerName: string;
    password: string;
  }
) {
  // Check permission
  const guard = await guardPlatformAction("CREATE_COMPANY");
  const email = data.email.toLowerCase();

  // Check if email already exists
  const existing = await db.user.findUnique({
    where: { email },
  });

  if (existing) {
    throw new Error("Email already in use");
  }

  // Create company
  const company = await db.company.create({
    data: {
      name: data.name,
    },
  });

  // Hash password and create owner user
  const passwordHash = await bcrypt.hash(data.password, 10);
  const owner = await db.user.create({
    data: {
      companyId: company.id,
      email,
      name: data.ownerName,
      passwordHash,
      role: "OWNER",
    },
  });

  // Log the creation
  await logPlatformAudit(
    guard.userId,
    "CREATE_COMPANY",
    "Company",
    company.id,
    `Created new company: ${company.name} with owner ${owner.email}`
  );

  return company;
}

export async function reactivateCompany(companyId: string, reason: string) {
  // Check permission
  const guard = await guardPlatformAction("REACTIVATE_COMPANY");

  const company = await db.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  if (!company.suspendedAt) {
    throw new Error("Company is not suspended");
  }

  const updated = await db.company.update({
    where: { id: companyId },
    data: {
      suspendedAt: null,
      active: true,
    },
  });

  // Log the reactivation
  await logPlatformAudit(
    guard.userId,
    "REACTIVATE_COMPANY",
    "Company",
    companyId,
    `Company reactivated: ${reason}`
  );

  return updated;
}
