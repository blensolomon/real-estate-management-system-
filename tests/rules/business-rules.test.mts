/**
 * Section 7 business rules, run against a real PostgreSQL test database (TEST_DATABASE_URL).
 * Run: npm run test:rules
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://resms:resms@localhost:5432/resms_test?schema=public";

const { db } = await import("../../src/lib/db");
const { reserveUnit } = await import("../../src/lib/reservations");
const { createSale } = await import("../../src/lib/sales");
const { confirmPayment, reversePayment, voidPayment, rejectPayment } = await import("../../src/lib/payments");
const { RuleError } = await import("../../src/lib/rules");
const { dealFinancials } = await import("../../src/lib/finance");

type Role = "OWNER" | "MANAGER" | "AGENT" | "ACCOUNTANT" | "ADMIN";
const PREFIX = "TEST rules ";

async function purge() {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('resms.allow_purge', 'on', true)`;
    await tx.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });
}

async function makeCompany(tag: string) {
  const c = await db.company.create({ data: { name: PREFIX + tag } });
  const user = async (role: Role, n = "") => {
    const u = await db.user.create({ data: { companyId: c.id, name: `${role}${n}`, email: `${tag}-${role}${n}-${Math.random()}@t.et`.toLowerCase(), passwordHash: "x", role } });
    return { userId: u.id, companyId: c.id, role };
  };
  const project = await db.project.create({ data: { companyId: c.id, name: "P", commissionRate: 2 } });
  const unit = (code: string) => db.unit.create({ data: { companyId: c.id, projectId: project.id, code, price: 1_000_000 } });
  return { c, user, unit };
}

let seq = 0;
async function saleWithPendingPayment(tag: string, amount = 300_000) {
  const co = await makeCompany(tag);
  const agent = await co.user("AGENT");
  const accountant = await co.user("ACCOUNTANT");
  const u = await co.unit("U1");
  const { reservation } = await reserveUnit(agent, { unitId: u.id, fullName: "Buyer", phone: `09${String(++seq).padStart(8, "0")}` });
  const deal = await createSale(agent, { reservationId: reservation.id, contractNo: "C-1", price: 1_000_000, signedAt: new Date(), firstDue: new Date(), plan: { type: "INSTALLMENT", downPct: 30, months: 7 } });
  const p = await db.payment.create({ data: { companyId: co.c.id, dealId: deal.id, amount, paidAt: new Date(), method: "BANK_TRANSFER", reference: `FT${seq}`, recordedById: agent.userId } });
  return { co, agent, accountant, deal, p, unit: u };
}

const rejectsRule = (p: Promise<unknown>, re?: RegExp) => assert.rejects(p, (e: Error) => e instanceof RuleError && (!re || re.test(e.message)));
const rejectsDb = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));

before(purge);
after(async () => {
  await purge();
  await db.$disconnect();
});

test("two agents can never reserve the same unit at the same time", async () => {
  const co = await makeCompany("race");
  const agents = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((n) => co.user("AGENT", String(n))));
  const u = await co.unit("R1");
  const results = await Promise.allSettled(agents.map((a, i) => reserveUnit(a, { unitId: u.id, fullName: `Buyer ${i}`, phone: `0922${String(i).padStart(6, "0")}` })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results) if (r.status === "rejected") assert.ok(r.reason instanceof RuleError, String(r.reason));
  assert.equal(await db.reservation.count({ where: { unitId: u.id, status: "ACTIVE" } }), 1);
  assert.equal((await db.unit.findUniqueOrThrow({ where: { id: u.id } })).status, "RESERVED");
});

test("only AVAILABLE units can be reserved", async () => {
  const co = await makeCompany("avail");
  const agent = await co.user("AGENT");
  const u = await co.unit("B1");
  await db.unit.update({ where: { id: u.id }, data: { status: "BLOCKED" } });
  await rejectsRule(reserveUnit(agent, { unitId: u.id, fullName: "X", phone: "0933000001" }), /no longer available/);
});

test("the database refuses a second active reservation even if app checks are bypassed", async () => {
  const { co, unit } = await saleWithPendingPayment("dbconstraint");
  const client = await db.client.findFirstOrThrow({ where: { companyId: co.c.id } });
  const agent = await db.user.findFirstOrThrow({ where: { companyId: co.c.id, role: "AGENT" } });
  await db.reservation.create({ data: { companyId: co.c.id, unitId: unit.id, clientId: client.id, agentId: agent.id, expiresAt: new Date(Date.now() + 86400000) } });
  await rejectsDb(db.reservation.create({ data: { companyId: co.c.id, unitId: unit.id, clientId: client.id, agentId: agent.id, expiresAt: new Date(Date.now() + 86400000) } }), /Unique constraint/);
});

test("only the accountant (or owner) can confirm, and only confirmed payments count", async () => {
  const { agent, accountant, deal, p } = await saleWithPendingPayment("confirm");
  await rejectsRule(confirmPayment(agent, p.id), /accountant/);
  let d = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { installments: true, payments: true } });
  assert.equal(dealFinancials(d).confirmed, 0);
  assert.equal(dealFinancials(d).pending, 300_000);
  const done = await confirmPayment(accountant, p.id);
  assert.equal(done.receiptNo, 1);
  d = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { installments: true, payments: true } });
  assert.equal(dealFinancials(d).confirmed, 300_000);
  assert.equal(dealFinancials(d).balance, 700_000);
});

test("confirmed payments are immutable and cannot be deleted", async () => {
  const { accountant, p } = await saleWithPendingPayment("immutable");
  await confirmPayment(accountant, p.id);
  await rejectsDb(db.payment.update({ where: { id: p.id }, data: { amount: 1 } }), /locked/);
  await rejectsDb(db.payment.update({ where: { id: p.id }, data: { status: "PENDING" } }), /locked/);
  await rejectsDb(db.payment.delete({ where: { id: p.id } }), /cannot be deleted/);
});

test("corrections are linked reversal entries; the original stays", async () => {
  const { accountant, deal, p } = await saleWithPendingPayment("reversal");
  await confirmPayment(accountant, p.id);
  await rejectsRule(reversePayment(accountant, p.id, ""), /reason/);
  const rev = await reversePayment(accountant, p.id, "Bank bounced the transfer");
  assert.equal(Number(rev.amount), -300_000);
  assert.equal(rev.reversalOfId, p.id);
  const original = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(original.status, "CONFIRMED");
  assert.equal(Number(original.amount), 300_000);
  const d = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { installments: true, payments: true } });
  assert.equal(dealFinancials(d).confirmed, 0);
  await rejectsRule(reversePayment(accountant, p.id, "again"), /already reversed/);
  await rejectsRule(reversePayment(accountant, rev.id, "reverse the reversal"), /Only confirmed/);
});

test("pending mistakes are voided with a reason, never deleted, and can't be reopened", async () => {
  const { agent, accountant, p } = await saleWithPendingPayment("void");
  await rejectsRule(voidPayment(agent, p.id, " "), /reason/);
  const v = await voidPayment(agent, p.id, "Typed wrong amount");
  assert.equal(v.status, "VOID");
  await rejectsRule(confirmPayment(accountant, p.id), /pending/);
  await rejectsDb(db.payment.update({ where: { id: p.id }, data: { status: "PENDING" } }), /cannot be reopened/);
  await rejectsDb(db.payment.delete({ where: { id: p.id } }), /cannot be deleted/);
});

test("rejecting needs a reason", async () => {
  const { accountant, p } = await saleWithPendingPayment("reject");
  await rejectsRule(rejectPayment(accountant, p.id, ""), /reason/);
  assert.equal((await rejectPayment(accountant, p.id, "Not on statement")).status, "REJECTED");
});

test("receipt numbers stay unique and gap-free under concurrent confirmation", async () => {
  const { co, agent, accountant, deal } = await saleWithPendingPayment("receipts");
  const extra = await Promise.all([1, 2, 3, 4, 5].map((n) => db.payment.create({ data: { companyId: co.c.id, dealId: deal.id, amount: 10_000, paidAt: new Date(), method: "CASH", recordedById: agent.userId, reference: `R${n}` } })));
  const pending = await db.payment.findMany({ where: { dealId: deal.id, status: "PENDING" } });
  await Promise.all(pending.map((p) => confirmPayment(accountant, p.id)));
  const nos = (await db.payment.findMany({ where: { dealId: deal.id }, select: { receiptNo: true } })).map((x) => x.receiptNo!).sort((a, b) => a - b);
  assert.deepEqual(nos, [1, 2, 3, 4, 5, 6]);
  assert.equal(extra.length, 5);
});

test("sales, reservations and audit entries cannot be deleted or rewritten", async () => {
  const { co, deal } = await saleWithPendingPayment("nodelete");
  await rejectsDb(db.deal.delete({ where: { id: deal.id } }), /cannot be deleted/);
  await rejectsDb(db.reservation.deleteMany({ where: { companyId: co.c.id } }), /cannot be deleted/);
  const log = await db.auditLog.findFirstOrThrow({ where: { companyId: co.c.id } });
  await rejectsDb(db.auditLog.update({ where: { id: log.id }, data: { detail: "edited" } }), /cannot be changed/);
  await rejectsDb(db.auditLog.delete({ where: { id: log.id } }), /cannot be changed/);
});

test("money is stored as exact decimals", async () => {
  const { co, agent, deal } = await saleWithPendingPayment("decimal", 0.1);
  await db.payment.create({ data: { companyId: co.c.id, dealId: deal.id, amount: 0.2, paidAt: new Date(), method: "CASH", recordedById: agent.userId } });
  const [{ total }] = await db.$queryRaw<{ total: string }[]>`SELECT SUM(amount)::text AS total FROM "Payment" WHERE "dealId" = ${deal.id}`;
  assert.equal(total, "0.30");
});

test("one company can never act on another company's records", async () => {
  const a = await saleWithPendingPayment("tenantA");
  const b = await makeCompany("tenantB");
  const bAccountant = await b.user("ACCOUNTANT");
  const bAgent = await b.user("AGENT");
  await rejectsRule(confirmPayment(bAccountant, a.p.id), /not found/);
  await rejectsRule(reserveUnit(bAgent, { unitId: a.unit.id, fullName: "X", phone: "0944000001" }), /Choose a unit/);
  const freeUnit = await a.co.unit("FREE");
  const { reservation } = await reserveUnit(a.agent, { unitId: freeUnit.id, fullName: "Y", phone: "0944000002" });
  await rejectsRule(createSale(bAgent, { reservationId: reservation.id, contractNo: "X-1", price: 1, signedAt: new Date(), firstDue: new Date(), plan: { type: "CASH", downPct: 100, months: 0 } }), /not found/);
});

test("an agent cannot sell another agent's reservation or reserve for another agent's lead", async () => {
  const co = await makeCompany("ownership");
  const a1 = await co.user("AGENT", "1");
  const a2 = await co.user("AGENT", "2");
  const u = await co.unit("O1");
  const lead = await db.lead.create({ data: { companyId: co.c.id, name: "L", phone: "0955000001", source: "WALK_IN", ownerId: a1.userId } });
  await rejectsRule(reserveUnit(a2, { unitId: u.id, fullName: "L", phone: "0955000001", leadId: lead.id }), /Not your lead/);
  const { reservation } = await reserveUnit(a1, { unitId: u.id, fullName: "L", phone: "0955000001", leadId: lead.id });
  await rejectsRule(createSale(a2, { reservationId: reservation.id, contractNo: "C-9", price: 1_000_000, signedAt: new Date(), firstDue: new Date(), plan: { type: "CASH", downPct: 100, months: 0 } }), /Not your reservation/);
});

const { checkPrice, requestPriceApproval, decidePriceApproval, NeedsApprovalError } = await import("../../src/lib/approvals");
const { expireReservations, confirmDeposit, cancelReservation } = await import("../../src/lib/reservations");
const { assignLeadOwner, moveLeads } = await import("../../src/lib/leads");

async function reservedUnit(tag: string, deposit = 0) {
  const co = await makeCompany(tag);
  const agent = await co.user("AGENT");
  const manager = await co.user("MANAGER");
  const accountant = await co.user("ACCOUNTANT");
  const u = await co.unit("D1");
  const { reservation } = await reserveUnit(agent, { unitId: u.id, fullName: "Buyer", phone: `08${String(++seq).padStart(8, "0")}`, deposit });
  return { co, agent, manager, accountant, u, reservation };
}
const sale = (reservationId: string, price: number) => ({ reservationId, contractNo: `C-${++seq}`, price, signedAt: new Date(), firstDue: new Date(), plan: { type: "CASH" as const, downPct: 100, months: 0 } });

test("a price more than 5% below list needs Sales Manager/Owner approval", async () => {
  const { agent, manager, reservation } = await reservedUnit("discount");
  await createSale(agent, sale(reservation.id, 960_000)).then(async (d) => {
    // 4% below is fine; undo nothing — just check the next case on a fresh reservation
    assert.ok(d.id);
  });
  const r2 = await reservedUnit("discount2");
  await assert.rejects(createSale(r2.agent, sale(r2.reservation.id, 940_000)), (e) => e instanceof NeedsApprovalError);
  const req = await requestPriceApproval(r2.agent, r2.reservation.id, 940_000, "cash buyer");
  await rejectsRule(requestPriceApproval(r2.agent, r2.reservation.id, 940_000, "again"), /already waiting/);
  await rejectsRule(decidePriceApproval(r2.agent, req.id, true, ""), /Sales Manager or Owner/);
  await rejectsRule(decidePriceApproval(r2.manager, req.id, false, ""), /reason/);
  await decidePriceApproval(r2.manager, req.id, true, "ok");
  await rejectsRule(decidePriceApproval(r2.manager, req.id, true, ""), /Already decided/);
  await assert.rejects(createSale(r2.agent, sale(r2.reservation.id, 900_000)), (e) => e instanceof NeedsApprovalError);
  const d = await createSale(r2.agent, sale(r2.reservation.id, 940_000));
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: d.id, action: "deal.created" } });
  assert.equal((log.after as { priceApprovalId: string }).priceApprovalId, req.id);
  assert.equal(manager.role, "MANAGER");
});

test("a Sales Manager's own discounted sale is recorded as self-approved", async () => {
  const { manager, reservation } = await reservedUnit("selfapprove");
  const res = await checkPrice(manager, reservation.id, 1_000_000, 800_000);
  assert.equal(res.needed, true);
  const d = await createSale(manager, sale(reservation.id, 800_000));
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: d.id, action: "deal.created" } });
  assert.equal((log.after as { selfApproved: boolean }).selfApproved, true);
});

test("expired reservations are released unless the accountant confirmed the deposit", async () => {
  const open = await reservedUnit("expire-open", 50_000);
  const held = await reservedUnit("expire-held", 50_000);
  await rejectsRule(confirmDeposit(held.agent, held.reservation.id, "FT1"), /accountant/);
  await confirmDeposit(held.accountant, held.reservation.id, "FT1");
  await rejectsRule(confirmDeposit(held.accountant, held.reservation.id, "FT1"), /already/);
  const past = new Date(Date.now() - 3600_000);
  await db.reservation.updateMany({ where: { id: { in: [open.reservation.id, held.reservation.id] } }, data: { expiresAt: past } });
  await expireReservations(open.co.c.id);
  await expireReservations(held.co.c.id);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: open.reservation.id } })).status, "EXPIRED");
  assert.equal((await db.unit.findUniqueOrThrow({ where: { id: open.u.id } })).status, "AVAILABLE");
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: held.reservation.id } })).status, "ACTIVE");
  assert.equal((await db.unit.findUniqueOrThrow({ where: { id: held.u.id } })).status, "RESERVED");
  await rejectsRule(cancelReservation(held.agent, held.reservation.id, "changed mind"), /only the Sales Manager or Owner/);
  await rejectsRule(cancelReservation(held.manager, held.reservation.id, ""), /reason/);
});

test("a confirmed deposit becomes a confirmed payment with a receipt when the sale is made", async () => {
  const { agent, accountant, reservation } = await reservedUnit("deposit-sale", 50_000);
  await confirmDeposit(accountant, reservation.id, "FT-DEP-1");
  const d = await createSale(agent, sale(reservation.id, 1_000_000));
  const [p] = await db.payment.findMany({ where: { dealId: d.id } });
  assert.equal(p.status, "CONFIRMED");
  assert.equal(Number(p.amount), 50_000);
  assert.equal(p.reference, "FT-DEP-1");
  assert.equal(p.receiptNo, 1);
});

test("lead ownership: only Owner/Admin can move an owned lead; managers can only assign unowned leads", async () => {
  const co = await makeCompany("leadlock");
  const [a1, a2, manager, owner, admin] = [await co.user("AGENT", "1"), await co.user("AGENT", "2"), await co.user("MANAGER"), await co.user("OWNER"), await co.user("ADMIN")];
  const owned = await db.lead.create({ data: { companyId: co.c.id, name: "L1", phone: "0966000001", source: "FACEBOOK", ownerId: a1.userId } });
  const free = await db.lead.create({ data: { companyId: co.c.id, name: "L2", phone: "0966000002", source: "BILLBOARD" } });
  await rejectsRule(assignLeadOwner(manager, owned.id, a2.userId), /Only the Owner or Admin/);
  await rejectsRule(assignLeadOwner(a2, owned.id, a2.userId), /Only the Owner or Admin/);
  await assignLeadOwner(manager, free.id, a2.userId);
  await assignLeadOwner(owner, owned.id, a2.userId);
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: owned.id, action: "lead.owner_override" } });
  assert.deepEqual(log.before, { ownerId: a1.userId });
  await rejectsRule(moveLeads(manager, a2.userId, a1.userId), /Only the Owner or Admin/);
  const moved = await moveLeads(admin, a2.userId, a1.userId);
  assert.equal(moved.count, 2);
});

test("sign-up creates a separate company with one Owner; emails are unique across companies", async () => {
  const { createCompanyWithOwner } = await import("../../src/lib/tenancy");
  const email = `owner-${Math.random()}@new.et`;
  const { company, owner } = await createCompanyWithOwner({ company: PREFIX + "signup", name: "Abebe", email, password: "password123" });
  assert.equal(owner.role, "OWNER");
  assert.equal(owner.companyId, company.id);
  assert.equal(await db.project.count({ where: { companyId: company.id } }), 0);
  assert.equal(await db.auditLog.count({ where: { companyId: company.id, action: "company.create" } }), 1);
  await assert.rejects(createCompanyWithOwner({ company: PREFIX + "dup", name: "X", email: email.toUpperCase(), password: "password123" }), RuleError);
  await assert.rejects(createCompanyWithOwner({ company: PREFIX + "short", name: "X", email: `s-${Math.random()}@new.et`, password: "short" }), RuleError);
});

test("only platform admins can suspend a company, and suspension blocks its users", async () => {
  const { setCompanyActive, accountActive } = await import("../../src/lib/tenancy");
  const operator = await makeCompany("operator");
  const opOwner = await operator.user("OWNER");
  const opEmail = (await db.user.findUniqueOrThrow({ where: { id: opOwner.userId } })).email;
  const tenant = await makeCompany("tenant");
  const tenantOwner = await tenant.user("OWNER");
  process.env.PLATFORM_ADMIN_EMAILS = "";
  await assert.rejects(setCompanyActive(tenantOwner.userId, tenant.c.id, false, "x"), RuleError, "a company owner is not a platform admin");
  await assert.rejects(setCompanyActive(opOwner.userId, tenant.c.id, false, "x"), RuleError);
  process.env.PLATFORM_ADMIN_EMAILS = `someone@else.et, ${opEmail.toUpperCase()}`;
  await assert.rejects(setCompanyActive(opOwner.userId, tenant.c.id, false, " "), RuleError, "reason required");
  assert.equal(await accountActive(tenantOwner.userId, tenant.c.id), true);
  await setCompanyActive(opOwner.userId, tenant.c.id, false, "Unpaid subscription");
  assert.equal(await accountActive(tenantOwner.userId, tenant.c.id), false);
  assert.equal(await accountActive(opOwner.userId, operator.c.id), true, "other companies are unaffected");
  assert.equal(await accountActive(tenantOwner.userId, operator.c.id), false, "a session can't claim another company");
  const log = await db.auditLog.findFirstOrThrow({ where: { companyId: tenant.c.id, action: "company.suspend" } });
  assert.match(log.detail ?? "", /Unpaid subscription/);
  await setCompanyActive(opOwner.userId, tenant.c.id, true, "");
  assert.equal(await accountActive(tenantOwner.userId, tenant.c.id), true);
  process.env.PLATFORM_ADMIN_EMAILS = "";
});
