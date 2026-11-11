import Link from "next/link";
import { db } from "@/lib/db";
import { guardCompanyTeam } from "@/lib/route-guards";
import { getSession } from "@/lib/session";
import { MANAGERS } from "@/lib/permissions";
import { money } from "@/lib/format";
import { lastMonths, monthOf } from "@/lib/months";
import { Badge, Empty, PageHeader } from "@/components/ui";

/** Sales team this month: leads, visits, sales against target, and overdue tasks per agent. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  // Guard: Check if user has permission to view team
  await guardCompanyTeam();
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const sp = await searchParams;
  const now = new Date();
  const months = lastMonths(6, s.calendar, now);
  const month = months.find((m) => m.key === sp.m) ?? monthOf(now, s.calendar);
  const inMonth = { gte: month.start, lt: month.end };
  const [agents, leads, visits, deals, targets, overdue] = await Promise.all([
    db.user.findMany({ where: { companyId: s.companyId, active: true, role: { in: ["AGENT", "MANAGER"] } }, orderBy: { name: "asc" } }),
    db.lead.groupBy({ by: ["ownerId"], where: { companyId: s.companyId, createdAt: inMonth }, _count: true }),
    db.followUp.groupBy({ by: ["assigneeId"], where: { companyId: s.companyId, type: "SITE_VISIT", doneAt: inMonth, visitOutcome: { not: "NO_SHOW" } }, _count: true }),
    db.deal.groupBy({ by: ["agentId"], where: { companyId: s.companyId, signedAt: inMonth, status: { not: "CANCELLED" } }, _count: true, _sum: { price: true } }),
    db.salesTarget.findMany({ where: { companyId: s.companyId, month: month.key } }),
    db.followUp.groupBy({ by: ["assigneeId"], where: { companyId: s.companyId, doneAt: null, dueAt: { lt: now } }, _count: true }),
  ]);
  const rows = agents.map((a) => {
    const nLeads = leads.find((l) => l.ownerId === a.id)?._count ?? 0;
    const d = deals.find((x) => x.agentId === a.id);
    const sold = Number(d?._sum.price ?? 0);
    const target = Number(targets.find((t) => t.userId === a.id)?.amount ?? 0);
    return { a, nLeads, visits: visits.find((v) => v.assigneeId === a.id)?._count ?? 0, sales: d?._count ?? 0, sold, target, overdue: overdue.find((o) => o.assigneeId === a.id)?._count ?? 0 };
  }).sort((x, y) => y.sold - x.sold);

  return (
    <div>
      <PageHeader title="Sales team" sub="Who is selling, who is following up, and who needs help. Pick a month to compare." />
      <form className="mb-4 flex gap-2">
        <select name="m" defaultValue={month.key} className="input w-48">
          {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button className="btn-secondary">Show</button>
      </form>
      {rows.length === 0 ? <Empty>No agents yet. Add them in Settings.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const pct = r.target ? Math.round((r.sold / r.target) * 100) : null;
            return (
              <div key={r.a.id} className="card">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{r.a.name}</span>
                  {r.overdue > 0 ? <Badge tone="red">{`${r.overdue} overdue tasks`}</Badge> : <Badge tone="green">On top of tasks</Badge>}
                </div>
                <dl className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div><dt className="text-slate-500">New leads</dt><dd className="text-lg font-semibold">{r.nLeads}</dd></div>
                  <div><dt className="text-slate-500">Site visits</dt><dd className="text-lg font-semibold">{r.visits}</dd></div>
                  <div><dt className="text-slate-500">Sales</dt><dd className="text-lg font-semibold">{r.sales}</dd></div>
                  <div><dt className="text-slate-500">Visit→sale</dt><dd className="text-lg font-semibold">{r.visits ? `${Math.round((r.sales / r.visits) * 100)}%` : "—"}</dd></div>
                </dl>
                <div className="mt-3 text-sm">{money(r.sold)} {r.target ? <span className="text-slate-500">of {money(r.target)} target</span> : <Link href="/targets" className="link text-xs">set a target</Link>}</div>
                {pct !== null && (
                  <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
                    <div className={`h-full ${pct >= 100 ? "bg-emerald-600" : pct >= 50 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
