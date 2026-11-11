"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { back, num, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { canManage, seesAll } from "@/lib/permissions";
import { addDays } from "@/lib/format";
import { cancelReservation as cancelReservationRule, confirmDeposit, expireReservations, reserveUnit } from "@/lib/reservations";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function createReservation(fd: FormData) {
  // Guard: Check permission to create reservations (using CREATE_DEAL permission as reservations lead to deals)
  const guard = await guardCompanyAction("CREATE_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
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
    await logCompanyAudit(s.companyId, s.userId, "CREATE_DEAL", "Reservation", unit.id, `Unit reserved: ${unit.code}, ${days} days, deposit: ${num(fd, "depositAmount")}`);
  } catch (e) {
    if (e instanceof RuleError) back(`/reservations/new?unitId=${unitId}&leadId=${leadId}`, { error: e.message });
    throw e;
  }
  redirect(`/reservations?msg=${encodeURIComponent(msg)}`);
}

export async function cancelReservation(fd: FormData) {
  // Guard: Check permission to delete deals (reservations are deleted when cancelled)
  const guard = await guardCompanyAction("DELETE_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  let code = "";
  try {
    const result = await cancelReservationRule(s, str(fd, "id"), str(fd, "reason"));
    code = result.unit.code;
    await logCompanyAudit(s.companyId, s.userId, "DELETE_DEAL", "Reservation", str(fd, "id"), `Reservation cancelled for ${code}: ${str(fd, "reason")}`);
  } catch (e) {
    if (e instanceof RuleError) back("/reservations", { error: e.message });
    throw e;
  }
  back("/reservations", { msg: `Reservation for ${code} cancelled; unit is available again` });
}

export async function confirmDepositAction(fd: FormData) {
  // Guard: Check permission to confirm payments
  const guard = await guardCompanyAction("CONFIRM_PAYMENT");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const reservationId = str(fd, "id");
  const reference = str(fd, "reference");
  try {
    await confirmDeposit(s, reservationId, reference);
    await logCompanyAudit(s.companyId, s.userId, "CONFIRM_PAYMENT", "Reservation", reservationId, `Deposit confirmed. Reference: ${reference}`);
  } catch (e) {
    if (e instanceof RuleError) back("/payments", { error: e.message });
    throw e;
  }
  back("/payments", { msg: "Deposit confirmed. The unit stays held even after the reservation date passes." });
}

export async function extendReservation(fd: FormData) {
  // Guard: Check permission to edit deals (extending is an edit operation)
  const guard = await guardCompanyAction("EDIT_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const reservationId = str(fd, "id");
  const r = await db.reservation.findFirst({
    where: { id: reservationId, companyId: s.companyId, status: "ACTIVE" },
    include: { unit: true },
  });
  if (!r || (!seesAll(s.role) && r.agentId !== s.userId)) back("/reservations", { error: "Active reservation not found" });
  
  if (!canManage(s.role)) back("/reservations", { error: "Only managers can extend reservations" });
  const days = Math.min(30, Math.max(1, Math.floor(num(fd, "days") || 0)));
  await db.reservation.update({ where: { id: r.id }, data: { expiresAt: addDays(r.expiresAt, days) } });
  await logCompanyAudit(s.companyId, s.userId, "EDIT_DEAL", "Reservation", r.id, `Extended by ${days} days. Unit: ${r.unit.code}`);
  back("/reservations", { msg: `Extended ${r.unit.code} by ${days} days` });
}

export async function runExpiry() {
  // Guard: Check permission to edit deals
  const guard = await guardCompanyAction("EDIT_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const n = await expireReservations(s.companyId);
  await logCompanyAudit(s.companyId, s.userId, "EDIT_DEAL", "Reservation", "", `Expiry check run. ${n} reservation(s) expired.`);
  back("/reservations", { msg: `${n} reservation(s) expired` });
}
