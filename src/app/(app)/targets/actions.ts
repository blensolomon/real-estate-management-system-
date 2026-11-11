"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { back, num, str } from "@/lib/actions-util";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function saveTarget(fd: FormData) {
  // Guard: Check permission to edit targets
  const guard = await guardCompanyAction("EDIT_TARGETS");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const month = str(fd, "month");
  const amount = num(fd, "amount");
  const userId = str(fd, "userId");
  const user = await db.user.findFirst({ where: { id: userId, companyId: s.companyId } });
  if (!user || !/^\d{4}-\d{2}$/.test(month) || !(amount >= 0)) back("/targets", { error: "Enter a valid amount" });
  
  await db.salesTarget.upsert({
    where: { userId_month: { userId: user.id, month } },
    create: { companyId: s.companyId, userId: user.id, month, amount },
    update: { amount },
  });
  await logCompanyAudit(s.companyId, s.userId, "EDIT_TARGETS", "User", user.id, `Sales target set for ${month}: ${amount}`);
  back(`/targets?month=${month}`, { msg: `Target saved for ${user.name}` });
}
