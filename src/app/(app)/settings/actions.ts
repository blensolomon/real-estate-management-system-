"use server";

import { RuleError } from "@/lib/rules";
import { moveLeads } from "@/lib/leads";

import bcrypt from "bcryptjs";
import type { CalendarPref, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createSession, requireSession } from "@/lib/session";
import { ADMINS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { back, num, str } from "@/lib/actions-util";

export async function updateCompany(fd: FormData) {
  const s = await requireSession(ADMINS);
  const reservationDays = Math.floor(num(fd, "reservationDays"));
  const followUpDays = Math.floor(num(fd, "followUpDays"));
  if (!(reservationDays >= 1 && reservationDays <= 90) || !(followUpDays >= 1 && followUpDays <= 30))
    back("/settings", { error: "Reservation days must be 1–90 and follow-up days 1–30" });
  const calendar = str(fd, "calendar") as CalendarPref;
  const locale = str(fd, "locale") === "am" ? "am" : "en";
  const staleLeadDays = Math.min(30, Math.max(1, Math.floor(num(fd, "staleLeadDays")) || 3));
  const discountApprovalPct = num(fd, "discountApprovalPct");
  if (!(discountApprovalPct >= 0 && discountApprovalPct <= 50)) back("/settings", { error: "Discount limit must be 0–50%" });
  const commissionPayablePct = num(fd, "commissionPayablePct");
  if (!(commissionPayablePct >= 0 && commissionPayablePct <= 100)) back("/settings", { error: "Commission payable point must be 0–100%" });
  const before = await db.company.findUniqueOrThrow({ where: { id: s.companyId } });
  const c = await db.company.update({
    where: { id: s.companyId },
    data: { name: str(fd, "name") || undefined, reservationDays, followUpDays, calendar, locale, staleLeadDays, discountApprovalPct, commissionPayablePct },
  });
  await createSession({ ...s, companyName: c.name, calendar: c.calendar, locale: c.locale });
  await audit(s, "company.updated", "Company", c.id, `reservation ${reservationDays}d, follow-up ${followUpDays}d, ${calendar}, discount limit ${discountApprovalPct}%`, {
    before: { reservationDays: before.reservationDays, discountApprovalPct: Number(before.discountApprovalPct), commissionPayablePct: Number(before.commissionPayablePct) },
    after: { reservationDays, discountApprovalPct, commissionPayablePct },
  });
  back("/settings", { msg: "Settings saved" });
}

export async function addUser(fd: FormData) {
  const s = await requireSession(ADMINS);
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const role = str(fd, "role") as Role;
  if (!str(fd, "name") || !email || password.length < 8) back("/settings", { error: "Name, email and an 8+ character password are required" });
  if (role === "OWNER" && s.role !== "OWNER") back("/settings", { error: "Only owners can add owners" });
  if (await db.user.findUnique({ where: { email } })) back("/settings", { error: "Email already in use" });
  const u = await db.user.create({
    data: { companyId: s.companyId, name: str(fd, "name"), email, phone: str(fd, "phone") || null, role, external: str(fd, "external") === "on", passwordHash: await bcrypt.hash(password, 10) },
  });
  await audit(s, "user.added", "User", u.id, `${u.name} (${role})`);
  back("/settings", { msg: `${u.name} added` });
}

export async function updateUser(fd: FormData) {
  const s = await requireSession(ADMINS);
  const u = await db.user.findFirst({ where: { id: str(fd, "userId"), companyId: s.companyId } });
  if (!u) back("/settings", { error: "User not found" });
  if (u.id === s.userId) back("/settings", { error: "You can't change your own role or status" });
  if ((u.role === "OWNER" || str(fd, "role") === "OWNER") && s.role !== "OWNER") back("/settings", { error: "Only owners can change owners" });
  const active = str(fd, "active") === "on";
  await db.user.update({ where: { id: u.id }, data: { role: str(fd, "role") as Role, active, external: str(fd, "external") === "on" } });
  if (!active && u.active) {
    const n = await db.lead.count({ where: { ownerId: u.id, status: { notIn: ["WON", "LOST"] } } });
    await audit(s, "user.deactivated", "User", u.id, `${u.name}, ${n} open leads to reassign`);
    back("/settings", { msg: `${u.name} deactivated. Reassign their ${n} open leads from the Leads page.` });
  }
  await audit(s, "user.updated", "User", u.id, `${u.name}: ${str(fd, "role")}`);
  back("/settings", { msg: "User updated" });
}

export async function moveLeadsAction(fd: FormData) {
  const s = await requireSession(ADMINS);
  let msg = "";
  try {
    const r = await moveLeads(s, str(fd, "fromId"), str(fd, "toId"));
    msg = `Moved ${r.count} open leads from ${r.from.name} to ${r.to.name}`;
  } catch (e) {
    if (e instanceof RuleError) back("/settings", { error: e.message });
    throw e;
  }
  back("/settings", { msg });
}

/** Owner only: late-penalty rule and construction-stage due days (money rules). */
export async function savePenaltyRule(fd: FormData) {
  const s = await requireSession(["OWNER"]);
  const penaltyEnabled = str(fd, "penaltyEnabled") === "on";
  const penaltyGraceDays = Math.floor(num(fd, "penaltyGraceDays"));
  const penaltyPctPerMonth = num(fd, "penaltyPctPerMonth");
  const capRaw = str(fd, "penaltyCapPct");
  const penaltyCapPct = capRaw === "" ? null : Number(capRaw);
  const milestoneDueDays = Math.floor(num(fd, "milestoneDueDays"));
  if (!(penaltyGraceDays >= 0 && penaltyGraceDays <= 90)) back("/settings", { error: "Grace period must be 0–90 days" });
  if (!(penaltyPctPerMonth >= 0 && penaltyPctPerMonth <= 10)) back("/settings", { error: "Penalty must be 0–10% per month" });
  if (penaltyEnabled && !(penaltyPctPerMonth > 0)) back("/settings", { error: "Set a penalty % above 0 to switch penalties on" });
  if (penaltyCapPct != null && !(penaltyCapPct > 0 && penaltyCapPct <= 100)) back("/settings", { error: "Cap must be 1–100% or empty" });
  if (!(milestoneDueDays >= 0 && milestoneDueDays <= 180)) back("/settings", { error: "Stage payment days must be 0–180" });
  const before = await db.company.findUniqueOrThrow({ where: { id: s.companyId } });
  await db.company.update({ where: { id: s.companyId }, data: { penaltyEnabled, penaltyGraceDays, penaltyPctPerMonth, penaltyCapPct, milestoneDueDays } });
  await audit(s, "penalty.rule.updated", "Company", s.companyId, `penalties ${penaltyEnabled ? "on" : "off"}, ${penaltyPctPerMonth}%/month after ${penaltyGraceDays}d, cap ${penaltyCapPct ?? "none"}; stage dues ${milestoneDueDays}d`, {
    before: { penaltyEnabled: before.penaltyEnabled, penaltyGraceDays: before.penaltyGraceDays, penaltyPctPerMonth: Number(before.penaltyPctPerMonth), penaltyCapPct: before.penaltyCapPct == null ? null : Number(before.penaltyCapPct), milestoneDueDays: before.milestoneDueDays },
    after: { penaltyEnabled, penaltyGraceDays, penaltyPctPerMonth, penaltyCapPct, milestoneDueDays },
  });
  back("/settings", { msg: "Payment rules saved" });
}
