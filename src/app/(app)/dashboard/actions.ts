"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { SALES, seesAll } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { back, str } from "@/lib/actions-util";

/** One-tap "mark done" for a lead with no recent contact: logs a call so the lead leaves the list. */
export async function markLeadContacted(fd: FormData) {
  const s = await requireSession(SALES);
  const lead = await db.lead.findFirst({ where: { id: str(fd, "leadId"), companyId: s.companyId } });
  if (!lead || (!seesAll(s.role) && lead.ownerId !== s.userId)) back("/dashboard", { error: "Lead not found" });
  const now = new Date();
  await db.$transaction([
    db.activity.create({ data: { companyId: s.companyId, leadId: lead.id, userId: s.userId, type: "CALL", note: str(fd, "note") || "Contacted (from home screen)" } }),
    db.lead.update({ where: { id: lead.id }, data: { lastActivityAt: now, ...(lead.status === "NEW" ? { status: "CONTACTED" } : {}) } }),
  ]);
  await audit(s, "lead.contacted", "Lead", lead.id, lead.name);
  back("/dashboard", { msg: `${lead.name} marked as contacted` });
}
