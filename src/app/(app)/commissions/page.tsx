import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canConfirmPayments, seesAll } from "@/lib/permissions";
import { fmtDate, money } from "@/lib/format";
import { commissionState, dealFinancials, round } from "@/lib/finance";
import { Empty, Flash, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { payCommission } from "../deals/actions";

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ agent?: string; msg?: string; error?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const agentFilter = seesAll(s.role) ? sp.agent : s.userId;
  const deals = await db.deal.findMany({
    where: { companyId: s.companyId, ...(agentFilter ? { agentId: agentFilter } : {}) },
    include: { installments: true, payments: true, payouts: true, agent: true, client: true, unit: { include: { project: true } } },
    orderBy: { signedAt: "desc" },
  });
  const agents = await db.user.findMany({ where: { companyId: s.companyId }, orderBy: { name: "asc" } });
  const rows = deals.map((d) => ({ d, c: commissionState(d, dealFinancials(d).confirmed, d.payouts) }));
  const byAgent = new Map<string, { name: string; total: number; accrued: number; paid: number; payable: number; locked: number; deals: number }>();
  for (const { d, c } of rows) {
    const a = byAgent.get(d.agentId) ?? { name: d.agent.name, total: 0, accrued: 0, paid: 0, payable: 0, locked: 0, deals: 0 };
    a.total += c.total; a.accrued += c.accrued; a.paid += c.paid; a.payable += c.payable; a.locked += c.locked; a.deals += d.status === "CANCELLED" ? 0 : 1;
    byAgent.set(d.agentId, a);
  }
  const t = [...byAgent.values()].reduce((x, a) => ({ total: x.total + a.total, payable: x.payable + a.payable, paid: x.paid + a.paid, locked: x.locked + a.locked }), { total: 0, payable: 0, paid: 0, locked: 0 });
  const finance = canConfirmPayments(s.role);

  return (
    <div>
      <PageHeader title="Commissions" sub="Earned when a deal is signed. Becomes payable in proportion to confirmed buyer payments, so there's no dispute over what is owed." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total earned" value={money(round(t.total))} />
        <Stat label="Payable now" value={money(round(t.payable))} tone="green" />
        <Stat label="Already paid" value={money(round(t.paid))} />
        <Stat label="Locked (awaiting buyer payments)" value={money(round(t.locked))} tone="amber" />
      </div>
      {seesAll(s.role) && (
        <div className="card mb-6 overflow-x-auto p-0">
          <h2 className="h2 px-5 pt-4">By agent</h2>
          <table className="tbl mt-2">
            <thead><tr><th>Agent</th><th>Deals</th><th>Earned</th><th>Unlocked</th><th>Paid</th><th>Payable</th><th>Locked</th></tr></thead>
            <tbody>
              {[...byAgent.entries()].map(([id, a]) => (
                <tr key={id}>
                  <td><Link className="link" href={`/commissions?agent=${id}`}>{a.name}</Link></td><td>{a.deals}</td><td>{money(a.total)}</td><td>{money(a.accrued)}</td><td>{money(a.paid)}</td><td className="font-semibold text-emerald-700">{money(a.payable)}</td><td>{money(a.locked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="h2">Statement {agentFilter ? `· ${agents.find((a) => a.id === agentFilter)?.name ?? ""}` : "· all agents"}</h2>
        {seesAll(s.role) && (
          <form className="ml-auto flex gap-2">
            <select name="agent" defaultValue={sp.agent ?? ""} className="input w-48"><option value="">All agents</option>{agents.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <button className="btn-secondary">Filter</button>
          </form>
        )}
      </div>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <div className="p-5"><Empty>No deals.</Empty></div> : (
          <table className="tbl">
            <thead><tr><th>Deal</th><th>Agent</th><th>Signed</th><th>Price</th><th>Rate</th><th>Earned</th><th>Unlocked</th><th>Paid</th><th>Payable</th>{finance && <th>Pay</th>}</tr></thead>
            <tbody>
              {rows.map(({ d, c }) => (
                <tr key={d.id} className={d.status === "CANCELLED" ? "opacity-50" : ""}>
                  <td><Link href={`/deals/${d.id}`} className="link">{d.contractNo}</Link><div className="text-xs text-slate-500">{d.unit.project.name} {d.unit.code} · {d.client.fullName}</div></td>
                  <td>{d.agent.name}</td>
                  <td>{fmtDate(d.signedAt, s.calendar)}</td>
                  <td>{money(d.price)}</td>
                  <td>{Number(d.commissionRate)}%</td>
                  <td>{money(c.total)}</td>
                  <td>{money(c.accrued)}</td>
                  <td>{money(c.paid)}</td>
                  <td className="font-semibold text-emerald-700">{money(c.payable)}</td>
                  {finance && (
                    <td>
                      {c.payable > 0 && (
                        <form action={payCommission} className="flex gap-1">
                          <input type="hidden" name="dealId" value={d.id} />
                          <input type="hidden" name="returnTo" value={`/commissions${sp.agent ? `?agent=${sp.agent}` : ""}`} />
                          <input name="amount" defaultValue={c.payable} className="input w-28 py-1" />
                          <SubmitButton className="btn btn-sm">Pay</SubmitButton>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
