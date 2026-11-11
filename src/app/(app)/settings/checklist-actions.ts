"use server";

import type { DocumentType } from "@prisma/client";
import { getSession } from "@/lib/session";
import { back, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { DOC_TYPES, saveRequirements } from "@/lib/checklist";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function saveChecklist(fd: FormData) {
  // Guard: Check permission to edit settings
  const guard = await guardCompanyAction("EDIT_SETTINGS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const items = DOC_TYPES.filter((t) => fd.get(`req_${t}`) === "on").map((type: DocumentType) => ({ type, label: str(fd, `label_${type}`) }));
  try {
    await saveRequirements(s, items);
    await logCompanyAudit(s.companyId, s.userId, "EDIT_SETTINGS", "Company", s.companyId, `Document checklist updated: ${items.length} document type(s) required`);
  } catch (e) {
    if (e instanceof RuleError) back("/settings", { error: e.message });
    throw e;
  }
  back("/settings", { msg: "Document checklist saved" });
}
