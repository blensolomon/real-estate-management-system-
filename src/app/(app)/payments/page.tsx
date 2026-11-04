import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canConfirmPayments, seesAll } from "@/lib/permissions";
import { fmtDate, fmtDateTime, label, money } from "@/lib/format";
import { sum } from "@/lib/finance";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { reviewPayment } from "../deals/actions";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; status?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status ?? "PENDING";
  const where: Prisma.PaymentWhereInput = { companyId: s.companyId, ...(status !== "ALL" ? { status: status as never } : {}) };
  if (!seesAll(s.role)) where.deal = { agentId: s.userId };
  const payments = await db.payment.findMany({
    where,
    include: { deal: { include: { client: true, unit: true, agent: true } }, recordedBy: true, confirmedBy: true, receipt: true },
    orderBy: status === "PENDING" ? { createdAt: "asc" } : { paidAt: "desc" },
    take: 300,
  });
  const finance = canConfirmPayments(s.role);
  return (
    <div>
      <PageHeader title="Payments" sub="Only confirmed payments reduce a buyer's balance and unlock commission." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="mb-4 flex items-center gap-2">
        {["PENDING", "CONFIRMED", "REJECTED", "ALL"].map((st) => (
          <Link key={st} href={`/payments?status=${st}`} className={status === st ? "btn btn-sm" : "btn-secondary btn-sm"}>{st}</Link>
        ))}
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
                  <td><Badge>{p.status}</Badge>{p.confirmedBy && <div className="text-xs text-slate-500">{p.confirmedBy.name}</div>}{p.rejectReason && <div className="text-xs text-rose-600">{p.rejectReason}</div>}</td>
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
