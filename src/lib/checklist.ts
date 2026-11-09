import type { DocumentType } from "@prisma/client";
import { db } from "./db";
import { RuleError, type Actor } from "./rules";

export const DOC_TYPES: DocumentType[] = ["CONTRACT", "ID", "RECEIPT", "PAYMENT_PROOF", "TITLE", "OTHER"];

/** Required document types that have no uploaded file yet. Missing documents warn; they never block a sale or receipt. */
export function missingDocuments(required: { type: DocumentType; label: string }[], uploaded: { type: DocumentType }[]) {
  const have = new Set(uploaded.map((d) => d.type));
  return required.filter((r) => !have.has(r.type));
}

/** Owner/Admin: replace the company's list of documents every sale should have. */
export async function saveRequirements(actor: Actor, items: { type: DocumentType; label: string }[]) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new RuleError("Only the Owner or Admin can change the document checklist");
  const clean = items.filter((i) => DOC_TYPES.includes(i.type)).map((i) => ({ type: i.type, label: i.label.trim() || i.type }));
  return db.$transaction(async (tx) => {
    await tx.documentRequirement.deleteMany({ where: { companyId: actor.companyId } });
    if (clean.length) await tx.documentRequirement.createMany({ data: clean.map((c) => ({ ...c, companyId: actor.companyId })) });
    await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.userId, action: "checklist.updated", entity: "Company", entityId: actor.companyId, detail: clean.map((c) => c.label).join(", ") || "none" } });
  });
}
