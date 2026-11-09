import { db } from "./db";
import { dealFinancials, round } from "./finance";
import { RuleError, type Actor } from "./rules";

export type PenaltyRule = { graceDays: number; pctPerMonth: number; capPct: number | null };

/** Months of penalty owed for an installment that is `daysOverdue` late: month 1 starts the day after the grace period. */
export function penaltyMonths(daysOverdue: number, graceDays: number) {
  return daysOverdue > graceDays ? Math.floor((daysOverdue - graceDays - 1) / 30) + 1 : 0;
}

/** New penalty rows for one installment. Simple, not compounding: each month is pct of the amount still late, capped at capPct of the installment. */
export function newPenalties(inst: { amount: number; remaining: number; daysOverdue: number }, existing: { monthNo: number; amount: number }[], rule: PenaltyRule) {
  const months = penaltyMonths(inst.daysOverdue, rule.graceDays);
  let charged = existing.reduce((a, p) => a + p.amount, 0);
  const cap = rule.capPct == null ? Infinity : round((inst.amount * rule.capPct) / 100);
  const have = new Set(existing.map((p) => p.monthNo));
  const out: { monthNo: number; amount: number }[] = [];
  for (let m = 1; m <= months; m++) {
    if (have.has(m)) continue;
    const amount = round(Math.min((inst.remaining * rule.pctPerMonth) / 100, cap - charged));
    if (amount <= 0) break;
    charged += amount;
    out.push({ monthNo: m, amount });
  }
  return out;
}

/** Daily: add any penalty months now owed, for companies that switched penalties on. Safe to run repeatedly. */
export async function runPenalties(now = new Date(), companyId?: string) {
  const companies = await db.company.findMany({ where: { penaltyEnabled: true, active: true, ...(companyId ? { id: companyId } : {}) } });
  let created = 0;
  for (const c of companies) {
    const rule = { graceDays: c.penaltyGraceDays, pctPerMonth: Number(c.penaltyPctPerMonth), capPct: c.penaltyCapPct == null ? null : Number(c.penaltyCapPct) };
    if (!(rule.pctPerMonth > 0)) continue;
    const deals = await db.deal.findMany({ where: { companyId: c.id, status: "ACTIVE" }, include: { installments: true, payments: true, penalties: true } });
    for (const d of deals) {
      for (const i of dealFinancials(d, now).installments.filter((x) => x.overdue)) {
        const rows = newPenalties(i, d.penalties.filter((p) => p.installmentId === i.id).map((p) => ({ monthNo: p.monthNo, amount: Number(p.amount) })), rule);
        if (!rows.length) continue;
        const r = await db.penalty.createMany({ data: rows.map((p) => ({ companyId: c.id, dealId: d.id, installmentId: i.id, ...p })), skipDuplicates: true });
        created += r.count;
      }
    }
  }
  return { companies: companies.length, created };
}

/** Owner/Accountant: waive (reason required) or mark collected (reference required). Only open penalties. */
export async function decidePenalty(actor: Actor, penaltyId: string, action: "WAIVE" | "COLLECT", note: string) {
  if (actor.role !== "OWNER" && actor.role !== "ACCOUNTANT") throw new RuleError("Only the Accountant or Owner can waive or collect penalties");
  if (!note.trim()) throw new RuleError(action === "WAIVE" ? "Give a reason for waiving" : "Enter the payment reference");
  const p = await db.penalty.findFirst({ where: { id: penaltyId, companyId: actor.companyId } });
  if (!p) throw new RuleError("Penalty not found");
  const res = await db.penalty.updateMany({
    where: { id: p.id, status: "OPEN" },
    data: action === "WAIVE" ? { status: "WAIVED", reason: note.trim(), decidedById: actor.userId, decidedAt: new Date() } : { status: "COLLECTED", reference: note.trim(), decidedById: actor.userId, decidedAt: new Date() },
  });
  if (res.count !== 1) throw new RuleError("This penalty is already settled");
  await db.auditLog.create({ data: { companyId: actor.companyId, userId: actor.userId, action: action === "WAIVE" ? "penalty.waived" : "penalty.collected", entity: "Deal", entityId: p.dealId, detail: `${p.amount} (month ${p.monthNo}): ${note.trim()}` } });
}
