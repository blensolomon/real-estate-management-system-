import type { ActivityType, LeadStatus, TaskType, VisitOutcome } from "@prisma/client";
import { db } from "./db";
import { RuleError, type Actor } from "./rules";
import { addDays } from "./format";
import { notify } from "./notifications";

const ACTIVITY: Record<TaskType, ActivityType> = { CALL: "CALL", MESSAGE: "TELEGRAM", SITE_VISIT: "SITE_VISIT", MEETING: "MEETING", OTHER: "NOTE" };

async function visibleLead(actor: Actor, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, companyId: actor.companyId } });
  if (!lead || (actor.role === "AGENT" && lead.ownerId !== actor.userId)) throw new RuleError("Lead not found");
  return lead;
}

/** Schedules a task (call, message, site visit…) for the lead's owner. */
export async function createTask(actor: Actor, input: { leadId: string; type: TaskType; dueAt: Date; note?: string | null; projectId?: string | null }) {
  const lead = await visibleLead(actor, input.leadId);
  if (input.projectId && !(await db.project.findFirst({ where: { id: input.projectId, companyId: actor.companyId } })))
    throw new RuleError("Project not found");
  const assigneeId = lead.ownerId ?? actor.userId;
  return db.$transaction(async (tx) => {
    const task = await tx.followUp.create({
      data: { companyId: actor.companyId, leadId: lead.id, assigneeId, type: input.type, dueAt: input.dueAt, note: input.note || null, projectId: input.type === "SITE_VISIT" ? input.projectId || null : null },
    });
    if (assigneeId !== actor.userId)
      await notify(tx, { companyId: actor.companyId, userId: assigneeId, kind: "task.assigned", title: `New ${input.type.replace("_", " ").toLowerCase()} task: ${lead.name}`, link: `/leads/${lead.id}` });
    return task;
  });
}

/**
 * Completes a task with an outcome. A site visit also needs a visit outcome; unless the client
 * was not interested, a follow-up call is created automatically (next day for a no-show).
 */
export async function completeTask(actor: Actor, taskId: string, input: { outcome: string; visitOutcome?: VisitOutcome | null }) {
  const task = await db.followUp.findFirst({ where: { id: taskId, companyId: actor.companyId, doneAt: null }, include: { lead: true } });
  if (!task || (actor.role === "AGENT" && task.assigneeId !== actor.userId)) throw new RuleError("Task not found");
  const outcome = input.outcome.trim();
  if (!outcome) throw new RuleError("Record the outcome");
  const visit = task.type === "SITE_VISIT";
  if (visit && !input.visitOutcome) throw new RuleError("Pick how the site visit went");
  const company = await db.company.findUniqueOrThrow({ where: { id: actor.companyId } });
  const now = new Date();
  return db.$transaction(async (tx) => {
    await tx.followUp.update({ where: { id: task.id }, data: { doneAt: now, outcome, visitOutcome: visit ? input.visitOutcome : null } });
    const attended = visit && input.visitOutcome !== "NO_SHOW";
    await tx.activity.create({
      data: { companyId: actor.companyId, leadId: task.leadId, userId: actor.userId, type: visit && !attended ? "NOTE" : ACTIVITY[task.type], note: `${visit ? `Site visit (${input.visitOutcome!.replace("_", " ").toLowerCase()})` : "Task done"}: ${outcome}` },
    });
    let status: LeadStatus | undefined;
    if (attended && ["NEW", "CONTACTED"].includes(task.lead.status)) status = "SITE_VISIT";
    else if (task.lead.status === "NEW") status = "CONTACTED";
    await tx.lead.update({ where: { id: task.leadId }, data: { lastActivityAt: now, ...(status ? { status } : {}) } });
    let followUp = null;
    if (visit && input.visitOutcome !== "NOT_INTERESTED") {
      const noShow = input.visitOutcome === "NO_SHOW";
      followUp = await tx.followUp.create({
        data: {
          companyId: actor.companyId, leadId: task.leadId, assigneeId: task.assigneeId, type: "CALL",
          dueAt: addDays(now, noShow ? 1 : company.followUpDays), note: noShow ? "Client missed the site visit: call to reschedule" : "Follow up after site visit",
        },
      });
    }
    return { followUp };
  });
}
