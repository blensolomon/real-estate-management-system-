"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { setCompanyActive } from "@/lib/tenancy";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function toggleCompany(fd: FormData) {
  // Guard: Check permission to edit settings
  const guard = await guardCompanyAction("EDIT_SETTINGS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const active = str(fd, "active") === "true";
  const companyId = str(fd, "companyId");
  const note = str(fd, "note");
  try {
    await setCompanyActive(s.userId, companyId, active, note);
    await logCompanyAudit(s.companyId, s.userId, "EDIT_SETTINGS", "Company", companyId, `Company ${active ? "reactivated" : "suspended"}: ${note}`);
  } catch (e) {
    if (e instanceof RuleError) back("/platform", { error: e.message });
    throw e;
  }
  revalidatePath("/platform");
  back("/platform", { msg: active ? "Company reactivated" : "Company suspended" });
}
