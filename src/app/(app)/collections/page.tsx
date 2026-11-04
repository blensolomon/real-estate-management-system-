import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { loadCollections } from "@/lib/collections";
import { fmtDate, money } from "@/lib/format";
import { Empty, PageHeader, Stat } from "@/components/ui";

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ project?: string; agent?: string; view?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const extra = {
    ...(sp.project ? { unit: { projectId: sp.project } } : {}),
    ...(sp.agent ? { agentId: sp.agent } : {}),
  };
  const [c, projects, agents] = await Promise.all([
    loadCollections(s, extra),
    db.project.findMany({ where: { companyId: s.companyId }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { companyId: s.companyId }, orderBy: { name: "asc" } }),
  ]);
  const view = sp.view ?? "overdue";
  const rows = c.rows
    .filter(({ f }) => (view === "overdue" ? f.overdueAmount > 0 : f.balance > 0))
    .sort((a, b) => b.f.oldestOverdueDays - a.f.oldestOverdueDays || b.f.overdueAmount - a.f.overdueAmount);
  const pct = (n: number) => (c.contracted ? Math.round((n / c.contracted) * 100) : 0);

  return (
    <div>
      <PageHeader title="Collections" sub="Who owes how much, and since when. Based on confirmed payments only." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Contracted" value={money(c.contracted)} />
        <Stat label="Collected (confirmed)" value={money(c.collected)} tone="green" sub={`${pct(c.collected)}% of contracted`} />
        <Stat label="Awaiting confirmation" value={money(c.pending)} tone="amber" href="/payments" />
        <Stat label="Outstanding" value={money(c.outstanding)} />
        <Stat label="Overdue" value={money(c.overdue)} tone="red" />
      </div>
      <div className="card mb-6">
        <h2 className="h2 mb-3">Aging</h2>
        <div className="grid grid-cols-5 gap-2 text-center text-sm">
          {[
            ["Not yet due", c.totals.current, "bg-slate-100"],
            ["1–30 days", c.totals.d1_30, "bg-amber-100"],
            ["31–60 days", c.totals.d31_60, "bg-orange-200"],
            ["61–90 days", c.totals.d61_90, "bg-rose-200"],
            ["90+ days", c.totals.d90plus, "bg-rose-400 text-white"],
          ].map(([l, v, cls]) => (
            <div key={l as string} className={`rounded-lg p-3 ${cls}`}><div className="text-xs">{l}</div><div className="font-semibold">{money(v as number)}</div></div>
          ))}
        </div>
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="view" defaultValue={view} className="input w-48"><option value="overdue">Overdue only</option><option value="all">All with balance</option></select>
        <select name="project" defaultValue={sp.project ?? ""} className="input w-48"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {s.role !== "AGENT" && <select name="agent" defaultValue={sp.agent ?? ""} className="input w-48"><option value="">All agents</option>{agents.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <button className="btn-secondary">Apply</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <div className="p-5"><Empty>No buyers {view === "overdue" ? "are overdue" : "owe a balance"}.</Empty></div> : (
          <table className="tbl">
            <thead><tr><th>Buyer</th><th>Deal / Unit</th><th>Agent</th><th>Overdue</th><th>Overdue since</th><th>Balance</th><th>Pending</th><th>Next due</th></tr></thead>
            <tbody>
              {rows.map(({ deal, f }) => {
                const first = f.installments.find((i) => i.overdue);
                return (
                  <tr key={deal.id}>
                    <td><Link href={`/clients/${deal.clientId}`} className="link font-medium">{deal.client.fullName}</Link><div className="text-xs text-slate-500">{deal.client.phone}</div></td>
                    <td><Link href={`/deals/${deal.id}`} className="link">{deal.contractNo}</Link><div className="text-xs text-slate-500">{deal.unit.project.name} · {deal.unit.code}</div></td>
                    <td>{deal.agent.name}</td>
                    <td className={f.overdueAmount > 0 ? "font-semibold text-rose-700" : ""}>{money(f.overdueAmount)}</td>
                    <td>{first ? <>{fmtDate(first.dueDate, s.calendar)}<div className="text-xs text-rose-600">{f.oldestOverdueDays} days</div></> : "—"}</td>
                    <td>{money(f.balance)}</td>
                    <td className="text-amber-700">{f.pending > 0 ? money(f.pending) : "—"}</td>
                    <td>{f.nextDue ? <>{money(f.nextDue.remaining)}<div className="text-xs text-slate-500">{fmtDate(f.nextDue.dueDate, s.calendar)}</div></> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
