"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { str } from "@/lib/actions-util";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function openNotification(fd: FormData) {
  // Guard: Light permission check (read-only operation)
  const guard = await guardCompanyAction("VIEW_DASHBOARD");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const notificationId = str(fd, "id");
  const n = await db.notification.findFirst({ where: { id: notificationId, userId: s.userId, companyId: s.companyId } });
  if (n && !n.readAt) {
    await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
    await logCompanyAudit(s.companyId, s.userId, "VIEW_DASHBOARD", "Notification", n.id, `Notification opened and marked read`);
  }
  redirect(n?.link && n.link.startsWith("/") ? n.link : "/notifications");
}

export async function markAllRead() {
  // Guard: Light permission check (read-only operation)
  const guard = await guardCompanyAction("VIEW_DASHBOARD");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const result = await db.notification.updateMany({ where: { userId: s.userId, companyId: s.companyId, readAt: null }, data: { readAt: new Date() } });
  await logCompanyAudit(s.companyId, s.userId, "VIEW_DASHBOARD", "Notification", "", `Marked ${result.count} notifications as read`);
  redirect("/notifications?msg=All+marked+as+read");
}
