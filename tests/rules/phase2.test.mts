/**
 * Phase 2 rules (pipeline, tasks & site visits, notifications, document checklist)
 * against the PostgreSQL test database. Run: npm run test:rules
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://resms:resms@localhost:5432/resms_test?schema=public";

const { db } = await import("../../src/lib/db");
const { RuleError } = await import("../../src/lib/rules");
const { moveLeadStage } = await import("../../src/lib/pipeline");
const { createTask, completeTask } = await import("../../src/lib/tasks");
const { runReminders } = await import("../../src/lib/notifications");
const { missingDocuments, saveRequirements } = await import("../../src/lib/checklist");
const { addDays } = await import("../../src/lib/format");

type Role = "OWNER" | "MANAGER" | "AGENT" | "ACCOUNTANT" | "ADMIN";
const PREFIX = "TEST phase2 ";
let seq = 0;

async function purge() {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('resms.allow_purge', 'on', true)`;
    await tx.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });
}

async function makeCompany(tag: string) {
  const c = await db.company.create({ data: { name: PREFIX + tag, followUpDays: 3 } });
  const user = async (role: Role, n = "") => {
    const u = await db.user.create({ data: { companyId: c.id, name: `${role}${n}`, email: `p2-${tag}-${role}${n}-${Math.random()}@t.et`.toLowerCase(), passwordHash: "x", role } });
    return { userId: u.id, companyId: c.id, role };
  };
  const lead = (ownerId: string | null) =>
    db.lead.create({ data: { companyId: c.id, name: `Lead ${++seq}`, phone: `0933${String(seq).padStart(6, "0")}`, source: "WALK_IN", ownerId } });
  return { c, user, lead };
}

const rejectsRule = (p: Promise<unknown>, re?: RegExp) => assert.rejects(p, (e: Error) => e instanceof RuleError && (!re || re.test(e.message)));

before(purge);
after(async () => {
  await purge();
  await db.$disconnect();
});

test("pipeline: agents move only their own leads; Won only via a sale; Lost needs a reason", async () => {
  const co = await makeCompany("pipe");
  const a1 = await co.user("AGENT", "1");
  const a2 = await co.user("AGENT", "2");
  const l = await co.lead(a1.userId);
  await rejectsRule(moveLeadStage(a2, l.id, "CONTACTED"), /not found/);
  await rejectsRule(moveLeadStage(a1, l.id, "WON"), /sale/);
  await rejectsRule(moveLeadStage(a1, l.id, "LOST", "  "), /reason/);
  assert.equal((await moveLeadStage(a1, l.id, "LOST", "Bought elsewhere")).lostReason, "Bought elsewhere");
  const back = await moveLeadStage(a1, l.id, "NEGOTIATION");
  assert.equal(back.lostReason, null);
  assert.equal(await db.activity.count({ where: { leadId: l.id, type: "STATUS_CHANGE" } }), 2);
  await db.lead.update({ where: { id: l.id }, data: { status: "WON" } });
  await rejectsRule(moveLeadStage(a1, l.id, "LOST", "x"), /already bought/);
});

test("pipeline and tasks never cross companies", async () => {
  const A = await makeCompany("isoA");
  const B = await makeCompany("isoB");
  const ownerB = await B.user("OWNER");
  const leadA = await A.lead(null);
  await rejectsRule(moveLeadStage(ownerB, leadA.id, "CONTACTED"), /not found/);
  await rejectsRule(createTask(ownerB, { leadId: leadA.id, type: "CALL", dueAt: new Date() }), /not found/);
  const ownerA = await A.user("OWNER");
  const t = await createTask(ownerA, { leadId: leadA.id, type: "CALL", dueAt: new Date() });
  await rejectsRule(completeTask(ownerB, t.id, { outcome: "x" }), /not found/);
});

test("site visit outcome drives the automatic follow-up", async () => {
  const co = await makeCompany("visit");
  const agent = await co.user("AGENT");
  const other = await co.user("AGENT", "2");
  const visit = async () => createTask(agent, { leadId: (await co.lead(agent.userId)).id, type: "SITE_VISIT", dueAt: new Date() });

  const v1 = await visit();
  await rejectsRule(completeTask(agent, v1.id, { outcome: "came" }), /site visit/);
  await rejectsRule(completeTask(other, v1.id, { outcome: "came", visitOutcome: "INTERESTED" }), /not found/);
  const r1 = await completeTask(agent, v1.id, { outcome: "Liked block B", visitOutcome: "INTERESTED" });
  assert.ok(r1.followUp);
  const days = Math.round((r1.followUp!.dueAt.getTime() - Date.now()) / 86400000);
  assert.equal(days, 3);
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: v1.leadId } })).status, "SITE_VISIT");
  await rejectsRule(completeTask(agent, v1.id, { outcome: "again", visitOutcome: "INTERESTED" }), /not found/);

  const v2 = await visit();
  const r2 = await completeTask(agent, v2.id, { outcome: "Did not come", visitOutcome: "NO_SHOW" });
  assert.equal(Math.round((r2.followUp!.dueAt.getTime() - Date.now()) / 86400000), 1);
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: v2.leadId } })).status, "CONTACTED");

  const v3 = await visit();
  const r3 = await completeTask(agent, v3.id, { outcome: "Too far", visitOutcome: "NOT_INTERESTED" });
  assert.equal(r3.followUp, null);
});

test("notifications: assignment alert, daily reminders are not duplicated", async () => {
  const co = await makeCompany("notify");
  const manager = await co.user("MANAGER");
  const agent = await co.user("AGENT");
  const l = await co.lead(agent.userId);
  await createTask(manager, { leadId: l.id, type: "CALL", dueAt: addDays(new Date(), -2) });
  assert.equal(await db.notification.count({ where: { userId: agent.userId, kind: "task.assigned" } }), 1);
  await runReminders(new Date(), co.c.id);
  await runReminders(new Date(), co.c.id);
  assert.equal(await db.notification.count({ where: { userId: agent.userId, kind: "task.due" } }), 1);
  assert.equal(await db.notification.count({ where: { userId: manager.userId } }), 0);
});

test("document checklist warns about missing types; only Owner/Admin can change it", async () => {
  const req = [{ type: "CONTRACT" as const, label: "Signed contract" }, { type: "ID" as const, label: "Buyer ID" }];
  assert.deepEqual(missingDocuments(req, [{ type: "ID" }, { type: "RECEIPT" }]).map((r) => r.label), ["Signed contract"]);
  const co = await makeCompany("docs");
  await rejectsRule(saveRequirements(await co.user("AGENT"), req), /Owner or Admin/);
  await rejectsRule(saveRequirements(await co.user("MANAGER"), req), /Owner or Admin/);
  await saveRequirements(await co.user("ADMIN"), req);
  await saveRequirements(await co.user("OWNER"), [req[0]]);
  assert.deepEqual((await db.documentRequirement.findMany({ where: { companyId: co.c.id } })).map((r) => r.type), ["CONTRACT"]);
});
