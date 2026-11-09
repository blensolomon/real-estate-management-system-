import { db } from "./db";
import { audit } from "./audit";
import { buildPlanSchedule, tierRate, type PlanInput } from "./finance";
import { seesAll } from "./permissions";
import { RuleError, isUniqueViolation, type Actor } from "./rules";
import { checkPrice } from "./approvals";

export type SaleInput = {
  reservationId: string;
  contractNo: string;
  price: number;
  plan: PlanInput;
  signedAt: Date;
  firstDue: Date;
};

export function validatePlan(price: number, plan: PlanInput) {
  if (!(price > 0)) throw new RuleError("Enter the final price");
  if (!["CASH", "INSTALLMENT", "MORTGAGE"].includes(plan.type)) throw new RuleError("Choose a payment plan");
  if (plan.type !== "CASH" && !(plan.downPct >= 0 && plan.downPct <= 100)) throw new RuleError("Down payment must be 0–100%");
  if (plan.type === "INSTALLMENT" && !(Number.isInteger(plan.months) && plan.months >= 0 && plan.months <= 120)) throw new RuleError("Months must be 0–120");
  if (plan.type === "MORTGAGE" && !(Number.isInteger(plan.months) && plan.months >= 0 && plan.months <= 24)) throw new RuleError("Bank payout month must be 0–24");
}

/** Converts an active reservation into a sale with its payment plan and schedule, in one transaction. */
export async function createSale(actor: Actor, input: SaleInput) {
  const r = await db.reservation.findFirst({
    where: { id: input.reservationId, companyId: actor.companyId, status: "ACTIVE" },
    include: { company: true, unit: { include: { project: { include: { commissionTiers: true } } } } },
  });
  if (!r) throw new RuleError("Active reservation not found (it may have expired)");
  if (!seesAll(actor.role) && r.agentId !== actor.userId) throw new RuleError("Not your reservation");
  if (!input.contractNo.trim()) throw new RuleError("Enter the contract number");
  const plan = { ...input.plan, downPct: input.plan.type === "CASH" ? 100 : input.plan.downPct, months: input.plan.type === "CASH" ? 0 : input.plan.months };
  validatePlan(input.price, plan);
  const listPrice = Number(r.unit.price);
  const priceCheck = await checkPrice(actor, r.id, listPrice, input.price);
  try {
    return await db.$transaction(async (tx) => {
      const flipped = await tx.unit.updateMany({ where: { id: r.unitId, status: "RESERVED" }, data: { status: "SOLD" } });
      if (flipped.count !== 1) throw new RuleError("Unit is not in reserved state");
      await tx.reservation.update({ where: { id: r.id }, data: { status: "CONVERTED", closedAt: new Date() } });
      const deal = await tx.deal.create({
        data: {
          companyId: actor.companyId,
          contractNo: input.contractNo,
          unitId: r.unitId,
          clientId: r.clientId,
          agentId: r.agentId,
          reservationId: r.id,
          price: input.price,
          commissionRate: tierRate(Number(r.unit.project.commissionRate), r.unit.project.commissionTiers, input.price),
          commissionPayablePct: r.company.commissionPayablePct,
          signedAt: input.signedAt,
          plan: { create: { type: plan.type, downPct: plan.downPct, months: plan.months, bankName: plan.bankName || null } },
          installments: { create: buildPlanSchedule(input.price, plan, input.firstDue) },
        },
      });
      if (Number(r.depositAmount) > 0) {
        // The deposit counts toward the price. If the accountant already confirmed it, it arrives confirmed with a receipt number.
        const confirmed = r.depositConfirmedAt
          ? { status: "CONFIRMED" as const, confirmedById: r.depositConfirmedById, confirmedAt: r.depositConfirmedAt, receiptNo: (await tx.company.update({ where: { id: actor.companyId }, data: { receiptSeq: { increment: 1 } } })).receiptSeq }
          : {};
        await tx.payment.create({
          data: { companyId: actor.companyId, dealId: deal.id, amount: r.depositAmount, paidAt: r.depositConfirmedAt ?? r.createdAt, method: "OTHER", reference: r.depositRef ?? `Reservation deposit ${r.id.slice(-6)}`, recordedById: actor.userId, ...confirmed },
        });
      }
      const client = await tx.client.findUnique({ where: { id: r.clientId } });
      if (client?.leadId) await tx.lead.update({ where: { id: client.leadId }, data: { status: "WON", lastActivityAt: new Date() } });
      await audit(actor, "deal.created", "Deal", deal.id, `${input.contractNo} · ${r.unit.project.name} ${r.unit.code} · ${input.price}`, { after: { price: input.price, listPrice, plan: plan.type, discountPct: Number(priceCheck.pct.toFixed(2)), priceApprovalId: priceCheck.approvalId, selfApproved: "selfApproved" in priceCheck } }, tx);
      return deal;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new RuleError("Contract number already used, or the unit already has a sale");
    throw e;
  }
}
