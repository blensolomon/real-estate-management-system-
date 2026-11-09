/**
 * Phase 2 commission engine: price tiers, payable threshold, splits, approval.
 * Run: npm run test:rules
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://resms:resms@localhost:5432/resms_test?schema=public";

const { db } = await import("../../src/lib/db");
const { RuleError } = await import("../../src/lib/rules");
const { reserveUnit } = await import("../../src/lib/reservations");
const { createSale } = await import("../../src/lib/sales");
const { confirmPayment } = await import("../../src/lib/payments");
const { saveTiers, setDealSplits, approveCommissionFor, loadCommissions } = await import("../../src/lib/commissions");

type Role = "OWNER" | "MANAGER" | "AGENT" | "ACCOUNTANT" | "ADMIN";
const PREFIX = "TEST comm ";
let seq = 0;

async function purge() {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('resms.allow_purge', 'on', true)`;
    await tx.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });
}

async function setup(tag: string, price = 1_000_000) {
  const c = await db.company.create({ data: { name: PREFIX + tag } });
  const user = async (role: Role, n = "") => {
    const u = await db.user.create({ data: { companyId: c.id, name: `${role}${n}`, email: `cm-${tag}-${role}${n}-${Math.random()}@t.et`.toLowerCase(), passwordHash: "x", role } });
    return { userId: u.id, companyId: c.id, role };
  };
  const project = await db.project.create({ data: { companyId: c.id, name: "P", commissionRate: 2 } });
  const owner = await user("OWNER");
  const agent = await user("AGENT", "1");
  const agent2 = await user("AGENT", "2");
  const accountant = await user("ACCOUNTANT");
  const sell = async (p = price) => {
    const unit = await db.unit.create({ data: { companyId: c.id, projectId: project.id, code: `U${++seq}`, price: p } });
    const { reservation } = await reserveUnit(agent, { unitId: unit.id, fullName: "Buyer", phone: `0944${String(seq).padStart(6, "0")}` });
    return createSale(agent, { reservationId: reservation.id, contractNo: `C-${seq}`, price: p, signedAt: new Date(), firstDue: new Date(), plan: { type: "INSTALLMENT", downPct: 30, months: 7 } });
  };
  const pay = async (dealId: string, amount: number) => {
    const p = await db.payment.create({ data: { companyId: c.id, dealId, amount, paidAt: new Date(), method: "BANK_TRANSFER", reference: `FTC${++seq}`, recordedById: agent.userId } });
    return confirmPayment(accountant, p.id);
  };
  return { c, project, owner, agent, agent2, accountant, user, sell, pay };
}

const rejectsRule = (p: Promise<unknown>, re?: RegExp) => assert.rejects(p, (e: Error) => e instanceof RuleError && (!re || re.test(e.message)));
const session = (a: { userId: string; companyId: string; role: Role }) => ({ ...a, name: "x", email: "x", calendar: "GREGORIAN", locale: "en", companyName: "x" }) as never;

before(purge);
after(async () => {
  await purge();
  await db.$disconnect();
});

test("price tiers: Owner/Admin only; sale snapshots the tier rate and the company payable %", async () => {
  const t = await setup("tiers");
  await rejectsRule(saveTiers(t.agent, t.project.id, [{ fromAmount: 2_000_000, rate: 3 }]), /Owner or Admin/);
  await rejectsRule(saveTiers(t.owner, t.project.id, [{ fromAmount: 1, rate: 3 }, { fromAmount: 1, rate: 4 }]), /same price/);
  await saveTiers(t.owner, t.project.id, [{ fromAmount: 2_000_000, rate: 3 }, { fromAmount: 5_000_000, rate: 4 }]);
  const low = await t.sell(1_000_000);
  const mid = await t.sell(3_000_000);
  assert.equal(Number(low.commissionRate), 2);
  assert.equal(Number(mid.commissionRate), 3);
  assert.equal(Number(mid.commissionPayablePct), 30);
  await saveTiers(t.owner, t.project.id, []);
  assert.equal(Number((await db.deal.findUniqueOrThrow({ where: { id: mid.id } })).commissionRate), 3);
});

test("threshold: nothing payable below 30% confirmed, full commission at 30%", async () => {
  const t = await setup("threshold");
  const deal = await t.sell();
  await t.pay(deal.id, 200_000);
  await rejectsRule(approveCommissionFor(t.accountant, deal.id, t.agent.userId, 100), /payable 0/);
  await t.pay(deal.id, 100_000);
  await rejectsRule(approveCommissionFor(t.agent, deal.id, t.agent.userId, 100), /Accountant or Owner/);
  await rejectsRule(approveCommissionFor(t.accountant, deal.id, t.agent.userId, 20_001), /payable 20000/);
  await approveCommissionFor(t.accountant, deal.id, t.agent.userId, 20_000);
  await rejectsRule(approveCommissionFor(t.accountant, deal.id, t.agent.userId, 1), /payable 0/);
  assert.equal(await db.notification.count({ where: { userId: t.agent.userId, kind: "commission.approved" } }), 1);
});

test("older sales without a snapshot keep unlocking gradually", async () => {
  const t = await setup("legacy");
  const deal = await t.sell();
  await db.deal.update({ where: { id: deal.id }, data: { commissionPayablePct: null } });
  await t.pay(deal.id, 100_000);
  await rejectsRule(approveCommissionFor(t.accountant, deal.id, t.agent.userId, 2_001), /payable 2000/);
  await approveCommissionFor(t.accountant, deal.id, t.agent.userId, 2_000);
});

test("splits: Owner/Manager only, add up to 100, locked after approval, each earner sees only their share", async () => {
  const t = await setup("split");
  const manager = await t.user("MANAGER");
  const deal = await t.sell();
  await rejectsRule(setDealSplits(t.agent, deal.id, [{ userId: t.agent.userId, sharePct: 100 }]), /Owner or Sales Manager/);
  await rejectsRule(setDealSplits(manager, deal.id, [{ userId: t.agent.userId, sharePct: 60 }, { userId: t.agent2.userId, sharePct: 30 }]), /100%/);
  await rejectsRule(setDealSplits(manager, deal.id, [{ userId: t.agent.userId, sharePct: 50 }, { userId: t.accountant.userId, sharePct: 50 }]), /active agents/);
  await setDealSplits(manager, deal.id, [{ userId: t.agent.userId, sharePct: 60 }, { userId: t.agent2.userId, sharePct: 40 }]);
  await t.pay(deal.id, 300_000);
  await rejectsRule(approveCommissionFor(t.accountant, deal.id, t.agent2.userId, 8_001), /payable 8000/);
  await rejectsRule(approveCommissionFor(t.accountant, deal.id, t.accountant.userId, 1), /no share/);
  await approveCommissionFor(t.accountant, deal.id, t.agent2.userId, 8_000);
  await rejectsRule(setDealSplits(manager, deal.id, [{ userId: t.agent.userId, sharePct: 100 }]), /can't change/);
  const mine = await loadCommissions(session(t.agent2), {});
  assert.equal(mine.rows.length, 1);
  assert.equal(mine.rows[0].c.total, 8_000);
  assert.equal(mine.rows[0].c.approved, 8_000);
  const theirs = await loadCommissions(session(t.agent), {});
  assert.equal(theirs.rows[0].c.payable, 12_000);
  const all = await loadCommissions(session(t.owner), {});
  assert.equal(all.rows.length, 2);
});

test("commission actions never reach another company's sale", async () => {
  const a = await setup("iso-a");
  const b = await setup("iso-b");
  const deal = await a.sell();
  await a.pay(deal.id, 300_000);
  await rejectsRule(approveCommissionFor(b.accountant, deal.id, a.agent.userId, 1), /not found/);
  await rejectsRule(setDealSplits(b.owner, deal.id, [{ userId: b.agent.userId, sharePct: 100 }]), /not found/);
  await rejectsRule(saveTiers(b.owner, a.project.id, []), /not found/);
});
