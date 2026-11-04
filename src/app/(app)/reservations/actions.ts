"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { back, isUniqueViolation, num, str } from "@/lib/actions-util";
import { canManage, seesAll } from "@/lib/permissions";
import { addDays } from "@/lib/format";
import { expireReservations } from "@/lib/reservations";

export async function createReservation(fd: FormData) {
  const s = await requireSession(["OWNER", "MANAGER", "AGENT"]);
  await expireReservations(s.companyId);
  const unitId = str(fd, "unitId");
  const leadId = str(fd, "leadId");
  const retry = `/reservations/new?unitId=${unitId}&leadId=${leadId}`;
  const company = await db.company.findUniqueOrThrow({ where: { id: s.companyId } });
  const unit = await db.unit.findFirst({ where: { id: unitId, companyId: s.companyId }, include: { project: true } });
  if (!unit) back(retry, { error: "Choose a unit" });

  const fullName = str(fd, "fullName");
  const phone = str(fd, "phone").replace(/\s+/g, "");
  if (!fullName || !phone) back(retry, { error: "Buyer name and phone are required" });
  const lead = leadId ? await db.lead.findFirst({ where: { id: leadId, companyId: s.companyId } }) : null;
  if (lead && !seesAll(s.role) && lead.ownerId !== s.userId) back("/reservations", { error: "Not your lead" });

  const days = canManage(s.role) && num(fd, "days") > 0 ? Math.min(90, Math.floor(num(fd, "days"))) : company.reservationDays;
  const deposit = num(fd, "depositAmount");

  try {
    const reservation = await db.$transaction(async (tx) => {
      // Conditional update is the lock: only one request can flip AVAILABLE -> RESERVED.
      const flipped = await tx.unit.updateMany({ where: { id: unit.id, status: "AVAILABLE" }, data: { status: "RESERVED" } });
      if (flipped.count !== 1) throw new Error("UNIT_TAKEN");
      const client = await tx.client.upsert({
        where: { companyId_phone: { companyId: s.companyId, phone } },
        create: { companyId: s.companyId, fullName, phone, idNumber: str(fd, "idNumber") || null, leadId: lead?.id },
        update: { fullName, idNumber: str(fd, "idNumber") || undefined, leadId: lead?.id ?? undefined },
      });
      const r = await tx.reservation.create({
        data: {
          companyId: s.companyId,
          unitId: unit.id,
          clientId: client.id,
          agentId: lead?.ownerId ?? s.userId,
          depositAmount: deposit > 0 ? deposit : 0,
          expiresAt: addDays(new Date(), days),
          note: str(fd, "note") || null,
        },
      });
      if (lead) {
        await tx.lead.update({ where: { id: lead.id }, data: { status: "NEGOTIATION", lastActivityAt: new Date() } });
        await tx.activity.create({
          data: { companyId: s.companyId, leadId: lead.id, userId: s.userId, type: "NOTE", note: `Reserved unit ${unit.code} (${unit.project.name}) for ${days} days` },
        });
      }
      return r;
    });
    await audit(s, "reservation.created", "Reservation", reservation.id, `${unit.project.name} ${unit.code}, ${days} days`);
  } catch (e) {
    if ((e as Error).message === "UNIT_TAKEN" || isUniqueViolation(e))
      back(retry, { error: `Unit ${unit.code} is no longer available. It was reserved or sold by someone else.` });
    throw e;
  }
  redirect(`/reservations?msg=Unit ${unit.code} reserved for ${days} days`);
}

async function loadActive(fd: FormData) {
  const s = await requireSession(["OWNER", "MANAGER", "AGENT"]);
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
  const s = await requireSession(["OWNER", "MANAGER"]);
  const n = await expireReservations(s.companyId);
  back("/reservations", { msg: `${n} reservation(s) expired` });
}
