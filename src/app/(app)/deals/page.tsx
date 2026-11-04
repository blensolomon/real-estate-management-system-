import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { fmtDate, money } from "@/lib/format";
import { dealFinancials } from "@/lib/finance";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; status?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const where: Prisma.DealWhereInput = { companyId: s.companyId, ...(sp.status ? { status: sp.status as never } : {}) };
  if (!seesAll(s.role)) where.agentId = s.userId;
  const deals = await db.deal.findMany({
    where,
    include: { unit: { include: { project: true } }, client: true, agent: true, installments: true, payments: true },
    orderBy: { signedAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Deals" sub="Signed sales with their payment plans." actions={<Link href="/reservations" className="btn-secondary">New deal from reservation</Link>} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="mb-4 flex gap-2">
        {["", "ACTIVE", "COMPLETED", "CANCELLED"].map((st) => (
          <Link key={st} href={`/deals${st ? `?status=${st}` : ""}`} className={(sp.status ?? "") === st ? "btn btn-sm" : "btn-secondary btn-sm"}>{st || "All"}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        {deals.length === 0 ? <div className="p-5"><Empty>No deals yet. Convert a reservation into a deal.</Empty></div> : (
          <table className="tbl">
            <thead><tr><th>Contract</th><th>Unit</th><th>Buyer</th><th>Agent</th><th>Price</th><th>Collected</th><th>Balance</th><th>Overdue</th><th>Signed</th><th>Status</th></tr></thead>
            <tbody>
              {deals.map((d) => {
                const f = dealFinancials(d);
                return (
                  <tr key={d.id}>
                    <td><Link href={`/deals/${d.id}`} className="link font-medium">{d.contractNo}</Link></td>
                    <td>{d.unit.code}<div className="text-xs text-slate-500">{d.unit.project.name}</div></td>
                    <td>{d.client.fullName}</td>
                    <td>{d.agent.name}</td>
                    <td>{money(f.price)}</td>
                    <td className="text-emerald-700">{money(f.confirmed)}{f.pending > 0 && <div className="text-xs text-amber-600">+{money(f.pending)} pending</div>}</td>
                    <td>{money(f.balance)}</td>
                    <td>{f.overdueAmount > 0 ? <span className="font-medium text-rose-600">{money(f.overdueAmount)}<div className="text-xs">{f.oldestOverdueDays} days</div></span> : "—"}</td>
                    <td>{fmtDate(d.signedAt, s.calendar)}</td>
                    <td><Badge>{d.status}</Badge></td>
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
