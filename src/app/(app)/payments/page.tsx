import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { guardCompanyPayments } from "@/lib/route-guards";
import { getSession } from "@/lib/session";
import { FINANCE_VIEW } from "@/lib/permissions";
import { ExportButtons } from "@/components/ExportButtons";
import { canConfirmPayments, seesAll } from "@/lib/permissions";
import { fmtDate, fmtDateTime, label, money } from "@/lib/format";
import { sum } from "@/lib/finance";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { reviewPayment } from "../deals/actions";
import { confirmDepositAction } from "../reservations/actions";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; status?: string; q?: string }> }) {
  // Guard: Check if user has permission to view payments
  await guardCompanyPayments();
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const sp = await searchParams;
  const status = sp.status ?? "PENDING";
  const where: Prisma.PaymentWhereInput = { companyId: s.companyId, ...(status !== "ALL" ? { status: status as never } : {}) };
  if (!seesAll(s.role)) where.deal = { agentId: s.userId };
  if (sp.q) where.OR = [{ reference: { contains: sp.q, mode: "insensitive" } }, { deal: { contractNo: { contains: sp.q, mode: "insensitive" } } }, { deal: { client: { fullName: { contains: sp.q, mode: "insensitive" } } } }, { deal: { client: { phone: { contains: sp.q } } } }];
  const payments = await db.payment.findMany({
    where,
    include: { deal: { include: { client: true, unit: true, agent: true } }, recordedBy: true, confirmedBy: true, receipt: true },
    orderBy: status === "PENDING" ? { createdAt: "asc" } : { paidAt: "desc" },
    take: 300,
  });
  const finance = canConfirmPayments(s.role);
  const deposits = canConfirmPayments(s.role)
    ? await db.reservation.findMany({ where: { companyId: s.companyId, status: "ACTIVE", depositAmount: { gt: 0 }, depositConfirmedAt: null }, include: { unit: true, client: true, agent: true }, orderBy: { createdAt: "asc" } })
    : [];
  return (
    <div>
      <PageHeader title="Payments" sub="Payments recorded by agents wait here until the accountant checks the bank or Telebirr reference. Only confirmed payments count." actions={<ExportButtons report="payments" />} />
      {deposits.length > 0 && (
        <div className="card mb-6 p-0">
          <h2 className="h2 px-5 pt-4">Reservation deposits to confirm</h2>
          <p className="muted px-5">A confirmed deposit keeps the unit held after the reservation date until the Sales Manager decides. It counts toward the price if the buyer purchases.</p>
          <ul className="divide-y divide-slate-100">
            {deposits.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1"><span className="font-medium">{money(r.depositAmount)}</span> · {r.client.fullName} · {r.unit.code} <span className="text-slate-500">· {r.agent.name} · until {fmtDate(r.expiresAt, s.calendar)}</span></div>
                <form action={confirmDepositAction} className="flex gap-1">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="reference" className="input w-32 py-1" placeholder="Bank / Telebirr ref" required />
                  <SubmitButton className="btn btn-sm">Confirm deposit</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Flash msg={sp.msg} error={sp.error} />
<form className="mb-4 flex flex-wrap gap-2 print:hidden">
        <input name="q" defaultValue={sp.q} placeholder="Search buyer, contract or reference" className="input max-w-xs" />
        <select name="status" defaultValue={status} className="input max-w-[12rem]"><option value="PENDING">Waiting for confirmation</option><option value="CONFIRMED">Confirmed</option><option value="REJECTED">Rejected</option><option value="ALL">All</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="mb-2 flex">
        <span className="muted ml-auto">{payments.length} payments · {money(sum(payments.map((p) => Number(p.amount))))}</span>
      </div>
      <div className="card overflow-x-auto p-0">
        {payments.length === 0 ? <div className="p-5"><Empty>No {status.toLowerCase()} payments.</Empty></div> : (
          <table className="tbl">
            <thead><tr><th>Paid on</th><th>Deal</th><th>Buyer</th><th>Amount</th><th>Method / Ref</th><th>Receipt</th><th>Recorded</th><th>Status</th>{finance && status === "PENDING" && <th>Review</th>}</tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paidAt, s.calendar)}</td>
                  <td><Link href={`/deals/${p.dealId}`} className="link">{p.deal.contractNo}</Link><div className="text-xs text-slate-500">{p.deal.unit.code} · {p.deal.agent.name}</div></td>
                  <td>{p.deal.client.fullName}</td>
                  <td className="font-medium">{money(p.amount)}</td>
                  <td>{label(p.method)}<div className="text-xs text-slate-500">{p.reference ?? "—"}</div></td>
                  <td>{p.receipt ? <a className="link" href={`/api/documents/${p.receipt.id}`} target="_blank">View</a> : <span className="text-xs text-amber-600">Missing</span>}</td>
                  <td>{p.recordedBy.name}<div className="text-xs text-slate-500">{fmtDateTime(p.createdAt, s.calendar)}</div></td>
                  <td><Badge>{p.status}</Badge>{p.confirmedBy && <div className="text-xs text-slate-500">{p.confirmedBy.name}</div>}{p.receiptNo != null && <Link href={`/payments/${p.id}/receipt`} className="link text-xs">Receipt {p.receiptNo}</Link>}{p.rejectReason && <div className="text-xs text-rose-600">{p.rejectReason}</div>}</td>
                  {finance && status === "PENDING" && (
                    <td>
                      <div className="flex gap-1">
                        <form action={reviewPayment}>
                          <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="decision" value="confirm" />
                          <SubmitButton className="btn btn-sm">Confirm</SubmitButton>
                        </form>
                        <form action={reviewPayment} className="flex gap-1">
                          <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="decision" value="reject" />
                          <input name="reason" className="input w-28 py-1" placeholder="Reject reason" />
                          <SubmitButton className="btn-secondary btn-sm">Reject</SubmitButton>
                        </form>
                      </div>
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
