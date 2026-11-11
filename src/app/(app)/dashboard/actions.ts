"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { back, str } from "@/lib/actions-util";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

/** One-tap "mark done" for a lead with no recent contact: logs a call so the lead leaves the list. */
export async function markLeadContacted(fd: FormData) {
  // Guard: Check permission to edit leads
  const guard = await guardCompanyAction("EDIT_LEAD");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const leadId = str(fd, "leadId");
  const lead = await db.lead.findFirst({ where: { id: leadId, companyId: s.companyId } });
  if (!lead || (!seesAll(s.role) && lead.ownerId !== s.userId)) back("/dashboard", { error: "Lead not found" });
  const now = new Date();
  const note = str(fd, "note") || "Contacted (from home screen)";
  await db.$transaction([
    db.activity.create({ data: { companyId: s.companyId, leadId: lead.id, userId: s.userId, type: "CALL", note } }),
    db.lead.update({ where: { id: lead.id }, data: { lastActivityAt: now, ...(lead.status === "NEW" ? { status: "CONTACTED" } : {}) } }),
  ]);
  await logCompanyAudit(s.companyId, s.userId, "EDIT_LEAD", "Lead", lead.id, `Lead contacted: ${lead.name}. Note: ${note}`);
  back("/dashboard", { msg: `${lead.name} marked as contacted` });
}
