"use server";

import { redirect } from "next/navigation";
import type { DocumentType, PaymentMethod, PlanType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { back, num, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { NeedsApprovalError, requestPriceApproval } from "@/lib/approvals";
import { createSale } from "@/lib/sales";
import { confirmPayment, rejectPayment, reversePayment, voidPayment } from "@/lib/payments";
import { seesAll, SALES, ACCOUNTS, FINANCE_VIEW, MANAGERS } from "@/lib/permissions";
import { approveCommissionFor, setDealSplits } from "@/lib/commissions";
import { parseDateInput } from "@/lib/format";
import { saveDocument, validFile } from "@/lib/documents";

export async function createDeal(fd: FormData) {
  const s = await requireSession(SALES);
  const reservationId = str(fd, "reservationId");
  const signedAt = parseDateInput(str(fd, "signedAt")) ?? new Date();
  let dealId = "";
  try {
    const deal = await createSale(s, {
      reservationId,
      contractNo: str(fd, "contractNo"),
      price: num(fd, "price"),
      signedAt,
      firstDue: parseDateInput(str(fd, "firstDue")) ?? signedAt,
      plan: {
        type: (str(fd, "planType") || "INSTALLMENT") as PlanType,
        downPct: num(fd, "downPct"),
        months: Math.floor(num(fd, "months") || 0),
        bankName: str(fd, "bankName") || null,
      },
    });
    dealId = deal.id;
  } catch (e) {
    if (e instanceof NeedsApprovalError) {
      try {
        await requestPriceApproval(s, reservationId, num(fd, "price"), str(fd, "priceReason"));
      } catch (e2) {
        if (e2 instanceof RuleError) back(`/deals/new?reservationId=${reservationId}`, { error: e2.message });
        throw e2;
      }
      back("/reservations", { msg: `${e.message} Sent for approval; you can finish the sale once it's approved.` });
    }
    if (e instanceof RuleError) back(`/deals/new?reservationId=${reservationId}`, { error: e.message });
    throw e;
  }
  redirect(`/deals/${dealId}?msg=Sale created`);
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
    const dup = await db.payment.findFirst({ where: { companyId: s.companyId, reference, method, status: { in: ["PENDING", "CONFIRMED"] } } });
    if (dup) back(path, { error: `Reference ${reference} was already recorded on another payment` });
  }
  const file = fd.get("receipt");
  let receiptId: string | null = null;
  try {
    if (validFile(file)) receiptId = (await saveDocument(s, file, "PAYMENT_PROOF", { dealId: deal.id, clientId: deal.clientId })).id;
  } catch (e) {
    back(path, { error: (e as Error).message });
  }
  const p = await db.payment.create({
    data: { companyId: s.companyId, dealId: deal.id, amount, paidAt, method, reference: reference || null, recordedById: s.userId, receiptId },
  });
  await audit(s, "payment.recorded", "Payment", p.id, `${deal.contractNo} ${amount} ${method} ${reference}`);
  back(path, { msg: "Payment recorded. It counts toward the balance once the accountant confirms it." });
}

export async function reviewPayment(fd: FormData) {
  const s = await requireSession(ACCOUNTS);
  const returnTo = str(fd, "returnTo") || "/payments";
  const id = str(fd, "paymentId");
  try {
    if (str(fd, "decision") === "confirm") {
      const p = await confirmPayment(s, id);
      back(returnTo, { msg: `Payment confirmed. Receipt no. ${p.receiptNo} issued.` });
    }
    await rejectPayment(s, id, str(fd, "reason"));
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Payment rejected" });
}

export async function voidPaymentAction(fd: FormData) {
  const s = await requireSession(FINANCE_VIEW);
  const returnTo = str(fd, "returnTo") || "/payments";
  try {
    await voidPayment(s, str(fd, "paymentId"), str(fd, "reason"));
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Payment voided. It stays in the history with your reason." });
}

export async function reversePaymentAction(fd: FormData) {
  const s = await requireSession(ACCOUNTS);
  const returnTo = str(fd, "returnTo") || "/payments";
  try {
    await reversePayment(s, str(fd, "paymentId"), str(fd, "reason"));
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Reversal recorded. The original payment is kept; the balance is updated." });
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
  try {
    await approveCommissionFor(s, deal.id, str(fd, "agentId") || deal.agentId, num(fd, "amount"));
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Commission approved. Mark it paid once the money is sent." });
}

export async function saveSplits(fd: FormData) {
  const { s, deal } = await loadDeal(str(fd, "dealId"), MANAGERS);
  const pcts = fd.getAll("sharePct").map((v) => Number(String(v).trim() || 0));
  const items = fd.getAll("userId").map((v, i) => ({ userId: String(v), sharePct: pcts[i] || 0 })).filter((i) => i.userId);
  try {
    await setDealSplits(s, deal.id, items);
  } catch (e) {
    if (e instanceof RuleError) back(`/deals/${deal.id}`, { error: e.message });
    throw e;
  }
  back(`/deals/${deal.id}`, { msg: "Commission split saved" });
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
    db.deal.update({ where: { id: deal.id }, data: { status: "CANCELLED", cancelReason: reason } }),
    db.unit.update({ where: { id: deal.unitId }, data: { status: "AVAILABLE" } }),
  ]);
  await audit(s, "deal.cancelled", "Deal", deal.id, reason, { before: { status: deal.status, unitStatus: deal.unit.status }, after: { status: "CANCELLED", unitStatus: "AVAILABLE" } });
  back(`/deals/${deal.id}`, { msg: "Deal cancelled; unit released" });
}
