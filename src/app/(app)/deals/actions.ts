"use server";

import { redirect } from "next/navigation";
import type { DocumentType, PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { back, isUniqueViolation, num, str } from "@/lib/actions-util";
import { canConfirmPayments, seesAll, SALES, ACCOUNTS } from "@/lib/permissions";
import { parseDateInput } from "@/lib/format";
import { buildSchedule, commissionState, sum } from "@/lib/finance";
import { saveDocument, validFile } from "@/lib/documents";

export async function createDeal(fd: FormData) {
  const s = await requireSession(SALES);
  const reservationId = str(fd, "reservationId");
  const retry = `/deals/new?reservationId=${reservationId}`;
  const r = await db.reservation.findFirst({
    where: { id: reservationId, companyId: s.companyId, status: "ACTIVE" },
    include: { unit: { include: { project: true } } },
  });
  if (!r) back("/reservations", { error: "Active reservation not found (it may have expired)" });
  if (!seesAll(s.role) && r.agentId !== s.userId) back("/reservations", { error: "Not your reservation" });
  const price = num(fd, "price");
  const downPct = num(fd, "downPct");
  const months = Math.floor(num(fd, "months"));
  const signedAt = parseDateInput(str(fd, "signedAt")) ?? new Date();
  const firstDue = parseDateInput(str(fd, "firstDue")) ?? signedAt;
  const contractNo = str(fd, "contractNo");
  if (!(price > 0) || !(downPct >= 0 && downPct <= 100) || !(months >= 0 && months <= 120) || !contractNo)
    back(retry, { error: "Check price, down payment %, months and contract number" });

  let dealId = "";
  try {
    dealId = await db.$transaction(async (tx) => {
      const flipped = await tx.unit.updateMany({ where: { id: r.unitId, status: "RESERVED" }, data: { status: "SOLD" } });
      if (flipped.count !== 1) throw new Error("UNIT_STATE");
      await tx.reservation.update({ where: { id: r.id }, data: { status: "CONVERTED", closedAt: new Date() } });
      const deal = await tx.deal.create({
        data: {
          companyId: s.companyId,
          contractNo,
          unitId: r.unitId,
          clientId: r.clientId,
          agentId: r.agentId,
          reservationId: r.id,
          price,
          commissionRate: r.unit.project.commissionRate,
          signedAt,
          installments: { create: buildSchedule(price, downPct, months, firstDue) },
        },
      });
      if (Number(r.depositAmount) > 0) {
        await tx.payment.create({
          data: {
            companyId: s.companyId,
            dealId: deal.id,
            amount: r.depositAmount,
            paidAt: r.createdAt,
            method: "OTHER",
            reference: "Reservation deposit",
            recordedById: s.userId,
          },
        });
      }
      const client = await tx.client.findUnique({ where: { id: r.clientId } });
      if (client?.leadId) await tx.lead.update({ where: { id: client.leadId }, data: { status: "WON", lastActivityAt: new Date() } });
      return deal.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) back(retry, { error: "Contract number already used, or the unit already has a deal" });
    if ((e as Error).message === "UNIT_STATE") back(retry, { error: "Unit is not in reserved state" });
    throw e;
  }
  await audit(s, "deal.created", "Deal", dealId, `${contractNo} · ${r.unit.project.name} ${r.unit.code} · ${price}`);
  redirect(`/deals/${dealId}?msg=Deal created`);
}

async function loadDeal(dealId: string, roles?: Parameters<typeof requireSession>[0]) {
  const s = await requireSession(roles);
  const deal = await db.deal.findFirst({ where: { id: dealId, companyId: s.companyId }, include: { unit: true } });
  if (!deal || (!seesAll(s.role) && deal.agentId !== s.userId)) back("/deals", { error: "Deal not found" });
  return { s, deal };
}

export async function recordPayment(fd: FormData) {
  const { s, deal } = await loadDeal(str(fd, "dealId"));
  const path = `/deals/${deal.id}`;
  const amount = num(fd, "amount");
  const paidAt = parseDateInput(str(fd, "paidAt"));
  if (!(amount > 0) || !paidAt) back(path, { error: "Amount and payment date are required" });
  if (deal.status === "CANCELLED") back(path, { error: "Deal is cancelled" });
  const method = str(fd, "method") as PaymentMethod;
  const reference = str(fd, "reference");
  if (method !== "CASH" && !reference) back(path, { error: "Bank / Telebirr reference is required for non-cash payments" });
  if (reference) {
    const dup = await db.payment.findFirst({ where: { companyId: s.companyId, reference, method, status: { not: "REJECTED" } } });
    if (dup) back(path, { error: `Reference ${reference} was already recorded on another payment` });
  }
  const file = fd.get("receipt");
  let receiptId: string | null = null;
  try {
    if (validFile(file)) receiptId = (await saveDocument(s, file, "RECEIPT", { dealId: deal.id, clientId: deal.clientId })).id;
  } catch (e) {
    back(path, { error: (e as Error).message });
  }
  const p = await db.payment.create({
    data: { companyId: s.companyId, dealId: deal.id, amount, paidAt, method, reference: reference || null, recordedById: s.userId, receiptId },
  });
  await audit(s, "payment.recorded", "Payment", p.id, `${deal.contractNo} ${amount} ${method} ${reference}`);
  back(path, { msg: "Payment recorded. It counts toward the balance once Finance confirms it." });
}

export async function reviewPayment(fd: FormData) {
  const s = await requireSession(ACCOUNTS);
  const returnTo = str(fd, "returnTo") || "/payments";
  const p = await db.payment.findFirst({ where: { id: str(fd, "paymentId"), companyId: s.companyId, status: "PENDING" }, include: { deal: true } });
  if (!p) back(returnTo, { error: "Pending payment not found" });
  if (!canConfirmPayments(s.role)) back(returnTo, { error: "Not allowed" });
  const decision = str(fd, "decision");
  if (decision === "confirm") {
    const receiptNo = await db.$transaction(async (tx) => {
      const c = await tx.company.update({ where: { id: s.companyId }, data: { receiptSeq: { increment: 1 } } });
      await tx.payment.update({ where: { id: p.id }, data: { status: "CONFIRMED", confirmedById: s.userId, confirmedAt: new Date(), receiptNo: c.receiptSeq } });
      return c.receiptSeq;
    });
    const all = await db.payment.findMany({ where: { dealId: p.dealId, status: "CONFIRMED" } });
    if (sum(all.map((x) => Number(x.amount))) >= Number(p.deal.price) && p.deal.status === "ACTIVE")
      await db.deal.update({ where: { id: p.dealId }, data: { status: "COMPLETED" } });
    await audit(s, "payment.confirmed", "Payment", p.id, `${p.deal.contractNo} ${p.amount}`);
    back(returnTo, { msg: `Payment confirmed. Receipt no. ${receiptNo} issued.` });
  }
  const reason = str(fd, "reason");
  if (!reason) back(returnTo, { error: "Give a reason for rejecting" });
  await db.payment.update({ where: { id: p.id }, data: { status: "REJECTED", confirmedById: s.userId, confirmedAt: new Date(), rejectReason: reason } });
  await audit(s, "payment.rejected", "Payment", p.id, `${p.deal.contractNo} ${p.amount}: ${reason}`);
  back(returnTo, { msg: "Payment rejected" });
}

export async function uploadDealDocument(fd: FormData) {
  const { s, deal } = await loadDeal(str(fd, "dealId"));
  const path = `/deals/${deal.id}`;
  const file = fd.get("file");
  if (!validFile(file)) back(path, { error: "Choose a file" });
  try {
    await saveDocument(s, file, str(fd, "type") as DocumentType, { dealId: deal.id, clientId: deal.clientId });
  } catch (e) {
    back(path, { error: (e as Error).message });
  }
  await audit(s, "document.uploaded", "Deal", deal.id, file.name);
  back(path, { msg: "Document uploaded" });
}

export async function approveCommission(fd: FormData) {
  const { s, deal } = await loadDeal(str(fd, "dealId"), ACCOUNTS);
  const returnTo = str(fd, "returnTo") || `/deals/${deal.id}`;
  const amount = num(fd, "amount");
  const [payments, payouts] = await Promise.all([
    db.payment.findMany({ where: { dealId: deal.id, status: "CONFIRMED" } }),
    db.commissionPayout.findMany({ where: { dealId: deal.id } }),
  ]);
  const c = commissionState(deal, sum(payments.map((p) => Number(p.amount))), payouts);
  if (!(amount > 0) || amount > c.payable + 0.001) back(returnTo, { error: `Amount must be between 0 and the payable ${c.payable}` });
  await db.commissionPayout.create({
    data: { companyId: s.companyId, agentId: deal.agentId, dealId: deal.id, amount, approvedById: s.userId },
  });
  await audit(s, "commission.approved", "Deal", deal.id, `${amount}`);
  back(returnTo, { msg: "Commission approved. Mark it paid once the money is sent." });
}

export async function markCommissionPaid(fd: FormData) {
  const s = await requireSession(ACCOUNTS);
  const returnTo = str(fd, "returnTo") || "/commissions";
  const p = await db.commissionPayout.findFirst({ where: { id: str(fd, "payoutId"), companyId: s.companyId, status: "APPROVED" } });
  if (!p) back(returnTo, { error: "Approved commission not found" });
  await db.commissionPayout.update({ where: { id: p.id }, data: { status: "PAID", paidById: s.userId, paidAt: new Date(), reference: str(fd, "reference") || null } });
  await audit(s, "commission.paid", "CommissionPayout", p.id, `${p.amount}`);
  back(returnTo, { msg: "Commission marked as paid" });
}

export async function cancelDeal(fd: FormData) {
  const { s, deal } = await loadDeal(str(fd, "dealId"), ["OWNER"]);
  const reason = str(fd, "reason");
  if (!reason) back(`/deals/${deal.id}`, { error: "Reason required" });
  await db.$transaction([
    db.deal.update({ where: { id: deal.id }, data: { status: "CANCELLED" } }),
    db.unit.update({ where: { id: deal.unitId }, data: { status: "AVAILABLE" } }),
  ]);
  await audit(s, "deal.cancelled", "Deal", deal.id, reason);
  back(`/deals/${deal.id}`, { msg: "Deal cancelled; unit released" });
}
