"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { str } from "@/lib/actions-util";

export async function openNotification(fd: FormData) {
  const s = await requireSession();
  const n = await db.notification.findFirst({ where: { id: str(fd, "id"), userId: s.userId, companyId: s.companyId } });
  if (n && !n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  redirect(n?.link && n.link.startsWith("/") ? n.link : "/notifications");
}

export async function markAllRead() {
  const s = await requireSession();
  await db.notification.updateMany({ where: { userId: s.userId, companyId: s.companyId, readAt: null }, data: { readAt: new Date() } });
  redirect("/notifications?msg=All+marked+as+read");
}
