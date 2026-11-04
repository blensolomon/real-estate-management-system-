import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { expireReservations } from "@/lib/reservations";
import { loadCollections } from "@/lib/collections";
import { commissionState, round } from "@/lib/finance";
import { addDays, fmtDate, label, money } from "@/lib/format";
import { toEthiopian } from "@/lib/ethiopian";
import { Flash, PageHeader, Stat } from "@/components/ui";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  await expireReservations(s.companyId);
  const all = seesAll(s.role);
  const now = new Date();
  const mine = all ? {} : { agentId: s.userId };
  const leadScope = all ? { companyId: s.companyId } : { companyId: s.companyId, ownerId: s.userId };

  // Month boundaries follow the company's calendar.
  let monthStart: Date;
  if (s.calendar === "ETHIOPIAN") {
    const e = toEthiopian(now);
    monthStart = addDays(now, -(e.day - 1));
    monthStart = new Date(Math.floor((monthStart.getTime() + 3 * 3600000) / 86400000) * 86400000 - 3 * 3600000);
  } else {
    monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 3 * 3600000);
  }

  const [col, units, reservationsExpiring, pendingPayments, overdueFollowUps, leadsBySource, leadsByStatus, monthDeals, monthCollected, agents] = await Promise.all([
    loadCollections(s),
    db.unit.groupBy({ by: ["status"], where: { companyId: s.companyId }, _count: true, _sum: { price: true } }),
    db.reservation.findMany({ where: { companyId: s.companyId, status: "ACTIVE", expiresAt: { lt: addDays(now, 2) }, ...mine }, include: { unit: true, client: true, agent: true }, orderBy: { expiresAt: "asc" } }),
    db.payment.aggregate({ where: { companyId: s.companyId, status: "PENDING", ...(all ? {} : { deal: { agentId: s.userId } }) }, _sum: { amount: true }, _count: true }),
    db.followUp.count({ where: { companyId: s.companyId, doneAt: null, dueAt: { lt: now }, ...(all ? {} : { assigneeId: s.userId }) } }),
    db.lead.groupBy({ by: ["source"], where: { ...leadScope, createdAt: { gte: addDays(now, -90) } }, _count: true }),
    db.lead.groupBy({ by: ["status"], where: leadScope, _count: true }),
    db.deal.findMany({ where: { companyId: s.companyId, signedAt: { gte: monthStart }, status: { not: "CANCELLED" }, ...mine } }),
    db.payment.aggregate({ where: { companyId: s.companyId, status: "CONFIRMED", paidAt: { gte: monthStart }, ...(all ? {} : { deal: { agentId: s.userId } }) }, _sum: { amount: true } }),
    all ? db.user.findMany({ where: { companyId: s.companyId, role: { in: ["AGENT", "MANAGER"] }, active: true } }) : Promise.resolve([]),
  ]);

  const unitCount = (st: string) => units.find((u) => u.status === st)?._count ?? 0;
  const totalUnits = units.reduce((a, u) => a + u._count, 0);
  const commissionPayable = round(col.rows.reduce((a, { deal, f }) => a + commissionState(deal, f.confirmed, deal.payouts).payable, 0));
  const topDebtors = [...col.rows].filter((r) => r.f.overdueAmount > 0).sort((a, b) => b.f.overdueAmount - a.f.overdueAmount).slice(0, 8);
  const maxSource = Math.max(1, ...leadsBySource.map((l) => l._count));

  const agentRows = agents.map((a) => {
    const deals = col.rows.filter((r) => r.deal.agentId === a.id);
    return {
      a,
      deals: deals.length,
      sold: round(deals.reduce((x, r) => x + r.f.price, 0)),
      collected: round(deals.reduce((x, r) => x + r.f.confirmed, 0)),
      overdue: round(deals.reduce((x, r) => x + r.f.overdueAmount, 0)),
    };
  }).sort((x, y) => y.sold - x.sold);
  const funnel = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "WON", "LOST"].map((st) => ({ st, n: leadsByStatus.find((l) => l.status === st)?._count ?? 0 }));

  return (
    <div>
      <PageHeader title={all ? "Owner dashboard" : "My dashboard"} sub={`As of ${fmtDate(now, s.calendar)}. Numbers are live.`} />
      {sp.denied && <Flash error="You don't have access to that page." />}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Overdue from buyers" value={money(col.overdue)} tone="red" href="/collections" sub={`${col.rows.filter((r) => r.f.overdueAmount > 0).length} buyers overdue`} />
        <Stat label="Outstanding balance" value={money(col.outstanding)} href="/collections?view=all" sub={`of ${money(col.contracted)} contracted`} />
        <Stat label="Awaiting confirmation" value={money(pendingPayments._sum.amount)} tone="amber" href="/payments" sub={`${pendingPayments._count} payments to verify`} />
        <Stat label="Collected this month" value={money(monthCollected._sum.amount)} tone="green" sub={`${monthDeals.length} deals signed · ${money(monthDeals.reduce((a, d) => a + Number(d.price), 0))}`} />
        <Stat label="Available units" value={`${unitCount("AVAILABLE")} / ${totalUnits}`} href="/inventory" sub={`${unitCount("RESERVED")} reserved · ${unitCount("SOLD")} sold · ${unitCount("BLOCKED")} blocked`} />
        <Stat label="Reservations expiring ≤48h" value={reservationsExpiring.length} tone={reservationsExpiring.length ? "amber" : undefined} href="/reservations" />
        <Stat label="Overdue follow-ups" value={overdueFollowUps} tone={overdueFollowUps ? "red" : undefined} href="/follow-ups" />
        <Stat label={all ? "Commission payable now" : "My commission payable"} value={money(commissionPayable)} href="/commissions" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="card overflow-x-auto p-0">
          <div className="flex items-center justify-between px-5 pt-4"><h2 className="h2">Top overdue buyers</h2><Link href="/collections" className="link text-sm">All →</Link></div>
          <table className="tbl mt-2">
            <thead><tr><th>Buyer</th><th>Unit</th><th>Overdue</th><th>Days</th><th>Agent</th></tr></thead>
            <tbody>
              {topDebtors.map(({ deal, f }) => (
                <tr key={deal.id}>
                  <td><Link href={`/deals/${deal.id}`} className="link">{deal.client.fullName}</Link><div className="text-xs text-slate-500">{deal.client.phone}</div></td>
                  <td>{deal.unit.code}</td><td className="font-semibold text-rose-700">{money(f.overdueAmount)}</td><td>{f.oldestOverdueDays}</td><td>{deal.agent.name}</td>
                </tr>
              ))}
              {topDebtors.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500">Nobody is overdue.</td></tr>}
            </tbody>
          </table>
        </div>

        {all ? (
          <div className="card overflow-x-auto p-0">
            <h2 className="h2 px-5 pt-4">Sales by agent</h2>
            <table className="tbl mt-2">
              <thead><tr><th>Agent</th><th>Deals</th><th>Sold</th><th>Collected</th><th>Overdue</th></tr></thead>
              <tbody>
                {agentRows.map((r) => (
                  <tr key={r.a.id}><td>{r.a.name}</td><td>{r.deals}</td><td>{money(r.sold)}</td><td className="text-emerald-700">{money(r.collected)}</td><td className={r.overdue ? "text-rose-600" : ""}>{money(r.overdue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card">
            <h2 className="h2 mb-3">Reservations expiring soon</h2>
            {reservationsExpiring.length === 0 ? <p className="muted">None.</p> : reservationsExpiring.map((r) => (
              <div key={r.id} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{r.unit.code} · {r.client.fullName}</span><span className="text-rose-600">{fmtDate(r.expiresAt, s.calendar)}</span></div>
            ))}
          </div>
        )}

        <div className="card">
          <h2 className="h2 mb-3">Lead sources (last 90 days)</h2>
          <div className="space-y-2">
            {leadsBySource.sort((a, b) => b._count - a._count).map((l) => (
              <div key={l.source} className="flex items-center gap-3 text-sm">
                <div className="w-24 shrink-0">{label(l.source)}</div>
                <div className="h-4 flex-1 rounded bg-slate-100"><div className="h-4 rounded bg-emerald-600" style={{ width: `${(l._count / maxSource) * 100}%` }} /></div>
                <div className="w-8 text-right">{l._count}</div>
              </div>
            ))}
            {leadsBySource.length === 0 && <p className="muted">No leads yet.</p>}
          </div>
        </div>

        <div className="card">
          <h2 className="h2 mb-3">Lead pipeline</h2>
          <div className="grid grid-cols-6 gap-2 text-center text-xs">
            {funnel.map((f) => (
              <Link key={f.st} href={`/leads?status=${f.st}`} className="rounded-lg bg-slate-50 p-3 hover:bg-slate-100">
                <div className="text-xl font-semibold text-slate-800">{f.n}</div>{label(f.st)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
