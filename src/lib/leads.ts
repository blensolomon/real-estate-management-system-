import { db } from "./db";
import { audit } from "./audit";
import { RuleError, type Actor } from "./rules";

/**
 * Lead ownership is locked to the agent who registered it.
 * Owner/Admin may move an owned lead; a Sales Manager may only assign a lead that has no owner yet.
 */
export async function assignLeadOwner(actor: Actor, leadId: string, toUserId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, companyId: actor.companyId }, include: { owner: true } });
  if (!lead) throw new RuleError("Lead not found");
  const override = actor.role === "OWNER" || actor.role === "ADMIN";
  if (!override && !(actor.role === "MANAGER" && !lead.ownerId)) throw new RuleError("This lead belongs to its agent. Only the Owner or Admin can move it.");
  const to = await db.user.findFirst({ where: { id: toUserId, companyId: actor.companyId, active: true } });
  if (!to) throw new RuleError("Choose an active user");
  if (to.id === lead.ownerId) throw new RuleError("Already owned by that user");
  await db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: lead.id }, data: { ownerId: to.id } });
    await tx.followUp.updateMany({ where: { leadId: lead.id, doneAt: null }, data: { assigneeId: to.id } });
    await tx.activity.create({ data: { companyId: actor.companyId, leadId: lead.id, userId: actor.userId, type: "REASSIGNED", note: `${lead.owner ? `Moved from ${lead.owner.name} to` : "Assigned to"} ${to.name}` } });
    await audit(actor, lead.ownerId ? "lead.owner_override" : "lead.assigned", "Lead", lead.id, `${lead.owner?.name ?? "unassigned"} → ${to.name}`, { before: { ownerId: lead.ownerId }, after: { ownerId: to.id } }, tx);
  });
  return to;
}

/** Owner/Admin: move all open leads of one user to another (e.g. an agent leaves). Won/lost leads keep their owner. */
export async function moveLeads(actor: Actor, fromUserId: string, toUserId: string) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new RuleError("Only the Owner or Admin can move leads");
  if (fromUserId === toUserId) throw new RuleError("Choose two different users");
  const [from, to] = await Promise.all([
    db.user.findFirst({ where: { id: fromUserId, companyId: actor.companyId } }),
    db.user.findFirst({ where: { id: toUserId, companyId: actor.companyId, active: true } }),
  ]);
  if (!from || !to) throw new RuleError("Choose two users from this company");
  const leads = await db.lead.findMany({ where: { companyId: actor.companyId, ownerId: from.id, status: { notIn: ["WON", "LOST"] } }, select: { id: true } });
  const ids = leads.map((l) => l.id);
  if (!ids.length) throw new RuleError(`${from.name} has no open leads`);
  await db.$transaction(async (tx) => {
    await tx.lead.updateMany({ where: { id: { in: ids } }, data: { ownerId: to.id } });
    await tx.followUp.updateMany({ where: { leadId: { in: ids }, doneAt: null }, data: { assigneeId: to.id } });
    await tx.activity.createMany({ data: ids.map((leadId) => ({ companyId: actor.companyId, leadId, userId: actor.userId, type: "REASSIGNED" as const, note: `Moved from ${from.name} to ${to.name}` })) });
    await audit(actor, "lead.owner_override", "User", from.id, `${ids.length} open leads ${from.name} → ${to.name}`, { before: { ownerId: from.id, leadIds: ids }, after: { ownerId: to.id } }, tx);
  });
  return { count: ids.length, from, to };
}
