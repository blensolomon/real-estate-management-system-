import type { Installment, Payment, CommissionPayout, PlanType } from "@prisma/client";

export type InstallmentState = {
  id: string;
  seq: number;
  label: string;
  dueDate: Date;
  amount: number;
  paid: number;
  remaining: number;
  overdue: boolean;
  daysOverdue: number;
};

export type DealFinancials = {
  price: number;
  confirmed: number;
  pending: number;
  balance: number;
  overdueAmount: number;
  oldestOverdueDays: number;
  nextDue: InstallmentState | null;
  installments: InstallmentState[];
  aging: AgingBuckets;
};

export type AgingBuckets = { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number };

export const emptyAging = (): AgingBuckets => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 });

/** Applies confirmed payments to installments oldest-first and derives what is owed and overdue. */
export function dealFinancials(
  deal: { price: unknown; installments: Installment[]; payments: Payment[] },
  now = new Date(),
): DealFinancials {
  const price = Number(deal.price);
  const confirmed = sum(deal.payments.filter((p) => p.status === "CONFIRMED").map((p) => Number(p.amount)));
  const pending = sum(deal.payments.filter((p) => p.status === "PENDING").map((p) => Number(p.amount)));
  let pool = confirmed;
  const aging = emptyAging();
  const installments = [...deal.installments]
    .sort((a, b) => a.seq - b.seq)
    .map((i) => {
      const amount = Number(i.amount);
      const paid = Math.min(amount, pool);
      pool -= paid;
      const remaining = round(amount - paid);
      const daysOverdue = remaining > 0 ? Math.max(0, Math.floor((now.getTime() - i.dueDate.getTime()) / 86400000)) : 0;
      const overdue = remaining > 0 && i.dueDate < now && daysOverdue > 0;
      if (remaining > 0) {
        if (!overdue) aging.current += remaining;
        else if (daysOverdue <= 30) aging.d1_30 += remaining;
        else if (daysOverdue <= 60) aging.d31_60 += remaining;
        else if (daysOverdue <= 90) aging.d61_90 += remaining;
        else aging.d90plus += remaining;
      }
      return { id: i.id, seq: i.seq, label: i.label, dueDate: i.dueDate, amount, paid, remaining, overdue, daysOverdue };
    });
  const overdueList = installments.filter((i) => i.overdue);
  return {
    price,
    confirmed,
    pending,
    balance: round(price - confirmed),
    overdueAmount: sum(overdueList.map((i) => i.remaining)),
    oldestOverdueDays: Math.max(0, ...overdueList.map((i) => i.daysOverdue)),
    nextDue: installments.find((i) => i.remaining > 0 && !i.overdue) ?? null,
    installments,
    aging,
  };
}

/** paid = paid out to agent; approved = approved by accountant, awaiting payment. */
export type CommissionState = { total: number; accrued: number; paid: number; approved: number; payable: number; locked: number };

/** Commission is earned on signing but only becomes payable in proportion to confirmed collections. */
export function commissionState(
  deal: { price: unknown; commissionRate: unknown; status: string; commissionPayablePct?: unknown },
  confirmed: number,
  payouts: (Pick<CommissionPayout, "amount"> & { status?: CommissionPayout["status"] })[],
  sharePct = 100,
): CommissionState {
  const price = Number(deal.price);
  const total = deal.status === "CANCELLED" ? 0 : round((price * Number(deal.commissionRate) * sharePct) / 10000);
  const threshold = deal.commissionPayablePct == null ? null : Number(deal.commissionPayablePct);
  // Older sales unlock gradually with collections; newer ones unlock in full once the threshold is confirmed.
  const accrued = price <= 0 ? 0 : threshold == null ? round(total * Math.min(1, confirmed / price)) : confirmed * 100 + 0.001 >= threshold * price ? total : 0;
  const paid = sum(payouts.filter((p) => (p.status ?? "PAID") === "PAID").map((p) => Number(p.amount)));
  const approved = sum(payouts.filter((p) => p.status === "APPROVED").map((p) => Number(p.amount)));
  return { total, accrued, paid, approved, payable: round(Math.max(0, accrued - paid - approved)), locked: round(total - accrued) };
}

/** Rate for a sale price: the highest tier whose fromAmount <= price, else the project's base rate. */
export function tierRate(baseRate: number, tiers: { fromAmount: unknown; rate: unknown }[], price: number) {
  const hit = tiers.filter((t) => Number(t.fromAmount) <= price).sort((a, b) => Number(b.fromAmount) - Number(a.fromAmount))[0];
  return hit ? Number(hit.rate) : baseRate;
}

/** Builds an installment schedule: down payment now, remainder split monthly. */
export function buildSchedule(price: number, downPct: number, months: number, start: Date) {
  const down = round((price * downPct) / 100);
  const rows = [{ seq: 1, label: "Down payment", dueDate: start, amount: down }];
  if (months > 0) {
    const rest = price - down;
    const each = Math.floor((rest / months) * 100) / 100;
    for (let k = 1; k <= months; k++) {
      const due = new Date(start);
      due.setUTCMonth(due.getUTCMonth() + k);
      const amount = k === months ? round(rest - each * (months - 1)) : each;
      rows.push({ seq: k + 1, label: `Installment ${k}`, dueDate: due, amount });
    }
  } else if (down < price) {
    rows.push({ seq: 2, label: "Balance", dueDate: start, amount: round(price - down) });
  }
  return rows;
}

export type PlanInput = { type: PlanType; downPct: number; months: number; bankName?: string | null };

/** Schedule for a sale's payment plan. MORTGAGE: buyer's down payment, then one bank disbursement `months` later. */
export function buildPlanSchedule(price: number, plan: PlanInput, start: Date) {
  if (plan.type === "CASH") return [{ seq: 1, label: "Full payment", dueDate: start, amount: round(price) }];
  if (plan.type === "INSTALLMENT") return buildSchedule(price, plan.downPct, plan.months, start);
  const down = round((price * plan.downPct) / 100);
  const due = new Date(start);
  due.setUTCMonth(due.getUTCMonth() + Math.max(0, plan.months));
  const rows = [];
  if (down > 0) rows.push({ seq: 1, label: "Down payment", dueDate: start, amount: down });
  rows.push({ seq: rows.length + 1, label: plan.bankName ? `Bank loan (${plan.bankName})` : "Bank loan", dueDate: due, amount: round(price - down) });
  return rows;
}

export const sum = (xs: number[]) => round(xs.reduce((a, b) => a + b, 0));
export const round = (n: number) => Math.round(n * 100) / 100;
