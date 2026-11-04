"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { MANAGERS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { back, num, str } from "@/lib/actions-util";

export async function saveTarget(fd: FormData) {
  const s = await requireSession(MANAGERS);
  const month = str(fd, "month");
  const amount = num(fd, "amount");
  const user = await db.user.findFirst({ where: { id: str(fd, "userId"), companyId: s.companyId } });
  if (!user || !/^\d{4}-\d{2}$/.test(month) || !(amount >= 0)) back("/targets", { error: "Enter a valid amount" });
  await db.salesTarget.upsert({
    where: { userId_month: { userId: user.id, month } },
    create: { companyId: s.companyId, userId: user.id, month, amount },
    update: { amount },
  });
  await audit(s, "target.saved", "User", user.id, `${month} ${amount}`);
  back(`/targets?month=${month}`, { msg: `Target saved for ${user.name}` });
}
