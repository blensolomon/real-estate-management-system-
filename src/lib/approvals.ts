import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { canManage } from "./permissions";
import { RuleError, type Actor } from "./rules";

const cents = (n: number) => Math.round(n * 100);

export class NeedsApprovalError extends RuleError {
  constructor(public pctBelow: number, public limitPct: number) {
    super(`This price is ${pctBelow.toFixed(1)}% below list (limit ${limitPct}%). It needs Sales Manager or Owner approval.`);
  }
}

export function discountPct(listPrice: number, price: number) {
  return listPrice > 0 ? ((listPrice - price) / listPrice) * 100 : 0;
}

/**
 * Throws NeedsApprovalError when `price` is more than the company limit below list and no approval covers it.
 * Sales Managers and Owners approve their own prices; that is recorded in the sale's audit entry.
 */
export async function checkPrice(actor: Actor, reservationId: string, listPrice: number, price: number, tx: Prisma.TransactionClient = db) {
  const company = await tx.company.findUniqueOrThrow({ where: { id: actor.companyId }, select: { discountApprovalPct: true } });
  const limit = Number(company.discountApprovalPct);
  const pct = discountPct(listPrice, price);
  if (cents(price) >= cents(listPrice * (1 - limit / 100))) return { needed: false, pct, approvalId: null as string | null };
  if (canManage(actor.role)) return { needed: true, pct, approvalId: null, selfApproved: true };
  const ok = await tx.priceApproval.findFirst({
    where: { companyId: actor.companyId, reservationId, status: "APPROVED", price: { lte: price } },
    orderBy: { decidedAt: "desc" },
  });
  if (!ok) throw new NeedsApprovalError(pct, limit);
  return { needed: true, pct, approvalId: ok.id };
}

export async function requestPriceApproval(actor: Actor, reservationId: string, price: number, reason: string) {
  const r = await db.reservation.findFirst({ where: { id: reservationId, companyId: actor.companyId, status: "ACTIVE" }, include: { unit: true } });
  if (!r) throw new RuleError("Active reservation not found");
  if (!canManage(actor.role) && r.agentId !== actor.userId) throw new RuleError("Not your reservation");
  if (!(price > 0)) throw new RuleError("Enter the final price");
  const open = await db.priceApproval.findFirst({ where: { reservationId, status: "PENDING" } });
  if (open) throw new RuleError("A price approval for this reservation is already waiting");
  return db.$transaction(async (tx) => {
    const a = await tx.priceApproval.create({
      data: { companyId: actor.companyId, reservationId, listPrice: r.unit.price, price, reason: reason || null, requestedById: actor.userId },
    });
    await audit(actor, "price.approval_requested", "PriceApproval", a.id, `${r.unit.code}: ${r.unit.price} → ${price}`, { after: { listPrice: Number(r.unit.price), price } }, tx);
    return a;
  });
}

export async function decidePriceApproval(actor: Actor, id: string, approve: boolean, note: string) {
  if (!canManage(actor.role)) throw new RuleError("Only the Sales Manager or Owner can decide prices");
  const a = await db.priceApproval.findFirst({ where: { id, companyId: actor.companyId } });
  if (!a) throw new RuleError("Approval not found");
  if (a.status !== "PENDING") throw new RuleError("Already decided");
  if (!approve && !note.trim()) throw new RuleError("Give a reason for rejecting");
  return db.$transaction(async (tx) => {
    const updated = await tx.priceApproval.updateMany({
      where: { id, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date(), decisionNote: note.trim() || null },
    });
    if (updated.count !== 1) throw new RuleError("Already decided");
    await audit(actor, approve ? "price.approved" : "price.rejected", "PriceApproval", id, `${a.listPrice} → ${a.price}`, { before: { status: "PENDING" }, after: { status: approve ? "APPROVED" : "REJECTED", price: Number(a.price), note } }, tx);
    return tx.priceApproval.findUniqueOrThrow({ where: { id } });
  });
}
