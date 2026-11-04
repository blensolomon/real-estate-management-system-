import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canConfirmPayments, seesAll } from "@/lib/permissions";
import { fmtDate, fmtDateTime, label, money, toDateInput } from "@/lib/format";
import { commissionState, dealFinancials } from "@/lib/finance";
import { DOCUMENT_TYPES, PAYMENT_METHODS } from "@/lib/options";
import { Badge, Empty, Flash, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DateField } from "@/components/DateField";
import { cancelDeal, approveCommission, markCommissionPaid, recordPayment, reviewPayment, uploadDealDocument } from "../actions";

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const deal = await db.deal.findFirst({
    where: { id, companyId: s.companyId },
    include: {
      unit: { include: { project: true } },
      client: true,
      agent: true,
      installments: true,
      payments: { include: { recordedBy: true, confirmedBy: true, receipt: true }, orderBy: { paidAt: "desc" } },
      documents: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      payouts: { include: { approvedBy: true }, orderBy: { approvedAt: "asc" } },
    },
  });
  if (!deal || (!seesAll(s.role) && deal.agentId !== s.userId)) notFound();
  const f = dealFinancials(deal);
  const c = commissionState(deal, f.confirmed, deal.payouts);
  const finance = canConfirmPayments(s.role);
  const path = `/deals/${deal.id}`;

  return (
    <div>
      <PageHeader
        title={`Deal ${deal.contractNo}`}
        sub={<>{deal.unit.project.name} · {deal.unit.code} · <Link className="link" href={`/clients/${deal.clientId}`}>{deal.client.fullName}</Link> ({deal.client.phone}) · agent {deal.agent.name} · signed {fmtDate(deal.signedAt, s.calendar)}</>}
        actions={<Badge>{deal.status}</Badge>}
      />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Price" value={money(f.price)} />
        <Stat label="Confirmed paid" value={money(f.confirmed)} tone="green" sub={`${f.price ? Math.round((f.confirmed / f.price) * 100) : 0}% collected`} />
        <Stat label="Pending confirmation" value={money(f.pending)} tone="amber" />
        <Stat label="Balance" value={money(f.balance)} />
        <Stat label="Overdue" value={money(f.overdueAmount)} tone={f.overdueAmount > 0 ? "red" : undefined} sub={f.overdueAmount > 0 ? `oldest ${f.oldestOverdueDays} days` : f.nextDue ? `next: ${money(f.nextDue.remaining)} on ${fmtDate(f.nextDue.dueDate, s.calendar)}` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="card overflow-x-auto p-0">
            <h2 className="h2 px-5 pt-4">Payment plan</h2>
            <table className="tbl mt-2">
              <thead><tr><th>#</th><th>Item</th><th>Due</th><th>Amount</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead>
              <tbody>
                {f.installments.map((i) => (
                  <tr key={i.id}>
                    <td>{i.seq}</td><td>{i.label}</td><td>{fmtDate(i.dueDate, s.calendar)}</td>
                    <td>{money(i.amount)}</td><td className="text-emerald-700">{money(i.paid)}</td><td>{money(i.remaining)}</td>
                    <td>{i.remaining === 0 ? <Badge tone="green">Paid</Badge> : i.overdue ? <Badge tone="red">{`${i.daysOverdue}d overdue`}</Badge> : i.paid > 0 ? <Badge tone="amber">Partial</Badge> : <Badge tone="gray">Upcoming</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card overflow-x-auto p-0">
            <h2 className="h2 px-5 pt-4">Payments</h2>
            {deal.payments.length === 0 ? <div className="p-5"><Empty>No payments recorded.</Empty></div> : (
              <table className="tbl mt-2">
                <thead><tr><th>Paid on</th><th>Amount</th><th>Method / Ref</th><th>Receipt</th><th>Recorded by</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {deal.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.paidAt, s.calendar)}</td>
                      <td className="font-medium">{money(p.amount)}</td>
                      <td>{label(p.method)}<div className="text-xs text-slate-500">{p.reference ?? "—"}</div></td>
                      <td>{p.receipt ? <a className="link" href={`/api/documents/${p.receipt.id}`} target="_blank">View</a> : <span className="text-xs text-amber-600">None</span>}</td>
                      <td>{p.recordedBy.name}<div className="text-xs text-slate-500">{fmtDateTime(p.createdAt, s.calendar)}</div></td>
                      <td><Badge>{p.status}</Badge>{p.confirmedBy && <div className="text-xs text-slate-500">by {p.confirmedBy.name}</div>}{p.rejectReason && <div className="text-xs text-rose-600">{p.rejectReason}</div>}</td>
                      <td>
                        {finance && p.status === "PENDING" && (
                          <div className="flex flex-col gap-1">
                            <form action={reviewPayment}>
                              <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="decision" value="confirm" /><input type="hidden" name="returnTo" value={path} />
                              <SubmitButton className="btn btn-sm w-full">Confirm</SubmitButton>
                            </form>
                            <form action={reviewPayment} className="flex gap-1">
                              <input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="decision" value="reject" /><input type="hidden" name="returnTo" value={path} />
                              <input name="reason" className="input w-20 py-1" placeholder="Reason" />
                              <SubmitButton className="btn-secondary btn-sm">Reject</SubmitButton>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {deal.status !== "CANCELLED" && (
              <form action={recordPayment} className="grid grid-cols-2 gap-3 border-t border-slate-100 p-5 md:grid-cols-3">
                <div className="col-span-full"><h3 className="font-semibold">Record a payment</h3><p className="muted">Recorded payments stay pending until Finance confirms them against the bank statement.</p></div>
                <input type="hidden" name="dealId" value={deal.id} />
                <div><label className="lbl">Amount (ETB)</label><input name="amount" className="input" defaultValue={f.overdueAmount || f.nextDue?.remaining || ""} required /></div>
                <div className="col-span-2"><label className="lbl">Paid on</label><DateField name="paidAt" calendar={s.calendar} defaultValue={toDateInput(new Date())} required /></div>
                <div><label className="lbl">Method</label><select name="method" className="input">{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></div>
                <div><label className="lbl">Bank / Telebirr reference</label><input name="reference" className="input" placeholder="FT23…" /></div>
                <div className="md:col-span-2"><label className="lbl">Receipt (PDF/image)</label><input name="receipt" type="file" accept="application/pdf,image/*" className="input" /></div>
                <div><SubmitButton>Record payment</SubmitButton></div>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-2 text-sm">
            <h2 className="h2">Commission · {deal.agent.name}</h2>
            <div className="flex justify-between"><span className="text-slate-500">Rate</span><span>{Number(deal.commissionRate)}%</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Total earned</span><span>{money(c.total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Unlocked by collections</span><span>{money(c.accrued)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Approved, not yet paid</span><span>{money(c.approved)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Paid to agent</span><span>{money(c.paid)}</span></div>
            <div className="flex justify-between font-semibold"><span>Payable now</span><span className="text-emerald-700">{money(c.payable)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500">Locked until buyer pays</span><span>{money(c.locked)}</span></div>
            {deal.payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500">
                <span>{p.status === "PAID" ? `Paid ${money(p.amount)} on ${fmtDate(p.paidAt, s.calendar)}${p.reference ? ` (${p.reference})` : ""}` : `Approved ${money(p.amount)} on ${fmtDate(p.approvedAt, s.calendar)} by ${p.approvedBy.name}`}</span>
                {finance && p.status === "APPROVED" && (
                  <form action={markCommissionPaid} className="flex gap-1">
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input type="hidden" name="returnTo" value={`/deals/${deal.id}`} />
                    <input name="reference" placeholder="Ref" className="input w-24 py-1" />
                    <SubmitButton className="btn btn-sm">Mark paid</SubmitButton>
                  </form>
                )}
              </div>
            ))}
            {finance && c.payable > 0 && (
              <form action={approveCommission} className="flex gap-1 pt-2">
                <input type="hidden" name="dealId" value={deal.id} />
                <input name="amount" defaultValue={c.payable} className="input py-1" />
                <SubmitButton className="btn btn-sm">Approve</SubmitButton>
              </form>
            )}
          </div>

          <div className="card space-y-3 text-sm">
            <h2 className="h2">Documents</h2>
            {deal.documents.length === 0 && <Empty>No documents yet.</Empty>}
            <ul className="space-y-1">
              {deal.documents.map((d) => (
                <li key={d.id} className="flex justify-between gap-2">
                  <a className="link truncate" href={`/api/documents/${d.id}`} target="_blank">{d.fileName}</a>
                  <span className="shrink-0 text-xs text-slate-500">{d.type} · {fmtDate(d.createdAt, s.calendar)}</span>
                </li>
              ))}
            </ul>
            <form action={uploadDealDocument} className="space-y-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="dealId" value={deal.id} />
              <select name="type" className="input">{DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
              <input name="file" type="file" accept="application/pdf,image/*" className="input" required />
              <SubmitButton className="btn-secondary w-full">Upload</SubmitButton>
            </form>
          </div>

          {s.role === "OWNER" && deal.status !== "CANCELLED" && (
            <form action={cancelDeal} className="card space-y-2">
              <h2 className="h2 text-rose-700">Cancel deal</h2>
              <input type="hidden" name="dealId" value={deal.id} />
              <input name="reason" className="input" placeholder="Reason" required />
              <SubmitButton className="btn-danger w-full" confirm="Cancel this deal and release the unit?">Cancel deal</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
