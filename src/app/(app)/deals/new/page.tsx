import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { SALES } from "@/lib/permissions";
import { fmtDate, money, toDateInput } from "@/lib/format";
import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DateField } from "@/components/DateField";
import { createDeal } from "../actions";
import { notFound } from "next/navigation";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ reservationId?: string; error?: string }> }) {
  const s = await requireSession(SALES);
  const sp = await searchParams;
  const r = await db.reservation.findFirst({
    where: { id: sp.reservationId ?? "", companyId: s.companyId, status: "ACTIVE" },
    include: { unit: { include: { project: true } }, client: true, agent: true },
  });
  if (!r) notFound();
  const count = await db.deal.count({ where: { companyId: s.companyId } });
  const [approval, company] = await Promise.all([
    db.priceApproval.findFirst({ where: { reservationId: r.id }, orderBy: { createdAt: "desc" }, include: { decidedBy: true } }),
    db.company.findUniqueOrThrow({ where: { id: s.companyId }, select: { discountApprovalPct: true } }),
  ]);
  const today = toDateInput(new Date());
  return (
    <div className="max-w-2xl">
      <PageHeader title="Make it a sale" sub={`${r.unit.project.name} · ${r.unit.code} for ${r.client.fullName} (agent ${r.agent.name}). Reserved until ${fmtDate(r.expiresAt, s.calendar)}.`} />
      <Flash error={sp.error} />
      {approval && (
        <div className={`card mb-4 text-sm ${approval.status === "APPROVED" ? "border-emerald-300" : approval.status === "REJECTED" ? "border-rose-300" : "border-amber-300"}`}>
          Price approval for {money(approval.price)}: <b>{approval.status === "PENDING" ? "waiting for the Sales Manager" : approval.status === "APPROVED" ? `approved by ${approval.decidedBy?.name}` : `rejected by ${approval.decidedBy?.name}`}</b>{approval.decisionNote ? ` · ${approval.decisionNote}` : ""}
        </div>
      )}
      <form action={createDeal} className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input type="hidden" name="reservationId" value={r.id} />
        <div><label className="lbl">Contract no. *</label><input name="contractNo" defaultValue={`C-${String(count + 1).padStart(4, "0")}`} className="input" required /></div>
        <div><label className="lbl">Final price (ETB) *</label><input name="price" defaultValue={approval?.status === "APPROVED" ? Number(approval.price) : Number(r.unit.price)} className="input" required /><p className="mt-1 text-xs text-slate-500">List price {money(r.unit.price)}. More than {Number(company.discountApprovalPct)}% below needs approval.</p></div>
        <div className="sm:col-span-2"><label className="lbl">Reason for a lower price (if any)</label><input name="priceReason" className="input" placeholder="e.g. cash buyer, bulk purchase" /></div>
        <div><label className="lbl">Signed on</label><DateField name="signedAt" calendar={s.calendar} defaultValue={today} required /></div>
        <div><label className="lbl">Down payment due</label><DateField name="firstDue" calendar={s.calendar} defaultValue={today} required /></div>
        <div className="sm:col-span-2"><label className="lbl">Payment plan</label><select name="planType" defaultValue="INSTALLMENT" className="input"><option value="INSTALLMENT">Down payment + monthly installments</option><option value="CASH">Full cash payment</option><option value="MORTGAGE">Down payment + bank loan</option></select></div>
        <div><label className="lbl">Down payment %</label><input name="downPct" defaultValue={30} className="input" required /><p className="mt-1 text-xs text-slate-500">Ignored for full cash.</p></div>
        <div><label className="lbl">Months</label><input name="months" type="number" min={0} max={120} defaultValue={12} className="input" required /><p className="mt-1 text-xs text-slate-500">Installments: number of monthly payments. Bank loan: months until the bank pays.</p></div>
        <div className="sm:col-span-2"><label className="lbl">Bank (bank loan only)</label><input name="bankName" className="input" placeholder="CBE, Awash, Dashen…" /></div>
        {Number(r.depositAmount) > 0 && <p className="sm:col-span-2 text-sm text-slate-600">The reservation deposit of {money(r.depositAmount)} {r.depositConfirmedAt ? "counts toward the price as a confirmed payment." : "will be added as a pending payment for the accountant to confirm."}</p>}
        <div className="sm:col-span-2"><SubmitButton>Create sale &amp; payment plan</SubmitButton></div>
      </form>
    </div>
  );
}
