import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { SALES } from "@/lib/permissions";
import { dealFinancials } from "@/lib/finance";
import { addDays, daysBetween, fmtDate, money } from "@/lib/format";
import { intlPhone, monthOf } from "@/lib/months";
import { Badge, Empty, Flash, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { completeFollowUp } from "../leads/actions";

/** The agent's home for today: what to do, who to call, which reservations are ending. Always only the user's own items. */
export default async function MyDayPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const s = await requireSession(SALES);
  const sp = await searchParams;
  const now = new Date();
  const month = monthOf(now, s.calendar);
  const [tasks, reservations, deals, monthDeals, target, newLeads] = await Promise.all([
    db.followUp.findMany({ where: { companyId: s.companyId, assigneeId: s.userId, doneAt: null, dueAt: { lt: addDays(now, 1) } }, include: { lead: true, project: true }, orderBy: { dueAt: "asc" } }),
    db.reservation.findMany({ where: { companyId: s.companyId, agentId: s.userId, status: "ACTIVE", expiresAt: { lt: addDays(now, 2) } }, include: { unit: true, client: true }, orderBy: { expiresAt: "asc" } }),
    db.deal.findMany({ where: { companyId: s.companyId, agentId: s.userId, status: "ACTIVE" }, include: { installments: true, payments: true, client: true, unit: true } }),
    db.deal.aggregate({ where: { companyId: s.companyId, agentId: s.userId, status: { not: "CANCELLED" }, signedAt: { gte: month.start, lt: month.end } }, _sum: { price: true }, _count: true }),
    db.salesTarget.findFirst({ where: { companyId: s.companyId, userId: s.userId, month: month.key } }),
    db.lead.count({ where: { companyId: s.companyId, ownerId: s.userId, status: "NEW" } }),
  ]);
  const late = deals.map((d) => ({ d, f: dealFinancials(d, now) })).filter((x) => x.f.overdueAmount > 0).sort((a, b) => b.f.oldestOverdueDays - a.f.oldestOverdueDays);
  const sold = Number(monthDeals._sum.price ?? 0);
  const goal = target ? Number(target.amount) : 0;
  const overdueTasks = tasks.filter((t) => t.dueAt < now).length;

  return (
    <div>
      <PageHeader title="My day" sub="Your tasks for today, clients who are late, and reservations about to end." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tasks today" value={tasks.length} sub={overdueTasks ? `${overdueTasks} overdue` : "none overdue"} tone={overdueTasks ? "red" : "green"} href="/follow-ups" />
        <Stat label="New leads to call" value={newLeads} tone={newLeads ? "amber" : "green"} href="/pipeline" />
        <Stat label="Sold this month" value={money(sold)} sub={goal ? `${Math.round((sold / goal) * 100)}% of ${money(goal)} target` : `${monthDeals._count} sales`} tone={goal && sold >= goal ? "green" : undefined} />
        <Stat label="My clients who are late" value={late.length} tone={late.length ? "red" : "green"} href="/collections" />
      </div>

      <div className="space-y-6">
        <section className="card">
          <h2 className="h2 mb-3">To do today</h2>
          {tasks.length === 0 ? <Empty>Nothing due today. Check the pipeline for leads to move forward.</Empty> : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className={`rounded-lg border p-3 ${t.dueAt < now ? "border-rose-200 bg-rose-50" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={t.type === "SITE_VISIT" ? "amber" : "gray"}>{t.type}</Badge>
                    <Link href={`/leads/${t.leadId}`} className="link font-medium">{t.lead.name}</Link>
                    <span className="text-slate-500">{t.note}{t.project ? ` · ${t.project.name}` : ""}</span>
                    {t.dueAt < now && <Badge tone="red">{`${daysBetween(t.dueAt, now)}d overdue`}</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`tel:${t.lead.phone}`} className="btn-secondary btn-sm">Call</a>
                    <a href={`https://wa.me/${intlPhone(t.lead.phone)}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">WhatsApp</a>
                    <a href={`https://t.me/+${intlPhone(t.lead.phone)}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">Telegram</a>
                  </div>
                  <form action={completeFollowUp} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="returnTo" value="/my-day" />
                    {t.type === "SITE_VISIT" && (
                      <select name="visitOutcome" className="input w-44" required defaultValue="">
                        <option value="" disabled>How did it go?</option>
                        <option value="INTERESTED">Interested</option>
                        <option value="NEEDS_TIME">Needs time</option>
                        <option value="NOT_INTERESTED">Not interested</option>
                        <option value="NO_SHOW">Did not come</option>
                      </select>
                    )}
                    <input name="outcome" className="input min-w-0 flex-1" placeholder="What happened?" required />
                    <SubmitButton className="btn-primary btn-sm">Done</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="h2 mb-3">My clients who are late</h2>
          {late.length === 0 ? <Empty>None of your clients are late.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {late.map(({ d, f }) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div><Link href={`/deals/${d.id}`} className="link font-medium">{d.client.fullName}</Link> <span className="text-slate-500">· {d.unit.code}</span></div>
                  <div className="flex items-center gap-2"><Badge tone="red">{`${money(f.overdueAmount)} · ${f.oldestOverdueDays}d`}</Badge><a href={`tel:${d.client.phone}`} className="btn-secondary btn-sm">Call</a></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="h2 mb-3">Reservations ending soon</h2>
          {reservations.length === 0 ? <Empty>No reservations end in the next 2 days.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {reservations.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div><span className="font-medium">{r.unit.code}</span> <span className="text-slate-500">· {r.client.fullName}</span></div>
                  <div className="flex items-center gap-2"><Badge tone="amber">{fmtDate(r.expiresAt, s.calendar)}</Badge><Link href="/reservations" className="btn-secondary btn-sm">Open</Link></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
