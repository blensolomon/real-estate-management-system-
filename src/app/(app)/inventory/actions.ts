"use server";

import type { UnitStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { back, isUniqueViolation, num, str } from "@/lib/actions-util";

export async function createProject(fd: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const name = str(fd, "name");
  const rate = num(fd, "commissionRate");
  if (!name || !Number.isFinite(rate) || rate < 0 || rate > 100) back("/inventory", { error: "Name and a valid commission % are required" });
  const p = await db.project.create({
    data: { companyId: s.companyId, name, location: str(fd, "location") || null, commissionRate: rate },
  });
  await audit(s, "project.created", "Project", p.id, name);
  back(`/inventory/${p.id}`, { msg: "Project created. Now add units." });
}

export async function updateProject(fd: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const id = str(fd, "projectId");
  const rate = num(fd, "commissionRate");
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) back(`/inventory/${id}`, { error: "Invalid commission %" });
  await db.project.updateMany({
    where: { id, companyId: s.companyId },
    data: { name: str(fd, "name"), location: str(fd, "location") || null, commissionRate: rate },
  });
  await audit(s, "project.updated", "Project", id, `commission ${rate}%`);
  back(`/inventory/${id}`, { msg: "Project updated" });
}

/** Adds one unit, or many when `count` > 1 (codes get a numeric suffix). */
export async function addUnits(fd: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
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
  }));
  const res = await db.unit.createMany({ data: rows, skipDuplicates: true });
  await audit(s, "units.added", "Project", projectId, `${res.count} units`);
  back(`/inventory/${projectId}`, {
    msg: `${res.count} unit(s) added${res.count < count ? ` (${count - res.count} skipped: duplicate code)` : ""}`,
  });
}

export async function updateUnit(fd: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const unit = await db.unit.findFirst({ where: { id: str(fd, "unitId"), companyId: s.companyId } });
  if (!unit) back("/inventory", { error: "Unit not found" });
  const price = num(fd, "price");
  const status = str(fd, "status") as UnitStatus;
  const path = `/inventory/${unit.projectId}`;
  if (status !== unit.status) {
    const allowed = (unit.status === "AVAILABLE" && status === "BLOCKED") || (unit.status === "BLOCKED" && status === "AVAILABLE");
    if (!allowed) back(path, { error: "Reserved/sold status changes only through reservations and deals" });
  }
  try {
    await db.unit.update({
      where: { id: unit.id },
      data: { price: price > 0 ? price : unit.price, status, code: str(fd, "code") || unit.code },
    });
  } catch (e) {
    if (isUniqueViolation(e)) back(path, { error: "Another unit already uses that code" });
    throw e;
  }
  await audit(s, "unit.updated", "Unit", unit.id, `${unit.code}: price ${unit.price}→${price}, ${unit.status}→${status}`);
  back(path, { msg: `Unit ${unit.code} updated` });
}
