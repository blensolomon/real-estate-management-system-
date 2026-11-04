import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { fmtDate, money, toDateInput } from "@/lib/format";
import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DateField } from "@/components/DateField";
import { createDeal } from "../actions";
import { notFound } from "next/navigation";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ reservationId?: string; error?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER", "AGENT"]);
  const sp = await searchParams;
  const r = await db.reservation.findFirst({
    where: { id: sp.reservationId ?? "", companyId: s.companyId, status: "ACTIVE" },
    include: { unit: { include: { project: true } }, client: true, agent: true },
  });
  if (!r) notFound();
  const count = await db.deal.count({ where: { companyId: s.companyId } });
  const today = toDateInput(new Date());
  return (
    <div className="max-w-2xl">
      <PageHeader title="Convert reservation to deal" sub={`${r.unit.project.name} · ${r.unit.code} for ${r.client.fullName} (agent ${r.agent.name}). Reserved until ${fmtDate(r.expiresAt, s.calendar)}.`} />
      <Flash error={sp.error} />
      <form action={createDeal} className="card grid grid-cols-2 gap-4">
        <input type="hidden" name="reservationId" value={r.id} />
        <div><label className="lbl">Contract no. *</label><input name="contractNo" defaultValue={`C-${String(count + 1).padStart(4, "0")}`} className="input" required /></div>
        <div><label className="lbl">Final price (ETB) *</label><input name="price" defaultValue={Number(r.unit.price)} className="input" required /><p className="mt-1 text-xs text-slate-500">List price {money(r.unit.price)}</p></div>
        <div><label className="lbl">Signed on</label><DateField name="signedAt" calendar={s.calendar} defaultValue={today} required /></div>
        <div><label className="lbl">Down payment due</label><DateField name="firstDue" calendar={s.calendar} defaultValue={today} required /></div>
        <div><label className="lbl">Down payment %</label><input name="downPct" defaultValue={30} className="input" required /></div>
        <div><label className="lbl">Monthly installments (0 = pay in full)</label><input name="months" type="number" min={0} max={120} defaultValue={12} className="input" required /></div>
        {Number(r.depositAmount) > 0 && <p className="col-span-2 text-sm text-slate-600">The reservation deposit of {money(r.depositAmount)} will be added as a pending payment for Finance to confirm.</p>}
        <div className="col-span-2"><SubmitButton>Create deal &amp; payment plan</SubmitButton></div>
      </form>
    </div>
  );
}
