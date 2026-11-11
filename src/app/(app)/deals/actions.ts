"use server";

import { redirect } from "next/navigation";
import type { DocumentType, PaymentMethod, PlanType } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { back, num, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { NeedsApprovalError, requestPriceApproval } from "@/lib/approvals";
import { createSale } from "@/lib/sales";
import { confirmPayment, rejectPayment, reversePayment, voidPayment } from "@/lib/payments";
import { seesAll } from "@/lib/permissions";
import { approveCommissionFor, setDealSplits } from "@/lib/commissions";
import { decidePenalty } from "@/lib/penalties";
import { parseDateInput } from "@/lib/format";
import { saveDocument, validFile } from "@/lib/documents";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function createDeal(fd: FormData) {
  // Guard: Check permission to create deals
  const guard = await guardCompanyAction("CREATE_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
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
    
    // Audit log
    await logCompanyAudit(s.companyId, s.userId, "CREATE_DEAL", "Deal", deal.id, `Created deal: ${str(fd, "contractNo")}`);
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

export async function recordPayment(fd: FormData) {
  // Guard: Check permission to record payments
  const guard = await guardCompanyAction("RECORD_PAYMENT");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const dealId = str(fd, "dealId");
  const deal = await db.deal.findFirst({ where: { id: dealId, companyId: s.companyId } });
  if (!deal) back("/deals", { error: "Deal not found" });
  
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
  await logCompanyAudit(s.companyId, s.userId, "RECORD_PAYMENT", "Payment", p.id, `Payment recorded: ${deal.contractNo} ${amount} ${method}`);
  back(path, { msg: "Payment recorded. It counts toward the balance once the accountant confirms it." });
}

export async function reviewPayment(fd: FormData) {
  // Guard: Check permission to confirm payments
  const guard = await guardCompanyAction("CONFIRM_PAYMENT");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const returnTo = str(fd, "returnTo") || "/payments";
  const id = str(fd, "paymentId");
  try {
    if (str(fd, "decision") === "confirm") {
      const p = await confirmPayment(s, id);
      await logCompanyAudit(s.companyId, s.userId, "CONFIRM_PAYMENT", "Payment", p.id, `Payment confirmed. Receipt ${p.receiptNo} issued.`);
      back(returnTo, { msg: `Payment confirmed. Receipt no. ${p.receiptNo} issued.` });
    }
    await rejectPayment(s, id, str(fd, "reason"));
    await logCompanyAudit(s.companyId, s.userId, "CONFIRM_PAYMENT", "Payment", id, `Payment rejected: ${str(fd, "reason")}`);
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Payment rejected" });
}

export async function voidPaymentAction(fd: FormData) {
  // Guard: Check permission to void payments
  const guard = await guardCompanyAction("VOID_PAYMENT");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const returnTo = str(fd, "returnTo") || "/payments";
  try {
    const paymentId = str(fd, "paymentId");
    const reason = str(fd, "reason");
    await voidPayment(s, paymentId, reason);
    await logCompanyAudit(s.companyId, s.userId, "VOID_PAYMENT", "Payment", paymentId, `Payment voided: ${reason}`);
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Payment voided. It stays in the history with your reason." });
}

export async function reversePaymentAction(fd: FormData) {
  // Guard: Check permission to reverse payments
  const guard = await guardCompanyAction("REVERSE_PAYMENT");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const returnTo = str(fd, "returnTo") || "/payments";
  try {
    const paymentId = str(fd, "paymentId");
    const reason = str(fd, "reason");
    await reversePayment(s, paymentId, reason);
    await logCompanyAudit(s.companyId, s.userId, "REVERSE_PAYMENT", "Payment", paymentId, `Payment reversed: ${reason}`);
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Reversal recorded. The original payment is kept; the balance is updated." });
}

export async function uploadDealDocument(fd: FormData) {
  // Guard: Check permission to edit deals
  const guard = await guardCompanyAction("EDIT_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const dealId = str(fd, "dealId");
  const deal = await db.deal.findFirst({ where: { id: dealId, companyId: s.companyId } });
  if (!deal) back("/deals", { error: "Deal not found" });
  
  const path = `/deals/${deal.id}`;
  const file = fd.get("file");
  if (!validFile(file)) back(path, { error: "Choose a file" });
  try {
    const doc = await saveDocument(s, file, str(fd, "type") as DocumentType, { dealId: deal.id, clientId: deal.clientId });
    await logCompanyAudit(s.companyId, s.userId, "EDIT_DEAL", "Deal", deal.id, `Document uploaded: ${file.name}`);
  } catch (e) {
    back(path, { error: (e as Error).message });
  }
  back(path, { msg: "Document uploaded" });
}

export async function approveCommission(fd: FormData) {
  // Guard: Check permission to approve payouts
  const guard = await guardCompanyAction("APPROVE_PAYOUT");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const dealId = str(fd, "dealId");
  const deal = await db.deal.findFirst({ where: { id: dealId, companyId: s.companyId }, include: { unit: true } });
  if (!deal || (!seesAll(s.role) && deal.agentId !== s.userId)) back("/deals", { error: "Deal not found" });
  
  const returnTo = str(fd, "returnTo") || `/deals/${deal.id}`;
  const agentId = str(fd, "agentId") || deal.agentId;
  const amount = num(fd, "amount");
  try {
    await approveCommissionFor(s, deal.id, agentId, amount);
    await logCompanyAudit(s.companyId, s.userId, "APPROVE_PAYOUT", "Deal", deal.id, `Commission approved for agent ${agentId}: ${amount}`);
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg: "Commission approved. Mark it paid once the money is sent." });
}

export async function saveSplits(fd: FormData) {
  // Guard: Check permission to edit deals
  const guard = await guardCompanyAction("EDIT_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const dealId = str(fd, "dealId");
  const deal = await db.deal.findFirst({ where: { id: dealId, companyId: s.companyId } });
  if (!deal) back("/deals", { error: "Deal not found" });
  
  const pcts = fd.getAll("sharePct").map((v) => Number(String(v).trim() || 0));
  const items = fd.getAll("userId").map((v, i) => ({ userId: String(v), sharePct: pcts[i] || 0 })).filter((i) => i.userId);
  try {
    await setDealSplits(s, deal.id, items);
    await logCompanyAudit(s.companyId, s.userId, "EDIT_DEAL", "Deal", deal.id, `Commission splits updated: ${items.length} agents`);
  } catch (e) {
    if (e instanceof RuleError) back(`/deals/${deal.id}`, { error: e.message });
    throw e;
  }
  back(`/deals/${deal.id}`, { msg: "Commission split saved" });
}

export async function markCommissionPaid(fd: FormData) {
  // Guard: Check permission to process payouts
  const guard = await guardCompanyAction("PROCESS_PAYOUT");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const returnTo = str(fd, "returnTo") || "/commissions";
  const payoutId = str(fd, "payoutId");
  const p = await db.commissionPayout.findFirst({ where: { id: payoutId, companyId: s.companyId, status: "APPROVED" } });
  if (!p) back(returnTo, { error: "Approved commission not found" });
  
  await db.commissionPayout.update({ where: { id: p.id }, data: { status: "PAID", paidById: s.userId, paidAt: new Date(), reference: str(fd, "reference") || null } });
  await logCompanyAudit(s.companyId, s.userId, "PROCESS_PAYOUT", "CommissionPayout", p.id, `Commission paid: ${p.amount}, Reference: ${str(fd, "reference") || "N/A"}`);
  back(returnTo, { msg: "Commission marked as paid" });
}

export async function cancelDeal(fd: FormData) {
  // Guard: Check permission to delete deals
  const guard = await guardCompanyAction("DELETE_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const dealId = str(fd, "dealId");
  const deal = await db.deal.findFirst({ where: { id: dealId, companyId: s.companyId }, include: { unit: true } });
  if (!deal) back("/deals", { error: "Deal not found" });
  
  const reason = str(fd, "reason");
  if (!reason) back(`/deals/${deal.id}`, { error: "Reason required" });
  
  await db.$transaction([
    db.deal.update({ where: { id: deal.id }, data: { status: "CANCELLED", cancelReason: reason } }),
    db.unit.update({ where: { id: deal.unitId }, data: { status: "AVAILABLE" } }),
  ]);
  await logCompanyAudit(s.companyId, s.userId, "DELETE_DEAL", "Deal", deal.id, `Deal cancelled: ${reason}. Unit ${deal.unit.code} released.`);
  back(`/deals/${deal.id}`, { msg: "Deal cancelled; unit released" });
}

export async function decidePenaltyAction(fd: FormData) {
  // Guard: Check permission to decide on penalties
  const guard = await guardCompanyAction("DECIDE_PENALTY");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const dealId = str(fd, "dealId");
  const action = str(fd, "action") === "COLLECT" ? "COLLECT" : "WAIVE";
  const penaltyId = str(fd, "penaltyId");
  const note = str(fd, "note");
  
  try {
    await decidePenalty(s, penaltyId, action, note);
    await logCompanyAudit(s.companyId, s.userId, "DECIDE_PENALTY", "Penalty", penaltyId, `Penalty ${action}: ${note}`);
  } catch (e) {
    if (e instanceof RuleError) back(`/deals/${dealId}`, { error: e.message });
    throw e;
  }
  back(`/deals/${dealId}`, { msg: action === "WAIVE" ? "Penalty waived" : "Penalty marked collected" });
}
