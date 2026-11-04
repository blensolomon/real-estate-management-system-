"use server";

import { RuleError } from "@/lib/rules";
import { assignLeadOwner } from "@/lib/leads";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActivityType, LeadSource, LeadStatus } from "@prisma/client";
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

export async function changeStatus(fd: FormData) {
  const s = await requireSession(SALES);
  const lead = await loadLead(s, str(fd, "leadId"));
  const status = str(fd, "status") as LeadStatus;
  if (status === lead.status) back(`/leads/${lead.id}`, {});
  await db.$transaction([
    db.lead.update({ where: { id: lead.id }, data: { status, lastActivityAt: new Date() } }),
    db.activity.create({
      data: {
        companyId: s.companyId,
        leadId: lead.id,
        userId: s.userId,
        type: "STATUS_CHANGE",
        note: `${lead.status} → ${status}${str(fd, "reason") ? `: ${str(fd, "reason")}` : ""}`,
      },
    }),
  ]);
  back(`/leads/${lead.id}`, { msg: "Status updated" });
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
  const lead = await loadLead(s, str(fd, "leadId"));
  const dueAt = parseDateInput(str(fd, "dueAt"));
  if (!dueAt) back(`/leads/${lead.id}`, { error: "Pick a date" });
  await db.followUp.create({
    data: { companyId: s.companyId, leadId: lead.id, assigneeId: lead.ownerId ?? s.userId, dueAt, note: str(fd, "note") || null },
  });
  back(`/leads/${lead.id}`, { msg: "Follow-up scheduled" });
}

export async function completeFollowUp(fd: FormData) {
  const s = await requireSession(SALES);
  const fu = await db.followUp.findFirst({ where: { id: str(fd, "id"), companyId: s.companyId, doneAt: null } });
  const returnTo = str(fd, "returnTo") || "/follow-ups";
  if (!fu || (!seesAll(s.role) && fu.assigneeId !== s.userId)) back(returnTo, { error: "Follow-up not found" });
  const outcome = str(fd, "outcome");
  if (!outcome) back(returnTo, { error: "Record the outcome of the follow-up" });
  const now = new Date();
  await db.$transaction([
    db.followUp.update({ where: { id: fu.id }, data: { doneAt: now, outcome } }),
    db.activity.create({
      data: { companyId: s.companyId, leadId: fu.leadId, userId: s.userId, type: "CALL", note: `Follow-up done: ${outcome}` },
    }),
    db.lead.update({ where: { id: fu.leadId }, data: { lastActivityAt: now } }),
  ]);
  back(returnTo, { msg: "Follow-up completed" });
}
