import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { canConfirmPayments } from "./permissions";
import { RuleError, type Actor } from "./rules";
import { sum } from "./finance";

const snap = (p: { status: string; amount: Prisma.Decimal | number; receiptNo?: number | null }) => ({
  status: p.status,
  amount: Number(p.amount),
  receiptNo: p.receiptNo ?? null,
});

async function syncDealStatus(tx: Prisma.TransactionClient, dealId: string) {
  const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (deal.status === "CANCELLED") return;
  const confirmed = await tx.payment.findMany({ where: { dealId, status: "CONFIRMED" }, select: { amount: true } });
  const paid = sum(confirmed.map((x) => Number(x.amount)));
  const status = paid >= Number(deal.price) ? "COMPLETED" : "ACTIVE";
  if (status !== deal.status) await tx.deal.update({ where: { id: dealId }, data: { status } });
}

function assertAccountant(actor: Actor) {
  if (!canConfirmPayments(actor.role)) throw new RuleError("Only the accountant can do this");
}

/** Confirms a pending payment and issues the next receipt number for the company. */
export async function confirmPayment(actor: Actor, paymentId: string) {
  assertAccountant(actor);
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findFirst({ where: { id: paymentId, companyId: actor.companyId }, include: { deal: true } });
    if (!p) throw new RuleError("Payment not found");
    if (p.status !== "PENDING") throw new RuleError("Only pending payments can be confirmed");
    const c = await tx.company.update({ where: { id: actor.companyId }, data: { receiptSeq: { increment: 1 } } });
    const done = await tx.payment.update({
      where: { id: p.id },
      data: { status: "CONFIRMED", confirmedById: actor.userId, confirmedAt: new Date(), receiptNo: c.receiptSeq },
    });
    await syncDealStatus(tx, p.dealId);
    await audit(actor, "payment.confirmed", "Payment", p.id, `${p.deal.contractNo} ${p.amount}`, { before: snap(p), after: snap(done) }, tx);
    return done;
  });
}

export async function rejectPayment(actor: Actor, paymentId: string, reason: string) {
  assertAccountant(actor);
  if (!reason.trim()) throw new RuleError("Give a reason for rejecting");
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findFirst({ where: { id: paymentId, companyId: actor.companyId }, include: { deal: true } });
    if (!p || p.status !== "PENDING") throw new RuleError("Pending payment not found");
    const done = await tx.payment.update({
      where: { id: p.id },
      data: { status: "REJECTED", confirmedById: actor.userId, confirmedAt: new Date(), rejectReason: reason },
    });
    await audit(actor, "payment.rejected", "Payment", p.id, `${p.deal.contractNo} ${p.amount}: ${reason}`, { before: snap(p), after: snap(done) }, tx);
    return done;
  });
}

/** Cancels a pending payment that was entered by mistake (kept for history, never deleted). */
export async function voidPayment(actor: Actor, paymentId: string, reason: string) {
  if (!reason.trim()) throw new RuleError("Give a reason for voiding");
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findFirst({ where: { id: paymentId, companyId: actor.companyId }, include: { deal: true } });
    if (!p || p.status !== "PENDING") throw new RuleError("Only pending payments can be voided");
    const own = p.recordedById === actor.userId;
    if (!own && !canConfirmPayments(actor.role)) throw new RuleError("Only the person who recorded it or the accountant can void it");
    const done = await tx.payment.update({ where: { id: p.id }, data: { status: "VOID", voidReason: reason } });
    await audit(actor, "payment.voided", "Payment", p.id, `${p.deal.contractNo} ${p.amount}: ${reason}`, { before: snap(p), after: snap(done) }, tx);
    return done;
  });
}

/** Corrects a confirmed payment with a linked, negative, confirmed entry. The original stays untouched. */
export async function reversePayment(actor: Actor, paymentId: string, reason: string) {
  assertAccountant(actor);
  if (!reason.trim()) throw new RuleError("Give a reason for the reversal");
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findFirst({
      where: { id: paymentId, companyId: actor.companyId },
      include: { deal: true, reversedBy: true },
    });
    if (!p) throw new RuleError("Payment not found");
    if (p.status !== "CONFIRMED" || Number(p.amount) <= 0) throw new RuleError("Only confirmed payments can be reversed");
    if (p.reversedBy) throw new RuleError("This payment was already reversed");
    const rev = await tx.payment.create({
      data: {
        companyId: actor.companyId,
        dealId: p.dealId,
        amount: -Number(p.amount),
        paidAt: new Date(),
        method: p.method,
        status: "CONFIRMED",
        recordedById: actor.userId,
        confirmedById: actor.userId,
        confirmedAt: new Date(),
        reversalOfId: p.id,
        voidReason: reason,
      },
    });
    await syncDealStatus(tx, p.dealId);
    await audit(actor, "payment.reversed", "Payment", p.id, `${p.deal.contractNo} ${p.amount}: ${reason}`, { before: snap(p), after: { reversalId: rev.id, amount: Number(rev.amount) } }, tx);
    return rev;
  });
}
