import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { MANAGERS } from "@/lib/permissions";
import { fmtDateTime, money } from "@/lib/format";
import { discountPct } from "@/lib/approvals";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { decideApproval } from "./actions";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const s = await requireSession(MANAGERS);
  const sp = await searchParams;
  const include = { requestedBy: true, decidedBy: true, reservation: { include: { unit: { include: { project: true } }, client: true } } } as const;
  const [pending, recent, company] = await Promise.all([
    db.priceApproval.findMany({ where: { companyId: s.companyId, status: "PENDING" }, include, orderBy: { createdAt: "asc" } }),
    db.priceApproval.findMany({ where: { companyId: s.companyId, status: { not: "PENDING" } }, include, orderBy: { decidedAt: "desc" }, take: 20 }),
    db.company.findUniqueOrThrow({ where: { id: s.companyId }, select: { discountApprovalPct: true } }),
  ]);
  const row = (a: (typeof pending)[number]) => (
    <div className="min-w-0 flex-1">
      <div className="font-medium">{a.reservation.unit.project.name} · {a.reservation.unit.code} · {a.reservation.client.fullName}</div>
      <div className="text-sm"><span className="text-rose-700">{money(a.price)}</span> vs list {money(a.listPrice)} <span className="text-slate-500">({discountPct(Number(a.listPrice), Number(a.price)).toFixed(1)}% below)</span></div>
      <div className="text-xs text-slate-500">Asked by {a.requestedBy.name} · {fmtDateTime(a.createdAt, s.calendar)}{a.reason ? ` · "${a.reason}"` : ""}</div>
    </div>
  );
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Price approvals" sub={`Sales priced more than ${Number(company.discountApprovalPct)}% below list wait here. Change the limit in Settings.`} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="card p-0">
        <h2 className="h2 px-5 pt-4">Waiting for you</h2>
        {pending.length === 0 ? <div className="p-5"><Empty>Nothing waiting.</Empty></div> : (
          <ul className="divide-y divide-slate-100">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {row(a)}
                <form action={decideApproval} className="flex flex-wrap gap-1">
                  <input type="hidden" name="id" value={a.id} />
                  <input name="note" className="input w-36 py-1" placeholder="Note (needed to reject)" />
                  <button name="decision" value="approve" className="btn btn-sm">Approve</button>
                  <button name="decision" value="reject" className="btn-secondary btn-sm">Reject</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card p-0">
        <h2 className="h2 px-5 pt-4">Recent decisions</h2>
        {recent.length === 0 ? <div className="p-5"><Empty>No decisions yet.</Empty></div> : (
          <ul className="divide-y divide-slate-100">
            {recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {row(a)}
                <div className="text-right text-xs"><Badge>{a.status}</Badge><div className="text-slate-500">{a.decidedBy?.name}{a.decisionNote ? ` · ${a.decisionNote}` : ""}</div></div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
