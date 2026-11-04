"use server";

import type { DocumentType } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { ADMINS } from "@/lib/permissions";
import { back, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { DOC_TYPES, saveRequirements } from "@/lib/checklist";

export async function saveChecklist(fd: FormData) {
  const s = await requireSession(ADMINS);
  const items = DOC_TYPES.filter((t) => fd.get(`req_${t}`) === "on").map((type: DocumentType) => ({ type, label: str(fd, `label_${type}`) }));
  try {
    await saveRequirements(s, items);
  } catch (e) {
    if (e instanceof RuleError) back("/settings", { error: e.message });
    throw e;
  }
  back("/settings", { msg: "Document checklist saved" });
}
