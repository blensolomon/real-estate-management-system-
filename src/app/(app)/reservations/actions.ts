"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { back, num, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { canManage, seesAll, SALES, MANAGERS } from "@/lib/permissions";
import { addDays } from "@/lib/format";
import { expireReservations, reserveUnit } from "@/lib/reservations";

export async function createReservation(fd: FormData) {
  const s = await requireSession(SALES);
  await expireReservations(s.companyId);
  const unitId = str(fd, "unitId");
  const leadId = str(fd, "leadId");
  let msg = "";
  try {
    const { unit, days } = await reserveUnit(s, {
      unitId,
      leadId: leadId || undefined,
      fullName: str(fd, "fullName"),
      phone: str(fd, "phone"),
      idNumber: str(fd, "idNumber"),
      days: num(fd, "days"),
      deposit: num(fd, "depositAmount"),
      note: str(fd, "note"),
    });
    msg = `Unit ${unit.code} reserved for ${days} days`;
  } catch (e) {
    if (e instanceof RuleError) back(`/reservations/new?unitId=${unitId}&leadId=${leadId}`, { error: e.message });
    throw e;
  }
  redirect(`/reservations?msg=${encodeURIComponent(msg)}`);
}

async function loadActive(fd: FormData) {
  const s = await requireSession(SALES);
  const r = await db.reservation.findFirst({
    where: { id: str(fd, "id"), companyId: s.companyId, status: "ACTIVE" },
    include: { unit: true },
  });
  if (!r || (!seesAll(s.role) && r.agentId !== s.userId)) back("/reservations", { error: "Active reservation not found" });
  return { s, r };
}

export async function cancelReservation(fd: FormData) {
  const { s, r } = await loadActive(fd);
  await db.$transaction([
    db.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED", closedAt: new Date(), note: str(fd, "reason") || r.note } }),
    db.unit.updateMany({ where: { id: r.unitId, status: "RESERVED" }, data: { status: "AVAILABLE" } }),
  ]);
  await audit(s, "reservation.cancelled", "Reservation", r.id, `${r.unit.code} ${str(fd, "reason")}`);
  back("/reservations", { msg: `Reservation for ${r.unit.code} cancelled; unit is available again` });
}

export async function extendReservation(fd: FormData) {
  const { s, r } = await loadActive(fd);
  if (!canManage(s.role)) back("/reservations", { error: "Only managers can extend reservations" });
  const days = Math.min(30, Math.max(1, Math.floor(num(fd, "days") || 0)));
  await db.reservation.update({ where: { id: r.id }, data: { expiresAt: addDays(r.expiresAt, days) } });
  await audit(s, "reservation.extended", "Reservation", r.id, `+${days} days`);
  back("/reservations", { msg: `Extended ${r.unit.code} by ${days} days` });
}

export async function runExpiry() {
  const s = await requireSession(MANAGERS);
  const n = await expireReservations(s.companyId);
  back("/reservations", { msg: `${n} reservation(s) expired` });
}
