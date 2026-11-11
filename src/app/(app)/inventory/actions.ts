"use server";

import type { UnitStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { saveTiers } from "@/lib/commissions";
import { markMilestoneReached, saveMilestones } from "@/lib/milestones";
import { parseDateInput } from "@/lib/format";
import { RuleError } from "@/lib/rules";
import { back, isUniqueViolation, num, str } from "@/lib/actions-util";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function createProject(fd: FormData) {
  // Guard: Check permission to edit projects
  const guard = await guardCompanyAction("EDIT_PROJECTS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const name = str(fd, "name");
  const rate = num(fd, "commissionRate");
  if (!name || !Number.isFinite(rate) || rate < 0 || rate > 100) back("/inventory", { error: "Name and a valid commission % are required" });
  const p = await db.project.create({
    data: { companyId: s.companyId, name, location: str(fd, "location") || null, commissionRate: rate },
  });
  await logCompanyAudit(s.companyId, s.userId, "EDIT_PROJECTS", "Project", p.id, `Project created: ${name}, commission rate: ${rate}%`);
  back(`/inventory/${p.id}`, { msg: "Project created. Now add units." });
}

export async function updateProject(fd: FormData) {
  // Guard: Check permission to edit projects
  const guard = await guardCompanyAction("EDIT_PROJECTS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const id = str(fd, "projectId");
  const rate = num(fd, "commissionRate");
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) back(`/inventory/${id}`, { error: "Invalid commission %" });
  await db.project.updateMany({
    where: { id, companyId: s.companyId },
    data: { name: str(fd, "name"), location: str(fd, "location") || null, commissionRate: rate },
  });
  await logCompanyAudit(s.companyId, s.userId, "EDIT_PROJECTS", "Project", id, `Project updated: ${str(fd, "name")}, commission: ${rate}%`);
  back(`/inventory/${id}`, { msg: "Project updated" });
}

/** Adds one unit, or many when `count` > 1 (codes get a numeric suffix). */
export async function addUnits(fd: FormData) {
  // Guard: Check permission to edit projects
  const guard = await guardCompanyAction("EDIT_PROJECTS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const projectId = str(fd, "projectId");
  const project = await db.project.findFirst({ where: { id: projectId, companyId: s.companyId } });
  if (!project) back("/inventory", { error: "Project not found" });
  const prefix = str(fd, "code");
  const price = num(fd, "price");
  const count = Math.max(1, Math.min(200, Math.floor(num(fd, "count") || 1)));
  const start = Math.floor(num(fd, "start") || 1);
  const size = num(fd, "sizeSqm");
  const floor = num(fd, "floor");
  if (!prefix || !(price > 0)) back(`/inventory/${projectId}`, { error: "Unit code and price are required" });
  const rows = Array.from({ length: count }, (_, k) => ({
    companyId: s.companyId,
    projectId,
    code: count === 1 ? prefix : `${prefix}${start + k}`,
    block: str(fd, "block") || null,
    floor: Number.isFinite(floor) ? floor : null,
    type: str(fd, "type") || null,
    sizeSqm: size > 0 ? size : null,
    price,
    kind: str(fd, "kind") === "PLOT" ? ("PLOT" as const) : ("APARTMENT" as const),
    zoning: str(fd, "zoning") || null,
    titleStatus: str(fd, "titleStatus") || null,
  }));
  const res = await db.unit.createMany({ data: rows, skipDuplicates: true });
  await logCompanyAudit(s.companyId, s.userId, "EDIT_PROJECTS", "Project", projectId, `${res.count} unit(s) added to ${project.name}`);
  back(`/inventory/${projectId}`, {
    msg: `${res.count} unit(s) added${res.count < count ? ` (${count - res.count} skipped: duplicate code)` : ""}`,
  });
}

export async function updateUnit(fd: FormData) {
  // Guard: Check permission to edit projects
  const guard = await guardCompanyAction("EDIT_PROJECTS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const unit = await db.unit.findFirst({ where: { id: str(fd, "unitId"), companyId: s.companyId } });
  if (!unit) back("/inventory", { error: "Unit not found" });
  const price = num(fd, "price");
  const status = str(fd, "status") as UnitStatus;
  const path = `/inventory/${unit.projectId}`;
  if (status !== unit.status) {
    const allowed =
      (unit.status === "AVAILABLE" && status === "BLOCKED") ||
      (unit.status === "BLOCKED" && status === "AVAILABLE") ||
      (unit.status === "SOLD" && status === "HANDED_OVER");
    if (!allowed) back(path, { error: "Reserved and sold changes happen through reservations and sales" });
  }
  try {
    await db.unit.update({
      where: { id: unit.id },
      data: {
        price: price > 0 ? price : unit.price,
        status,
        code: str(fd, "code") || unit.code,
        ...(unit.kind === "PLOT" ? { zoning: str(fd, "zoning") || null, titleStatus: str(fd, "titleStatus") || null } : {}),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) back(path, { error: "Another unit already uses that code" });
    throw e;
  }
  const newPrice = price > 0 ? price : Number(unit.price);
  await logCompanyAudit(s.companyId, s.userId, "EDIT_PROJECTS", "Unit", unit.id, `Unit ${unit.code} updated: price ${Number(unit.price)}→${newPrice}, status ${unit.status}→${status}`);
  back(path, { msg: `Unit ${unit.code} updated` });
}

export async function saveTiersAction(fd: FormData) {
  // Guard: Check permission to edit projects
  const guard = await guardCompanyAction("EDIT_PROJECTS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const projectId = str(fd, "projectId");
  const toNum = (v: FormDataEntryValue) => Number(String(v).replace(/,/g, "").trim() || 0);
  const rates = fd.getAll("rate").map(toNum);
  const tiers = fd.getAll("fromAmount").map((v, i) => ({ fromAmount: toNum(v), rate: rates[i] || 0 }));
  try {
    await saveTiers(s, projectId, tiers);
    await logCompanyAudit(s.companyId, s.userId, "EDIT_PROJECTS", "Project", projectId, `Commission tiers updated: ${tiers.length} tier(s)`);
  } catch (e) {
    if (e instanceof RuleError) back(`/inventory/${projectId}`, { error: e.message });
    throw e;
  }
  back(`/inventory/${projectId}`, { msg: "Commission tiers saved. They apply to new sales." });
}

export async function saveMilestonesAction(fd: FormData) {
  // Guard: Check permission to edit projects
  const guard = await guardCompanyAction("EDIT_PROJECTS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const projectId = str(fd, "projectId");
  const pcts = fd.getAll("pct").map((v) => Number(String(v).trim() || 0));
  const dates = fd.getAll("expectedAt").map((v) => parseDateInput(String(v)));
  const items = fd.getAll("stageName").map((v, i) => ({ name: String(v), pct: pcts[i] || 0, expectedAt: dates[i] ?? null }));
  try {
    await saveMilestones(s, projectId, items);
    await logCompanyAudit(s.companyId, s.userId, "EDIT_PROJECTS", "Project", projectId, `Construction stages updated: ${items.length} stage(s)`);
  } catch (e) {
    if (e instanceof RuleError) back(`/inventory/${projectId}`, { error: e.message });
    throw e;
  }
  back(`/inventory/${projectId}`, { msg: "Construction stages saved" });
}

export async function markReachedAction(fd: FormData) {
  // Guard: Check permission to edit projects
  const guard = await guardCompanyAction("EDIT_PROJECTS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const projectId = str(fd, "projectId");
  const milestoneId = str(fd, "milestoneId");
  try {
    const r = await markMilestoneReached(s, milestoneId);
    await logCompanyAudit(s.companyId, s.userId, "EDIT_PROJECTS", "Milestone", milestoneId, `Milestone reached. ${r.count} client payment(s) now due.`);
    back(`/inventory/${projectId}`, { msg: `Stage marked reached. ${r.count} client payment(s) are now due.` });
  } catch (e) {
    if (e instanceof RuleError) back(`/inventory/${projectId}`, { error: e.message });
    throw e;
  }
}
