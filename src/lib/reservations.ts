import { db } from "./db";
import { addDays } from "./format";
import { RuleError, isUniqueViolation, type Actor } from "./rules";
import { canManage, seesAll } from "./permissions";
import { audit } from "./audit";

/** Expires overdue reservations without a confirmed deposit and frees their units. Safe to call often. */
export async function expireReservations(companyId?: string) {
  const now = new Date();
  const due = await db.reservation.findMany({
    // A confirmed deposit keeps the unit held after expiry until a manager extends, converts or cancels.
    where: { status: "ACTIVE", expiresAt: { lt: now }, depositConfirmedAt: null, ...(companyId ? { companyId } : {}) },
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

export type ReserveInput = {
  unitId: string;
  fullName: string;
  phone: string;
  idNumber?: string;
  leadId?: string;
  days?: number;
  deposit?: number;
  note?: string;
};

/**
 * Reserves an AVAILABLE unit. The conditional update inside the transaction is the lock:
 * only one concurrent request can flip AVAILABLE -> RESERVED; a partial unique index backs it up.
 */
export async function reserveUnit(actor: Actor, input: ReserveInput) {
  const company = await db.company.findUniqueOrThrow({ where: { id: actor.companyId } });
  const unit = await db.unit.findFirst({ where: { id: input.unitId, companyId: actor.companyId }, include: { project: true } });
  if (!unit) throw new RuleError("Choose a unit");
  const phone = input.phone.replace(/\s+/g, "");
  if (!input.fullName.trim() || !phone) throw new RuleError("Buyer name and phone are required");
  const lead = input.leadId ? await db.lead.findFirst({ where: { id: input.leadId, companyId: actor.companyId } }) : null;
  if (input.leadId && !lead) throw new RuleError("Lead not found");
  if (lead && !seesAll(actor.role) && lead.ownerId !== actor.userId) throw new RuleError("Not your lead");
  const days = canManage(actor.role) && input.days && input.days > 0 ? Math.min(90, Math.floor(input.days)) : company.reservationDays;
  const deposit = input.deposit && input.deposit > 0 ? input.deposit : 0;
  try {
    return await db.$transaction(async (tx) => {
      const flipped = await tx.unit.updateMany({ where: { id: unit.id, companyId: actor.companyId, status: "AVAILABLE" }, data: { status: "RESERVED" } });
      if (flipped.count !== 1) throw new RuleError(`Unit ${unit.code} is no longer available. It was reserved or sold by someone else.`);
      const client = await tx.client.upsert({
        where: { companyId_phone: { companyId: actor.companyId, phone } },
        create: { companyId: actor.companyId, fullName: input.fullName, phone, idNumber: input.idNumber || null, leadId: lead?.id },
        update: { fullName: input.fullName, idNumber: input.idNumber || undefined, leadId: lead?.id ?? undefined },
      });
      const r = await tx.reservation.create({
        data: {
          companyId: actor.companyId,
          unitId: unit.id,
          clientId: client.id,
          agentId: lead?.ownerId ?? actor.userId,
          depositAmount: deposit,
          expiresAt: addDays(new Date(), days),
          note: input.note || null,
        },
      });
      if (lead) {
        await tx.lead.update({ where: { id: lead.id }, data: { status: "NEGOTIATION", lastActivityAt: new Date() } });
        await tx.activity.create({
          data: { companyId: actor.companyId, leadId: lead.id, userId: actor.userId, type: "NOTE", note: `Reserved unit ${unit.code} (${unit.project.name}) for ${days} days` },
        });
      }
      await audit(actor, "reservation.created", "Reservation", r.id, `${unit.project.name} ${unit.code}, ${days} days`, { after: { unitStatus: "RESERVED", deposit } }, tx);
      return { reservation: r, unit, days };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new RuleError(`Unit ${unit.code} is no longer available. It was reserved or sold by someone else.`);
    throw e;
  }
}

export const isHeld = (r: { status: string; expiresAt: Date; depositConfirmedAt: Date | null }, now = new Date()) =>
  r.status === "ACTIVE" && !!r.depositConfirmedAt && r.expiresAt < now;

/** Accountant confirms the reservation deposit against the bank record. */
export async function confirmDeposit(actor: Actor, reservationId: string, reference: string) {
  if (actor.role !== "ACCOUNTANT" && actor.role !== "OWNER") throw new RuleError("Only the accountant can confirm deposits");
  const r = await db.reservation.findFirst({ where: { id: reservationId, companyId: actor.companyId, status: "ACTIVE" }, include: { unit: true } });
  if (!r) throw new RuleError("Active reservation not found");
  if (!(Number(r.depositAmount) > 0)) throw new RuleError("This reservation has no deposit");
  if (r.depositConfirmedAt) throw new RuleError("Deposit already confirmed");
  if (!reference.trim()) throw new RuleError("Enter the bank / Telebirr reference");
  return db.$transaction(async (tx) => {
    const n = await tx.reservation.updateMany({ where: { id: r.id, status: "ACTIVE", depositConfirmedAt: null }, data: { depositConfirmedAt: new Date(), depositConfirmedById: actor.userId, depositRef: reference.trim() } });
    if (n.count !== 1) throw new RuleError("Deposit already confirmed");
    await audit(actor, "reservation.deposit_confirmed", "Reservation", r.id, `${r.unit.code} · ${r.depositAmount} · ${reference.trim()}`, { after: { depositAmount: Number(r.depositAmount), reference: reference.trim() } }, tx);
  });
}

/** Cancels an active reservation. A confirmed deposit means only a manager can cancel, with a reason; refunds happen outside the system. */
export async function cancelReservation(actor: Actor, reservationId: string, reason: string) {
  const r = await db.reservation.findFirst({ where: { id: reservationId, companyId: actor.companyId, status: "ACTIVE" }, include: { unit: true } });
  if (!r || (!seesAll(actor.role) && r.agentId !== actor.userId)) throw new RuleError("Active reservation not found");
  if (r.depositConfirmedAt && !canManage(actor.role)) throw new RuleError("The deposit is confirmed; only the Sales Manager or Owner can cancel");
  if (r.depositConfirmedAt && !reason.trim()) throw new RuleError("Give a reason (the deposit is confirmed)");
  await db.$transaction(async (tx) => {
    await tx.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED", closedAt: new Date(), note: reason.trim() || r.note } });
    await tx.unit.updateMany({ where: { id: r.unitId, status: "RESERVED" }, data: { status: "AVAILABLE" } });
    await audit(actor, "reservation.cancelled", "Reservation", r.id, `${r.unit.code} ${reason}`, { before: { status: "ACTIVE", depositConfirmed: !!r.depositConfirmedAt }, after: { status: "CANCELLED" } }, tx);
  });
  return r;
}
