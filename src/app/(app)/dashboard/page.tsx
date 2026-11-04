import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canManage, seesAll } from "@/lib/permissions";
import { expireReservations, isHeld } from "@/lib/reservations";
import { loadCollections } from "@/lib/collections";
import { round } from "@/lib/finance";
import { addDays, daysBetween, fmtDate, money } from "@/lib/format";
import { intlPhone, lastMonths, monthOf } from "@/lib/months";
import { getT } from "@/i18n/server";
import { Flash, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { markLeadContacted } from "./actions";

const short = (n: number) => (n >= 1e6 ? `${round(n / 1e6)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));

function Contact({ phone, t }: { phone: string; t: (s: string) => string }) {
  const intl = intlPhone(phone);
  return (
    <>
      <a href={`tel:${phone}`} className="btn-secondary btn-sm">{t("Call")}</a>
      <a href={`https://wa.me/${intl}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">WhatsApp</a>
      <a href={`https://t.me/+${intl}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">Telegram</a>
    </>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string; msg?: string; error?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const t = await getT();
  await expireReservations(s.companyId);
  const all = seesAll(s.role);
  if (s.role === "ADMIN") return <AdminHome companyId={s.companyId} t={t} />;
  const sales = s.role !== "ACCOUNTANT";
  const now = new Date();
  const month = monthOf(now, s.calendar);
  const months = lastMonths(6, s.calendar, now);
  const mine = all ? {} : { agentId: s.userId };
  const company = await db.company.findUniqueOrThrow({ where: { id: s.companyId } });
  const staleBefore = addDays(now, -company.staleLeadDays);

  const [col, units, expiring, pending, staleLeads, monthDeals, confirmed6, agents, targets] = await Promise.all([
    loadCollections(s),
    db.unit.groupBy({ by: ["status"], where: { companyId: s.companyId }, _count: true }),
    db.reservation.findMany({ where: { companyId: s.companyId, status: "ACTIVE", expiresAt: { lt: addDays(now, 2) }, ...mine }, include: { unit: true, client: true, agent: true }, orderBy: { expiresAt: "asc" } }),
    db.payment.aggregate({ where: { companyId: s.companyId, status: "PENDING", ...(all ? {} : { deal: { agentId: s.userId } }) }, _sum: { amount: true }, _count: true }),
    sales
      ? db.lead.findMany({
          where: { companyId: s.companyId, status: { notIn: ["WON", "LOST"] }, ...(all ? {} : { ownerId: s.userId }), OR: [{ lastActivityAt: { lt: staleBefore } }, { lastActivityAt: null, createdAt: { lt: staleBefore } }] },
          include: { owner: true },
          orderBy: { lastActivityAt: { sort: "asc", nulls: "first" } },
          take: 100,
        })
      : Promise.resolve([]),
    db.deal.findMany({ where: { companyId: s.companyId, signedAt: { gte: month.start, lt: month.end }, status: { not: "CANCELLED" }, ...mine } }),
    db.payment.findMany({ where: { companyId: s.companyId, status: "CONFIRMED", paidAt: { gte: months[0].start }, ...(all ? {} : { deal: { agentId: s.userId } }) }, select: { amount: true, paidAt: true } }),
    db.user.findMany({ where: { companyId: s.companyId, active: true, role: "AGENT", ...(all ? {} : { id: s.userId }) }, orderBy: { name: "asc" } }),
    db.salesTarget.findMany({ where: { companyId: s.companyId, month: month.key } }),
  ]);

  const count = (st: string) => units.find((u) => u.status === st)?._count ?? 0;
  const totalUnits = units.reduce((a, u) => a + u._count, 0);
  const soldValue = monthDeals.reduce((a, d) => a + Number(d.price), 0);
  const collectedMonth = confirmed6.filter((p) => p.paidAt >= month.start).reduce((a, p) => a + Number(p.amount), 0);
  const late = col.rows.filter((r) => r.f.overdueAmount > 0).sort((a, b) => b.f.oldestOverdueDays - a.f.oldestOverdueDays);
  const attentionCount = late.length + expiring.length + staleLeads.length;

  const collectedByMonth = months.map((m) => ({ m, v: confirmed6.filter((p) => p.paidAt >= m.start && p.paidAt < m.end).reduce((a, p) => a + Number(p.amount), 0) }));
  const maxCol = Math.max(1, ...collectedByMonth.map((x) => x.v));
  const agentBars = agents.map((a) => {
    const sold = monthDeals.filter((d) => d.agentId === a.id).reduce((x, d) => x + Number(d.price), 0);
    const target = Number(targets.find((g) => g.userId === a.id)?.amount ?? 0);
    return { a, sold, target };
  }).sort((x, y) => y.sold - x.sold);
  const maxAgent = Math.max(1, ...agentBars.map((x) => Math.max(x.sold, x.target)));

  return (
    <div>
      <PageHeader title={all ? t("Today at a glance") : t("My day")} sub={t("{month} · numbers update live", { month: month.label })} />
      {sp.denied && <Flash error={t("You don't have access to that page.")} />}
      <Flash msg={sp.msg} error={sp.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t("Sold this month")} value={money(soldValue)} tone="green" href="/deals" sub={t("{n} sales", { n: monthDeals.length })} />
        <Stat label={t("Collected this month")} value={money(collectedMonth)} tone="green" href="/payments?status=CONFIRMED" sub={t("Confirmed by the accountant")} />
        <Stat label={t("Late payments")} value={money(col.overdue)} tone={col.overdue > 0 ? "red" : "green"} href="/collections" sub={t("{n} buyers are late", { n: late.length })} />
        <Stat label={t("Units available")} value={`${count("AVAILABLE")} / ${totalUnits}`} tone="green" href="/inventory" sub={t("{r} reserved · {s} sold", { r: count("RESERVED"), s: count("SOLD") })} />
        <Stat label={t("Waiting for confirmation")} value={money(pending._sum.amount)} tone={pending._count ? "amber" : undefined} href="/payments" sub={t("{n} payments to check", { n: pending._count })} />
        <Stat label={t("Needs attention")} value={attentionCount} tone={attentionCount ? "amber" : "green"} href="#attention" sub={t("Late buyers, expiring holds, quiet leads")} />
      </div>

      <section id="attention" className="card mt-6 p-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="h2">{t("Needs attention")}</h2>
          <span className="text-xs text-slate-500">{t("Oldest first")}</span>
        </div>
        {attentionCount === 0 && <p className="px-4 py-6 text-center text-sm text-emerald-700">{t("All clear. Nothing needs you right now.")}</p>}
        <ul className="divide-y divide-slate-100">
          {late.slice(0, 5).map(({ deal, f }) => (
            <li key={`d${deal.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">{deal.client.fullName}</Link>
                <div className="text-sm text-rose-700">{t("{amount} late by {days} days", { amount: money(f.overdueAmount), days: f.oldestOverdueDays })}</div>
                <div className="text-xs text-slate-500">{deal.unit.project.name} {deal.unit.code} · {deal.agent.name}</div>
              </div>
              <div className="flex w-full flex-wrap gap-1 pl-4 sm:w-auto sm:pl-0">
                <Contact phone={deal.client.phone} t={t} />
                <Link href={`/deals/${deal.id}#pay`} className="btn btn-sm">{t("Record payment")}</Link>
              </div>
            </li>
          ))}
          {expiring.map((r) => {
            const hours = Math.max(0, Math.round((r.expiresAt.getTime() - now.getTime()) / 3600000));
            return (
              <li key={`r${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.client.fullName} · {r.unit.code}</div>
                  <div className="text-sm text-amber-700">{isHeld(r, now) ? t("Reservation ended, deposit held: extend, sell or cancel") : t("Reservation ends in {h} hours", { h: hours })}</div>
                  <div className="text-xs text-slate-500">{r.agent.name}</div>
                </div>
                <div className="flex w-full flex-wrap gap-1 pl-4 sm:w-auto sm:pl-0">
                  <Contact phone={r.client.phone} t={t} />
                  {sales && <Link href={`/deals/new?reservationId=${r.id}`} className="btn btn-sm">{t("Make it a sale")}</Link>}
                  {canManage(s.role) && <Link href="/reservations" className="btn-secondary btn-sm">{t("Extend")}</Link>}
                </div>
              </li>
            );
          })}
          {staleLeads.slice(0, 5).map((l) => {
            const last = l.lastActivityAt ?? l.createdAt;
            return (
              <li key={`l${l.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
                  <div className="text-sm text-amber-700">{t("No contact for {d} days", { d: daysBetween(last, now) })}</div>
                  <div className="text-xs text-slate-500">{l.owner?.name ?? t("Unassigned")}</div>
                </div>
                <div className="flex w-full flex-wrap gap-1 pl-4 sm:w-auto sm:pl-0">
                  <Contact phone={l.phone} t={t} />
                  <form action={markLeadContacted}>
                    <input type="hidden" name="leadId" value={l.id} />
                    <SubmitButton className="btn btn-sm">{t("Mark done")}</SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
        {staleLeads.length > 5 && <Link href="/follow-ups" className="block px-4 py-3 text-sm text-emerald-700">{t("See all quiet leads")} →</Link>}
        {late.length > 5 && <Link href="/collections" className="block px-4 py-3 text-sm text-emerald-700">{t("See all {n} late buyers", { n: late.length })} →</Link>}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2">{t("Money collected per month")}</h2>
          <div className="mt-4 flex h-40 items-end gap-2">
            {collectedByMonth.map(({ m, v }) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] text-slate-500">{short(v)}</span>
                <div className="w-full rounded-t bg-emerald-600" style={{ height: `${Math.max(2, (v / maxCol) * 110)}px` }} />
                <span className="truncate text-[11px] text-slate-500">{m.label.split(" ")[0].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2 className="h2">{t("Sales this month vs target")}</h2>
          <div className="mt-4 space-y-3">
            {agentBars.length === 0 && <p className="muted">{t("No agents yet. Add them in Settings.")}</p>}
            {agentBars.map(({ a, sold, target }) => {
              const tone = !target ? "bg-slate-400" : sold >= target ? "bg-emerald-600" : sold >= target * 0.5 ? "bg-amber-500" : "bg-rose-500";
              return (
                <div key={a.id} className="text-sm">
                  <div className="flex justify-between"><span>{a.name}</span><span className="text-slate-500">{short(sold)}{target ? ` / ${short(target)}` : ""}</span></div>
                  <div className="relative mt-1 h-3 rounded bg-slate-100">
                    <div className={`h-3 rounded ${tone}`} style={{ width: `${(sold / maxAgent) * 100}%` }} />
                    {target > 0 && <div className="absolute top-[-2px] h-4 w-0.5 bg-slate-700" style={{ left: `${(target / maxAgent) * 100}%` }} title={t("Target")} />}
                  </div>
                </div>
              );
            })}
          </div>
          {canManage(s.role) && <Link href="/targets" className="mt-3 inline-block text-sm text-emerald-700">{t("Set targets")} →</Link>}
        </section>
      </div>
      <p className="mt-4 text-xs text-slate-400">{t("Today")}: {fmtDate(now, s.calendar)}</p>
    </div>
  );
}

async function AdminHome({ companyId, t }: { companyId: string; t: (s: string, v?: Record<string, string | number>) => string }) {
  const [users, projects, units] = await Promise.all([
    db.user.groupBy({ by: ["active"], where: { companyId }, _count: true }),
    db.project.count({ where: { companyId } }),
    db.unit.groupBy({ by: ["status"], where: { companyId }, _count: true }),
  ]);
  const active = users.find((u) => u.active)?._count ?? 0;
  const available = units.find((u) => u.status === "AVAILABLE")?._count ?? 0;
  return (
    <div>
      <PageHeader title={t("Admin")} sub={t("Manage users, projects and company settings.")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t("Active users")} value={active} href="/settings" tone="green" />
        <Stat label={t("Projects")} value={projects} href="/inventory" />
        <Stat label={t("Units available")} value={available} href="/inventory" tone="green" />
      </div>
    </div>
  );
}
