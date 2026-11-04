"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { back, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { setCompanyActive } from "@/lib/tenancy";

export async function toggleCompany(fd: FormData) {
  const s = await requireSession();
  const active = str(fd, "active") === "true";
  try {
    await setCompanyActive(s.userId, str(fd, "companyId"), active, str(fd, "note"));
  } catch (e) {
    if (e instanceof RuleError) back("/platform", { error: e.message });
    throw e;
  }
  revalidatePath("/platform");
  back("/platform", { msg: active ? "Company reactivated" : "Company suspended" });
}
