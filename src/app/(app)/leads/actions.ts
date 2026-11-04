"use server";

import { RuleError } from "@/lib/rules";
import { assignLeadOwner } from "@/lib/leads";
import { completeTask, createTask } from "@/lib/tasks";
import { moveLeadStage } from "@/lib/pipeline";
import { notify } from "@/lib/notifications";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActivityType, LeadSource, LeadStatus, TaskType, VisitOutcome } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, type Session } from "@/lib/session";
import { audit } from "@/lib/audit";
import { back, num, str } from "@/lib/actions-util";
import { canManage, seesAll, SALES, MANAGERS } from "@/lib/permissions";
import { addDays, parseDateInput } from "@/lib/format";

async function loadLead(s: Session, id: string) {
  const lead = await db.lead.findFirst({ where: { id, companyId: s.companyId } });
  if (!lead || (!seesAll(s.role) && lead.ownerId !== s.userId)) back("/leads", { error: "Lead not found" });
  return lead;
}

export async function createLead(fd: FormData) {
  const s = await requireSession(SALES);
  const phone = str(fd, "phone").replace(/\s+/g, "");
  const name = str(fd, "name");
  if (!name || !phone) back("/leads/new", { error: "Name and phone are required" });
  const existing = await db.lead.findUnique({
    where: { companyId_phone: { companyId: s.companyId, phone } },
    include: { owner: true },
  });
  if (existing)
    back("/leads/new", {
      error: `A lead with phone ${phone} already exists (${existing.name}, owned by ${existing.owner?.name ?? "nobody"}).`,
    });
  const ownerId = canManage(s.role) ? str(fd, "ownerId") || s.userId : s.userId;
  const budget = num(fd, "budget");
  const lead = await db.lead.create({
    data: {
      companyId: s.companyId,
      name,
      phone,
      email: str(fd, "email") || null,
      source: str(fd, "source") as LeadSource,
      sourceDetail: str(fd, "sourceDetail") || null,
      budget: Number.isFinite(budget) && budget > 0 ? budget : null,
      interestProjectId: str(fd, "interestProjectId") || null,
      notes: str(fd, "notes") || null,
      ownerId,
    },
  });
  await db.followUp.create({
    data: {
      companyId: s.companyId,
      leadId: lead.id,
      assigneeId: ownerId,
      dueAt: addDays(new Date(), 1),
      note: "First contact",
    },
  });
  if (ownerId !== s.userId)
    await notify(db, { companyId: s.companyId, userId: ownerId, kind: "lead.assigned", title: `New lead assigned to you: ${name}`, link: `/leads/${lead.id}` });
  await audit(s, "lead.created", "Lead", lead.id, `${name} (${lead.source})`);
  redirect(`/leads/${lead.id}?msg=Lead created`);
}

export async function logActivity(fd: FormData) {
  const s = await requireSession(SALES);
  const lead = await loadLead(s, str(fd, "leadId"));
  const type = str(fd, "type") as ActivityType;
  const note = str(fd, "note");
  if (!note) back(`/leads/${lead.id}`, { error: "Write what happened" });
  const company = await db.company.findUniqueOrThrow({ where: { id: s.companyId } });
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.activity.create({ data: { companyId: s.companyId, leadId: lead.id, userId: s.userId, type, note } });
    const statusUpdate: { status?: LeadStatus } = {};
    if (type === "SITE_VISIT" && ["NEW", "CONTACTED"].includes(lead.status)) statusUpdate.status = "SITE_VISIT";
    else if (lead.status === "NEW") statusUpdate.status = "CONTACTED";
    await tx.lead.update({ where: { id: lead.id }, data: { lastActivityAt: now, ...statusUpdate } });
    if (type === "SITE_VISIT") {
      await tx.followUp.create({
        data: {
          companyId: s.companyId,
          leadId: lead.id,
          assigneeId: lead.ownerId ?? s.userId,
          dueAt: addDays(now, company.followUpDays),
          note: "Follow up after site visit",
        },
      });
    }
  });
  revalidatePath(`/leads/${lead.id}`);
  back(`/leads/${lead.id}`, {
    msg: type === "SITE_VISIT" ? `Site visit logged; follow-up scheduled in ${company.followUpDays} days` : "Activity logged",
  });
}

export async function reassignLead(fd: FormData) {
  const s = await requireSession(MANAGERS);
  const leadId = str(fd, "leadId");
  let name = "";
  try {
    name = (await assignLeadOwner(s, leadId, str(fd, "ownerId"))).name;
  } catch (e) {
    if (e instanceof RuleError) back(`/leads/${leadId}`, { error: e.message });
    throw e;
  }
  back(`/leads/${leadId}`, { msg: `Lead now belongs to ${name}` });
}

export async function scheduleFollowUp(fd: FormData) {
  const s = await requireSession(SALES);
  const leadId = str(fd, "leadId");
  const dueAt = parseDateInput(str(fd, "dueAt"));
  if (!dueAt) back(`/leads/${leadId}`, { error: "Pick a date" });
  const type = (str(fd, "type") || "CALL") as TaskType;
  try {
    await createTask(s, { leadId, type, dueAt, note: str(fd, "note"), projectId: str(fd, "projectId") || null });
  } catch (e) {
    if (e instanceof RuleError) back(`/leads/${leadId}`, { error: e.message });
    throw e;
  }
  back(`/leads/${leadId}`, { msg: type === "SITE_VISIT" ? "Site visit scheduled" : "Task scheduled" });
}

export async function completeFollowUp(fd: FormData) {
  const s = await requireSession(SALES);
  const returnTo = str(fd, "returnTo") || "/follow-ups";
  let msg = "Task completed";
  try {
    const r = await completeTask(s, str(fd, "id"), { outcome: str(fd, "outcome"), visitOutcome: (str(fd, "visitOutcome") || null) as VisitOutcome | null });
    if (r.followUp) msg = "Done. A follow-up call was scheduled automatically";
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  back(returnTo, { msg });
}

export async function moveStage(fd: FormData) {
  const s = await requireSession(SALES);
  const returnTo = str(fd, "returnTo") || "/pipeline";
  try {
    await moveLeadStage(s, str(fd, "leadId"), str(fd, "stage") as LeadStatus, str(fd, "reason"));
  } catch (e) {
    if (e instanceof RuleError) back(returnTo, { error: e.message });
    throw e;
  }
  revalidatePath("/pipeline");
  back(returnTo, { msg: "Stage updated" });
}
