import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { commissionState, dealFinancials } from "./finance";
import { notify } from "./notifications";
import { RuleError, type Actor } from "./rules";
import { seesAll } from "./permissions";
import type { Session } from "./session";

export type CommissionsSP = { agent?: string; q?: string; show?: string; msg?: string; error?: string };

export async function loadCommissions(s: Session, sp: CommissionsSP) {
  const agentFilter = seesAll(s.role) ? sp.agent : s.userId;
  const and: Prisma.DealWhereInput[] = [{ companyId: s.companyId }];
  if (agentFilter) and.push({ OR: [{ agentId: agentFilter }, { splits: { some: { userId: agentFilter } } }] });
  if (sp.q) and.push({ OR: [{ contractNo: { contains: sp.q, mode: "insensitive" } }, { client: { fullName: { contains: sp.q, mode: "insensitive" } } }, { unit: { code: { contains: sp.q, mode: "insensitive" } } }] });
  const deals = await db.deal.findMany({
    where: { AND: and },
    include: { installments: true, payments: true, payouts: { include: { approvedBy: true } }, agent: true, client: true, unit: { include: { project: true } }, splits: { include: { user: true } } },
    orderBy: { signedAt: "desc" },
  });
  let rows = deals.flatMap((d) => {
    const confirmed = dealFinancials(d).confirmed;
    return earnersOf(d)
      .filter((e) => !agentFilter || e.userId === agentFilter)
      .map((e) => {
        const u = e.userId === d.agentId ? d.agent : d.splits.find((x) => x.userId === e.userId)!.user;
        const earner = { id: u.id, name: u.name, external: u.external, sharePct: e.sharePct };
        return { d, earner, c: commissionState(d, confirmed, d.payouts.filter((p) => p.agentId === e.userId), e.sharePct) };
      });
  });
  if (sp.show === "payable") rows = rows.filter((r) => r.c.payable > 0);
  return { agentFilter, rows };
}

type SplitDeal = { agentId: string; splits?: { userId: string; sharePct: unknown }[] };

/** Who earns a share of a deal's commission. No splits = 100% to the deal's agent. */
export function earnersOf(deal: SplitDeal) {
  return deal.splits?.length ? deal.splits.map((x) => ({ userId: x.userId, sharePct: Number(x.sharePct) })) : [{ userId: deal.agentId, sharePct: 100 }];
}

/** Owner/Manager: split a deal's commission between earners, only before any commission on it is approved. */
export async function setDealSplits(actor: Actor, dealId: string, items: { userId: string; sharePct: number }[]) {
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") throw new RuleError("Only the Owner or Sales Manager can split a commission");
  const clean = items.filter((i) => i.userId && i.sharePct > 0);
  if (!clean.length) throw new RuleError("Add at least one person with a share");
  if (new Set(clean.map((i) => i.userId)).size !== clean.length) throw new RuleError("Each person can appear only once");
  const total = clean.reduce((a, i) => a + i.sharePct, 0);
  if (Math.abs(total - 100) > 0.001) throw new RuleError(`Shares must add up to 100% (now ${Math.round(total * 100) / 100}%)`);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${dealId} FOR UPDATE`;
    const deal = await tx.deal.findFirst({ where: { id: dealId, companyId: actor.companyId }, include: { _count: { select: { payouts: true } } } });
    if (!deal) throw new RuleError("Sale not found");
    if (deal._count.payouts > 0) throw new RuleError("The split can't change after a commission on this sale has been approved");
    const users = await tx.user.count({ where: { id: { in: clean.map((i) => i.userId) }, companyId: actor.companyId, active: true, role: { in: ["AGENT", "MANAGER"] } } });
    if (users !== clean.length) throw new RuleError("Choose active agents or managers from your company");
    await tx.commissionSplit.deleteMany({ where: { dealId } });
    const isDefault = clean.length === 1 && clean[0].userId === deal.agentId;
    if (!isDefault) await tx.commissionSplit.createMany({ data: clean.map((i) => ({ companyId: actor.companyId, dealId, userId: i.userId, sharePct: i.sharePct })) });
    await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.userId, action: "commission.split", entity: "Deal", entityId: dealId, detail: clean.map((i) => `${i.userId}:${i.sharePct}%`).join(", ") } });
  });
}

/** Accountant/Owner: approve part or all of one earner's payable commission on a deal. */
export async function approveCommissionFor(actor: Actor, dealId: string, userId: string, amount: number) {
  if (actor.role !== "OWNER" && actor.role !== "ACCOUNTANT") throw new RuleError("Only the Accountant or Owner can approve commissions");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${dealId} FOR UPDATE`;
    const deal = await tx.deal.findFirst({ where: { id: dealId, companyId: actor.companyId }, include: { splits: true, payments: { where: { status: "CONFIRMED" } }, payouts: { where: { agentId: userId } } } });
    if (!deal) throw new RuleError("Sale not found");
    const earner = earnersOf(deal).find((e) => e.userId === userId);
    if (!earner) throw new RuleError("This person has no share in this sale");
    const confirmed = deal.payments.reduce((a, p) => a + Number(p.amount), 0);
    const c = commissionState(deal, confirmed, deal.payouts, earner.sharePct);
    if (!(amount > 0) || amount > c.payable + 0.001) throw new RuleError(`Amount must be between 0 and the payable ${c.payable}`);
    const payout = await tx.commissionPayout.create({ data: { companyId: actor.companyId, agentId: userId, dealId, amount, approvedById: actor.userId } });
    await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.userId, action: "commission.approved", entity: "Deal", entityId: dealId, detail: `${amount} for ${userId}` } });
    await notify(tx, { companyId: actor.companyId, userId, kind: "commission.approved", title: `Commission of ${amount.toLocaleString("en")} ETB approved (${deal.contractNo})`, link: "/commissions" });
    return payout;
  });
}

/** Owner/Admin: replace a project's price tiers. Only new sales use them; each sale keeps the rate it was made with. */
export async function saveTiers(actor: Actor, projectId: string, tiers: { fromAmount: number; rate: number }[]) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new RuleError("Only the Owner or Admin can change commission rules");
  const clean = tiers.filter((t) => t.fromAmount > 0 || t.rate > 0);
  for (const t of clean) {
    if (!(t.fromAmount > 0)) throw new RuleError("Each tier needs a starting price above 0");
    if (!(t.rate >= 0 && t.rate <= 100)) throw new RuleError("Rates must be between 0 and 100%");
  }
  if (new Set(clean.map((t) => t.fromAmount)).size !== clean.length) throw new RuleError("Two tiers start at the same price");
  return db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: projectId, companyId: actor.companyId } });
    if (!project) throw new RuleError("Project not found");
    await tx.commissionTier.deleteMany({ where: { projectId } });
    if (clean.length) await tx.commissionTier.createMany({ data: clean.map((t) => ({ companyId: actor.companyId, projectId, ...t })) });
    await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.userId, action: "commission.tiers", entity: "Project", entityId: projectId, detail: clean.map((t) => `from ${t.fromAmount}: ${t.rate}%`).join("; ") || "none" } });
  });
}
