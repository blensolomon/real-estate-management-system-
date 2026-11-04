import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canManage, seesAll } from "@/lib/permissions";
import { expireReservations } from "@/lib/reservations";
import { money } from "@/lib/format";
import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createReservation } from "../actions";

export default async function NewReservationPage({ searchParams }: { searchParams: Promise<{ unitId?: string; leadId?: string; error?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER", "AGENT"]);
  const sp = await searchParams;
  await expireReservations(s.companyId);
  const [company, units, leads] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: s.companyId } }),
    db.unit.findMany({ where: { companyId: s.companyId, status: "AVAILABLE" }, include: { project: true }, orderBy: [{ project: { name: "asc" } }, { code: "asc" }] }),
    db.lead.findMany({
      where: { companyId: s.companyId, status: { notIn: ["LOST"] }, ...(seesAll(s.role) ? {} : { ownerId: s.userId }) },
      orderBy: { name: "asc" },
    }),
  ]);
  const lead = leads.find((l) => l.id === sp.leadId);
  return (
    <div className="max-w-2xl">
      <PageHeader title="New reservation" sub={`Holds the unit for ${company.reservationDays} days, then it is released automatically.`} />
      <Flash error={sp.error} />
      <form action={createReservation} className="card grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="lbl">Unit (available only) *</label>
          <select name="unitId" defaultValue={sp.unitId ?? ""} className="input" required>
            <option value="">Select a unit…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.project.name} · {u.code} · {u.type ?? ""} · {money(u.price)}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="lbl">From lead</label>
          <select name="leadId" defaultValue={sp.leadId ?? ""} className="input">
            <option value="">— none —</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.phone}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">The lead&apos;s owner gets credit for the reservation and the resulting deal.</p>
        </div>
        <div><label className="lbl">Buyer full name *</label><input name="fullName" defaultValue={lead?.name} className="input" required /></div>
        <div><label className="lbl">Buyer phone *</label><input name="phone" defaultValue={lead?.phone} className="input" required /></div>
        <div><label className="lbl">ID / passport no.</label><input name="idNumber" className="input" /></div>
        <div><label className="lbl">Deposit (ETB)</label><input name="depositAmount" className="input" defaultValue="0" /></div>
        {canManage(s.role) && <div><label className="lbl">Hold for (days)</label><input name="days" type="number" min={1} max={90} defaultValue={company.reservationDays} className="input" /></div>}
        <div className="col-span-2"><label className="lbl">Note</label><input name="note" className="input" /></div>
        <div className="col-span-2"><SubmitButton>Reserve unit</SubmitButton></div>
      </form>
    </div>
  );
}
