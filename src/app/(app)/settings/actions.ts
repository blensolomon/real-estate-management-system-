"use server";

import { RuleError } from "@/lib/rules";
import { moveLeads } from "@/lib/leads";

import bcrypt from "bcryptjs";
import type { CalendarPref, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createSession, getSession } from "@/lib/session";
import { back, num, str } from "@/lib/actions-util";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function updateCompany(fd: FormData) {
  // Guard: Check permission to edit settings
  const guard = await guardCompanyAction("EDIT_SETTINGS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
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
  await logCompanyAudit(s.companyId, s.userId, "EDIT_SETTINGS", "Company", c.id, `Company settings updated: reservations ${reservationDays}d, follow-ups ${followUpDays}d, calendar ${calendar}, discount limit ${discountApprovalPct}%`);
  back("/settings", { msg: "Settings saved" });
}

export async function addUser(fd: FormData) {
  // Guard: Check permission to create users
  const guard = await guardCompanyAction("CREATE_USER");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const role = str(fd, "role") as Role;
  if (!str(fd, "name") || !email || password.length < 8) back("/settings", { error: "Name, email and an 8+ character password are required" });
  if (role === "OWNER" && s.role !== "OWNER") back("/settings", { error: "Only owners can add owners" });
  if (await db.user.findUnique({ where: { email } })) back("/settings", { error: "Email already in use" });
  const u = await db.user.create({
    data: { companyId: s.companyId, name: str(fd, "name"), email, phone: str(fd, "phone") || null, role, external: str(fd, "external") === "on", passwordHash: await bcrypt.hash(password, 10) },
  });
  await logCompanyAudit(s.companyId, s.userId, "CREATE_USER", "User", u.id, `User added: ${u.name} (${role})`);
  back("/settings", { msg: `${u.name} added` });
}

export async function updateUser(fd: FormData) {
  // Guard: Check permission to edit users
  const guard = await guardCompanyAction("EDIT_USER");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const u = await db.user.findFirst({ where: { id: str(fd, "userId"), companyId: s.companyId } });
  if (!u) back("/settings", { error: "User not found" });
  if (u.id === s.userId) back("/settings", { error: "You can't change your own role or status" });
  if ((u.role === "OWNER" || str(fd, "role") === "OWNER") && s.role !== "OWNER") back("/settings", { error: "Only owners can change owners" });
  const active = str(fd, "active") === "on";
  const newRole = str(fd, "role") as Role;
  await db.user.update({ where: { id: u.id }, data: { role: newRole, active, external: str(fd, "external") === "on" } });
  if (!active && u.active) {
    const n = await db.lead.count({ where: { ownerId: u.id, status: { notIn: ["WON", "LOST"] } } });
    await logCompanyAudit(s.companyId, s.userId, "EDIT_USER", "User", u.id, `User deactivated: ${u.name}, ${n} open leads to reassign`);
    back("/settings", { msg: `${u.name} deactivated. Reassign their ${n} open leads from the Leads page.` });
  }
  await logCompanyAudit(s.companyId, s.userId, "EDIT_USER", "User", u.id, `User updated: ${u.name}, role: ${newRole}, active: ${active}`);
  back("/settings", { msg: "User updated" });
}

export async function moveLeadsAction(fd: FormData) {
  // Guard: Check permission to edit leads
  const guard = await guardCompanyAction("EDIT_LEAD");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  let msg = "";
  try {
    const r = await moveLeads(s, str(fd, "fromId"), str(fd, "toId"));
    msg = `Moved ${r.count} open leads from ${r.from.name} to ${r.to.name}`;
    await logCompanyAudit(s.companyId, s.userId, "EDIT_LEAD", "User", r.to.id, `${r.count} leads reassigned from ${r.from.name}`);
  } catch (e) {
    if (e instanceof RuleError) back("/settings", { error: e.message });
    throw e;
  }
  back("/settings", { msg });
}

/** Owner only: late-penalty rule and construction-stage due days (money rules). */
export async function savePenaltyRule(fd: FormData) {
  // Guard: Check permission to edit settings (also validates owner)
  const guard = await guardCompanyAction("EDIT_SETTINGS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  // Extra check: penalty rule is owner-only
  if (s.role !== "OWNER") back("/settings", { error: "Only company owners can modify payment rules" });
  
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
  await logCompanyAudit(s.companyId, s.userId, "EDIT_SETTINGS", "Company", s.companyId, `Payment rules updated: penalties ${penaltyEnabled ? "on" : "off"}, ${penaltyPctPerMonth}%/month after ${penaltyGraceDays}d, stage dues ${milestoneDueDays}d`);
  back("/settings", { msg: "Payment rules saved" });
}
