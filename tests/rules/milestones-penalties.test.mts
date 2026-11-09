/**
 * Phase 2 money rules: construction-stage schedules and late penalties.
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
const { saveMilestones, markMilestoneReached } = await import("../../src/lib/milestones");
const { penaltyMonths, newPenalties, runPenalties, decidePenalty } = await import("../../src/lib/penalties");

type Role = "OWNER" | "MANAGER" | "AGENT" | "ACCOUNTANT" | "ADMIN";
const PREFIX = "TEST mp ";
const DAY = 86400000;
let seq = 0;

async function purge() {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('resms.allow_purge', 'on', true)`;
    await tx.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });
}

async function setup(tag: string) {
  const c = await db.company.create({ data: { name: PREFIX + tag } });
  const user = async (role: Role) => {
    const u = await db.user.create({ data: { companyId: c.id, name: role, email: `mp-${tag}-${role}-${Math.random()}@t.et`.toLowerCase(), passwordHash: "x", role } });
    return { userId: u.id, companyId: c.id, role };
  };
  const project = await db.project.create({ data: { companyId: c.id, name: "P", commissionRate: 2 } });
  const owner = await user("OWNER");
  const admin = await user("ADMIN");
  const agent = await user("AGENT");
  const accountant = await user("ACCOUNTANT");
  const sell = async (plan: { type: "INSTALLMENT" | "MILESTONE"; downPct: number; months: number }, firstDue = new Date()) => {
    const unit = await db.unit.create({ data: { companyId: c.id, projectId: project.id, code: `U${++seq}`, price: 1_000_000 } });
    const { reservation } = await reserveUnit(agent, { unitId: unit.id, fullName: "Buyer", phone: `0955${String(seq).padStart(6, "0")}` });
    return createSale(agent, { reservationId: reservation.id, contractNo: `C-${seq}`, price: 1_000_000, signedAt: new Date(), firstDue, plan });
  };
  return { c, project, owner, admin, agent, accountant, sell };
}

const rejectsRule = (p: Promise<unknown>, re?: RegExp) => assert.rejects(p, (e: Error) => e instanceof RuleError && (!re || re.test(e.message)));
const future = (days: number) => new Date(Date.now() + days * DAY);

before(purge);
after(async () => {
  await purge();
  await db.$disconnect();
});

test("construction stages: Owner/Admin only, add to 100%, sale splits the rest by stage", async () => {
  const t = await setup("stages");
  await rejectsRule(t.sell({ type: "MILESTONE", downPct: 20, months: 0 }), /no construction stages/);
  await rejectsRule(saveMilestones(t.agent, t.project.id, [{ name: "A", pct: 100, expectedAt: future(90) }]), /Owner or Admin/);
  await rejectsRule(saveMilestones(t.admin, t.project.id, [{ name: "A", pct: 50, expectedAt: future(90) }]), /100%/);
  await saveMilestones(t.admin, t.project.id, [{ name: "Foundation", pct: 40, expectedAt: future(60) }, { name: "Roof", pct: 60, expectedAt: future(200) }]);
  const deal = await t.sell({ type: "MILESTONE", downPct: 20, months: 0 });
  const inst = await db.installment.findMany({ where: { dealId: deal.id }, orderBy: { seq: "asc" } });
  assert.deepEqual(inst.map((i) => [i.label, Number(i.amount)]), [["Down payment", 200_000], ["Foundation", 320_000], ["Roof", 480_000]]);
  await rejectsRule(saveMilestones(t.owner, t.project.id, []), /already use/);
});

test("marking a stage reached makes its payments due 30 days later; Owner/Admin only; once", async () => {
  const t = await setup("reach");
  await saveMilestones(t.owner, t.project.id, [{ name: "Foundation", pct: 100, expectedAt: future(300) }]);
  const deal = await t.sell({ type: "MILESTONE", downPct: 10, months: 0 });
  const m = await db.constructionMilestone.findFirstOrThrow({ where: { projectId: t.project.id } });
  await rejectsRule(markMilestoneReached(t.accountant, m.id), /Owner or Admin/);
  const other = await setup("reach-other");
  await rejectsRule(markMilestoneReached(other.owner, m.id), /not found/);
  const reachedAt = new Date();
  await markMilestoneReached(t.admin, m.id, reachedAt);
  const i = await db.installment.findFirstOrThrow({ where: { dealId: deal.id, milestoneId: m.id } });
  assert.equal(Math.round((i.dueDate.getTime() - reachedAt.getTime()) / DAY), 30);
  await rejectsRule(markMilestoneReached(t.owner, m.id), /already/);
  assert.equal(await db.notification.count({ where: { userId: t.agent.userId, kind: "milestone.reached" } }), 1);
});

test("penalty maths: grace period, simple monthly %, cap", () => {
  assert.equal(penaltyMonths(7, 7), 0);
  assert.equal(penaltyMonths(8, 7), 1);
  assert.equal(penaltyMonths(37, 7), 1);
  assert.equal(penaltyMonths(38, 7), 2);
  const rule = { graceDays: 7, pctPerMonth: 2, capPct: 5 };
  assert.deepEqual(newPenalties({ amount: 100_000, remaining: 100_000, daysOverdue: 70 }, [], rule), [{ monthNo: 1, amount: 2000 }, { monthNo: 2, amount: 2000 }, { monthNo: 3, amount: 1000 }]);
  assert.deepEqual(newPenalties({ amount: 100_000, remaining: 50_000, daysOverdue: 40 }, [{ monthNo: 1, amount: 2000 }], { ...rule, capPct: null }), [{ monthNo: 2, amount: 1000 }]);
});

test("penalties: off by default, created once per month, waive needs a reason, Accountant/Owner only", async () => {
  const t = await setup("pen");
  const deal = await t.sell({ type: "INSTALLMENT", downPct: 10, months: 0 }, new Date(Date.now() - 40 * DAY));
  await runPenalties(new Date(), t.c.id);
  assert.equal(await db.penalty.count({ where: { dealId: deal.id } }), 0, "off by default");
  await db.company.update({ where: { id: t.c.id }, data: { penaltyEnabled: true, penaltyPctPerMonth: 1, penaltyGraceDays: 5 } });
  await runPenalties(new Date(), t.c.id);
  await runPenalties(new Date(), t.c.id);
  assert.equal(await db.penalty.count({ where: { dealId: deal.id } }), 4, "2 late installments x 2 months, not duplicated");
  const rows = await db.penalty.findMany({ where: { dealId: deal.id, installment: { label: "Down payment" } }, orderBy: { monthNo: "asc" } });
  assert.equal(rows.length, 2, "40 days late, 5 days grace = 2 months");
  assert.equal(Number(rows[0].amount), 1_000);
  await rejectsRule(decidePenalty(t.agent, rows[0].id, "WAIVE", "x"), /Accountant or Owner/);
  await rejectsRule(decidePenalty(t.accountant, rows[0].id, "WAIVE", " "), /reason/);
  const other = await setup("pen-other");
  await rejectsRule(decidePenalty(other.accountant, rows[0].id, "WAIVE", "x"), /not found/);
  await decidePenalty(t.accountant, rows[0].id, "WAIVE", "Bank delay");
  await rejectsRule(decidePenalty(t.owner, rows[0].id, "COLLECT", "FT1"), /already settled/);
  await decidePenalty(t.owner, rows[1].id, "COLLECT", "FT123");
  await assert.rejects(db.penalty.delete({ where: { id: rows[1].id } }));
  const p = await db.payment.create({ data: { companyId: t.c.id, dealId: deal.id, amount: 1_000_000, paidAt: new Date(), method: "BANK_TRANSFER", reference: "FULL1", recordedById: t.agent.userId } });
  await confirmPayment(t.accountant, p.id);
  await runPenalties(new Date(Date.now() + 90 * DAY), t.c.id);
  assert.equal(await db.penalty.count({ where: { dealId: deal.id } }), 4, "no new penalties once paid");
});
