import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { dealFinancials, emptyAging, type DealFinancials } from "./finance";
import type { Session } from "./session";
import { seesAll } from "./permissions";

/** Loads every live deal visible to the user with computed balances and aging. */
export async function loadCollections(s: Session, extra: Prisma.DealWhereInput = {}) {
  const deals = await db.deal.findMany({
    where: { companyId: s.companyId, status: { not: "CANCELLED" }, ...(seesAll(s.role) ? {} : { agentId: s.userId }), ...extra },
    include: { installments: true, payments: true, client: true, agent: true, unit: { include: { project: true } }, payouts: true },
  });
  const rows = deals.map((d) => ({ deal: d, f: dealFinancials(d) as DealFinancials }));
  const totals = emptyAging();
  let contracted = 0, collected = 0, pending = 0, outstanding = 0;
  for (const { f } of rows) {
    contracted += f.price; collected += f.confirmed; pending += f.pending; outstanding += f.balance;
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += f.aging[k];
  }
  return { rows, totals, contracted, collected, pending, outstanding, overdue: totals.d1_30 + totals.d31_60 + totals.d61_90 + totals.d90plus };
}
