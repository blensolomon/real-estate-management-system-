import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { commissionState, dealFinancials } from "./finance";
import { seesAll } from "./permissions";
import type { Session } from "./session";

export type CommissionsSP = { agent?: string; q?: string; show?: string; msg?: string; error?: string };

export async function loadCommissions(s: Session, sp: CommissionsSP) {
  const agentFilter = seesAll(s.role) ? sp.agent : s.userId;
  const where: Prisma.DealWhereInput = { companyId: s.companyId, ...(agentFilter ? { agentId: agentFilter } : {}) };
  if (sp.q) where.OR = [{ contractNo: { contains: sp.q, mode: "insensitive" } }, { client: { fullName: { contains: sp.q, mode: "insensitive" } } }, { unit: { code: { contains: sp.q, mode: "insensitive" } } }];
  const deals = await db.deal.findMany({
    where,
    include: { installments: true, payments: true, payouts: { include: { approvedBy: true } }, agent: true, client: true, unit: { include: { project: true } } },
    orderBy: { signedAt: "desc" },
  });
  let rows = deals.map((d) => ({ d, c: commissionState(d, dealFinancials(d).confirmed, d.payouts) }));
  if (sp.show === "payable") rows = rows.filter((r) => r.c.payable > 0);
  return { agentFilter, rows };
}

