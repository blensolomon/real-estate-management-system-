import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { markAllRead, openNotification } from "./actions";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ msg?: string; show?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const items = await db.notification.findMany({
    where: { userId: s.userId, companyId: s.companyId, ...(sp.show === "all" ? {} : { readAt: null }) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div>
      <PageHeader
        title="Notifications"
        sub="Reminders for tasks, expiring reservations, due installments and new leads."
        actions={<form action={markAllRead}><SubmitButton className="btn-secondary">Mark all read</SubmitButton></form>}
      />
      <Flash msg={sp.msg} />
      <div className="mb-3 flex gap-3 text-sm">
        <a href="/notifications" className={sp.show === "all" ? "link" : "font-semibold"}>Unread</a>
        <a href="/notifications?show=all" className={sp.show === "all" ? "font-semibold" : "link"}>All</a>
      </div>
      {items.length === 0 ? <Empty>You&apos;re all caught up.</Empty> : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <button className={`card flex min-h-14 w-full cursor-pointer flex-col items-start p-3 text-left text-sm ${n.readAt ? "opacity-60" : "border-l-4 border-l-emerald-600"}`}>
                  <span className="font-medium">{n.title}</span>
                  <span className="text-xs text-slate-500">{fmtDateTime(n.createdAt, s.calendar)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
