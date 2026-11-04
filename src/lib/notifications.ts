import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { dealFinancials } from "./finance";
import { addDays } from "./format";

type Note = { companyId: string; userId: string; kind: string; title: string; link?: string | null; dedupeKey?: string | null };

/** Adds in-app notifications. A repeated dedupeKey for the same user is ignored. */
export async function notify(tx: Prisma.TransactionClient, ...notes: Note[]) {
  if (notes.length) await tx.notification.createMany({ data: notes, skipDuplicates: true });
}

/**
 * Daily reminders, run by cron for every active company:
 * tasks due today or overdue, reservations ending within 24h (deposit not confirmed),
 * and installments due within 3 days or overdue that are not fully paid.
 */
export async function runReminders(now = new Date(), companyId?: string) {
  const companies = await db.company.findMany({ where: { active: true, ...(companyId ? { id: companyId } : {}) }, select: { id: true } });
  const day = now.toISOString().slice(0, 10);
  const notes: Note[] = [];
  for (const { id } of companies) {
    const [tasks, reservations, deals, accountants] = await Promise.all([
      db.followUp.findMany({ where: { companyId: id, doneAt: null, dueAt: { lt: addDays(now, 1) } }, include: { lead: true } }),
      db.reservation.findMany({ where: { companyId: id, status: "ACTIVE", depositConfirmedAt: null, expiresAt: { gt: now, lt: addDays(now, 1) } }, include: { unit: true } }),
      db.deal.findMany({ where: { companyId: id, status: "ACTIVE", installments: { some: { dueDate: { lt: addDays(now, 3) } } } }, include: { installments: true, payments: true, unit: true } }),
      db.user.findMany({ where: { companyId: id, active: true, role: "ACCOUNTANT" }, select: { id: true } }),
    ]);
    for (const t of tasks)
      notes.push({ companyId: id, userId: t.assigneeId, kind: "task.due", title: `${t.dueAt < now ? "Overdue" : "Due today"}: ${t.type.replace("_", " ").toLowerCase()} with ${t.lead.name}`, link: `/leads/${t.leadId}`, dedupeKey: `task:${t.id}:${day}` });
    for (const r of reservations)
      notes.push({ companyId: id, userId: r.agentId, kind: "reservation.expiring", title: `Reservation for ${r.unit.code} ends within 24 hours`, link: `/reservations`, dedupeKey: `res:${r.id}` });
    for (const d of deals) {
      const f = dealFinancials(d, now);
      for (const i of f.installments.filter((i) => i.remaining > 0 && i.dueDate < addDays(now, 3))) {
        const title = `${d.unit.code}: ${i.label} ${i.overdue ? `is ${i.daysOverdue} days late` : "is due soon"}`;
        const key = `inst:${i.id}:${i.overdue ? "late" : "soon"}`;
        for (const userId of new Set([d.agentId, ...accountants.map((a) => a.id)]))
          notes.push({ companyId: id, userId, kind: i.overdue ? "installment.overdue" : "installment.due", title, link: `/deals/${d.id}`, dedupeKey: key });
      }
    }
  }
  await notify(db, ...notes);
  const emailed = await sendPendingEmails();
  return { created: notes.length, emailed };
}

/** Emails unread, unsent notifications when SMTP_URL is configured (otherwise in-app only). */
export async function sendPendingEmails() {
  if (!process.env.SMTP_URL) return 0;
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  const pending = await db.notification.findMany({ where: { emailedAt: null, readAt: null }, include: { user: { select: { email: true, active: true } } }, take: 500 });
  const base = process.env.APP_URL ?? "";
  let sent = 0;
  for (const n of pending.filter((n) => n.user.active)) {
    await transport.sendMail({ from: process.env.SMTP_FROM ?? "no-reply@resms.local", to: n.user.email, subject: n.title, text: `${n.title}\n\n${base}${n.link ?? ""}` });
    await db.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
    sent++;
  }
  return sent;
}
