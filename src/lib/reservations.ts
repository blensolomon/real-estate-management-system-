import { db } from "./db";

/** Expires overdue reservations and frees their units. Safe to call often. */
export async function expireReservations(companyId?: string) {
  const now = new Date();
  const due = await db.reservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: now }, ...(companyId ? { companyId } : {}) },
    select: { id: true, unitId: true, companyId: true },
  });
  for (const r of due) {
    await db.$transaction([
      db.reservation.update({ where: { id: r.id }, data: { status: "EXPIRED", closedAt: now } }),
      db.unit.updateMany({ where: { id: r.unitId, status: "RESERVED" }, data: { status: "AVAILABLE" } }),
      db.auditLog.create({
        data: { companyId: r.companyId, action: "reservation.expired", entity: "Reservation", entityId: r.id },
      }),
    ]);
  }
  return due.length;
}
