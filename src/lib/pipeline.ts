import type { LeadStatus } from "@prisma/client";
import { db } from "./db";
import { RuleError, type Actor } from "./rules";

export const STAGES: LeadStatus[] = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "WON", "LOST"];

/** Moves a lead between pipeline stages. Won only happens through a sale; Lost needs a reason. */
export async function moveLeadStage(actor: Actor, leadId: string, stage: LeadStatus, reason = "") {
  if (!STAGES.includes(stage)) throw new RuleError("Unknown stage");
  if (stage === "WON") throw new RuleError("A lead becomes Won when a sale is made for it");
  const lead = await db.lead.findFirst({ where: { id: leadId, companyId: actor.companyId } });
  if (!lead || (actor.role === "AGENT" && lead.ownerId !== actor.userId)) throw new RuleError("Lead not found");
  if (lead.status === "WON") throw new RuleError("This lead already bought; it can't change stage");
  if (lead.status === stage) return lead;
  if (stage === "LOST" && !reason.trim()) throw new RuleError("Give a reason why the lead was lost");
  return db.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: { status: stage, lastActivityAt: new Date(), lostReason: stage === "LOST" ? reason.trim() : null },
    });
    await tx.activity.create({
      data: { companyId: actor.companyId, leadId: lead.id, userId: actor.userId, type: "STATUS_CHANGE", note: `${lead.status} → ${stage}${reason.trim() ? `: ${reason.trim()}` : ""}` },
    });
    return updated;
  });
}
