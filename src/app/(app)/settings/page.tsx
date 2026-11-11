import { saveChecklist } from "./checklist-actions";
import { DOC_TYPES } from "@/lib/checklist";
import { db } from "@/lib/db";
import { guardCompanySettings } from "@/lib/route-guards";
import { getSession } from "@/lib/session";
import { ADMINS } from "@/lib/permissions";
import { ROLES } from "@/lib/options";
import { canAdmin } from "@/lib/permissions";
import { LOCALES } from "@/i18n";
import { label } from "@/lib/format";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addUser, moveLeadsAction, savePenaltyRule, updateCompany, updateUser } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  // Guard: Check if user has permission to view settings
  await guardCompanySettings();
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  const sp = await searchParams;
  const admin = canAdmin(s.role);
  const [company, users, requirements] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: s.companyId } }),
    db.user.findMany({ where: { companyId: s.companyId }, include: { _count: { select: { leads: true, deals: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.documentRequirement.findMany({ where: { companyId: s.companyId } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <Flash msg={sp.msg} error={sp.error} />
      <form action={updateCompany} className="card grid max-w-3xl gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><h2 className="h2">Company</h2></div>
        <div><label className="lbl">Company name</label><input name="name" defaultValue={company.name} className="input" disabled={!admin} /></div>
        <div>
          <label className="lbl">Calendar</label>
          <select name="calendar" defaultValue={company.calendar} className="input" disabled={!admin}>
            <option value="ETHIOPIAN">Ethiopian (ዓ.ም)</option><option value="GREGORIAN">Gregorian</option>
          </select>
        </div>
        <div><label className="lbl">Reservation hold (days)</label><input name="reservationDays" type="number" defaultValue={company.reservationDays} className="input" disabled={!admin} /></div>
        <div><label className="lbl">Language</label><select name="locale" defaultValue={company.locale} className="input" disabled={!admin}>{LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
        <div><label className="lbl">Flag leads with no contact after (days)</label><input name="staleLeadDays" type="number" min={1} max={30} defaultValue={company.staleLeadDays} className="input" disabled={!admin} /></div>
        <div><label className="lbl">Follow-up after site visit (days)</label><input name="followUpDays" type="number" defaultValue={company.followUpDays} className="input" disabled={!admin} /></div>
        <div><label className="lbl">Price below list needing approval (%)</label><input name="discountApprovalPct" type="number" step="0.5" min={0} max={50} defaultValue={Number(company.discountApprovalPct)} className="input" disabled={!admin} /><p className="mt-1 text-xs text-slate-500">Sales by agents priced lower than this go to the Sales Manager or Owner first.</p></div>
        <div><label className="lbl">Commission payable after buyer has paid (%)</label><input name="commissionPayablePct" type="number" step="1" min={0} max={100} defaultValue={Number(company.commissionPayablePct)} className="input" disabled={!admin} /><p className="mt-1 text-xs text-slate-500">On new sales the full commission becomes payable once this share of the price is confirmed. Older sales keep unlocking step by step.</p></div>
        {admin && <div className="md:col-span-2"><SubmitButton>Save settings</SubmitButton></div>}
      </form>

      <form action={savePenaltyRule} className="card grid max-w-3xl gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><h2 className="h2">Late payments and construction stages</h2><p className="muted">Only the Owner can change these. Penalties are off unless you switch them on; they never compound and the Accountant or Owner can waive them with a reason.</p></div>
        <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="penaltyEnabled" defaultChecked={company.penaltyEnabled} disabled={s.role !== "OWNER"} className="h-5 w-5" /> Charge late penalties</label>
        <div><label className="lbl">Penalty per month late (% of the late amount)</label><input name="penaltyPctPerMonth" type="number" step="0.1" min={0} max={10} defaultValue={Number(company.penaltyPctPerMonth)} className="input" disabled={s.role !== "OWNER"} /></div>
        <div><label className="lbl">Grace period (days)</label><input name="penaltyGraceDays" type="number" min={0} max={90} defaultValue={company.penaltyGraceDays} className="input" disabled={s.role !== "OWNER"} /></div>
        <div><label className="lbl">Maximum total penalty (% of the installment, empty = no cap)</label><input name="penaltyCapPct" type="number" step="0.5" min={1} max={100} defaultValue={company.penaltyCapPct == null ? "" : Number(company.penaltyCapPct)} className="input" disabled={s.role !== "OWNER"} /></div>
        <div><label className="lbl">Stage payment due after stage reached (days)</label><input name="milestoneDueDays" type="number" min={0} max={180} defaultValue={company.milestoneDueDays} className="input" disabled={s.role !== "OWNER"} /></div>
        {s.role === "OWNER" && <div className="md:col-span-2"><SubmitButton>Save payment rules</SubmitButton></div>}
      </form>

      <div className="card overflow-x-auto p-0">
        <h2 className="h2 px-5 pt-4">Team</h2>
        <table className="tbl mt-2">
          <thead><tr><th>Name</th><th>Email</th><th>Leads</th><th>Deals</th><th>Role &amp; status</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td>{u.name} {!u.active && <Badge tone="gray">Inactive</Badge>}</td>
                <td>{u.email}</td>
                <td>{u._count.leads}</td>
                <td>{u._count.deals}</td>
                <td>
                  {u.id === s.userId ? <Badge tone="blue">{u.role}</Badge> : (
                    <form action={updateUser} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="role" defaultValue={u.role} className="input w-32 py-1">{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} /> Active</label>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="external" defaultChecked={u.external} /> External broker</label>
                      <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {admin && (
        <form action={moveLeadsAction} className="card mb-6 grid max-w-3xl gap-3 md:grid-cols-3">
          <div className="md:col-span-3"><h2 className="h2">Move open leads to another agent</h2><p className="muted">Leads stay with the agent who registered them. Use this when an agent leaves; every move is in the audit log.</p></div>
          <select name="fromId" className="input" required>{users.map((u) => <option key={u.id} value={u.id}>From: {u.name}</option>)}</select>
          <select name="toId" className="input" required>{users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>To: {u.name}</option>)}</select>
          <SubmitButton className="btn-secondary" confirm="Move all open leads?">Move leads</SubmitButton>
        </form>
      )}
      <form action={saveChecklist} className="card mb-6 max-w-3xl space-y-3">
        <h2 className="h2">Documents every sale should have</h2>
        <p className="muted">Sales missing any of these show a warning on the sale page. Missing documents never block a sale or a receipt.</p>
        {DOC_TYPES.map((t) => {
          const r = requirements.find((x) => x.type === t);
          return (
            <label key={t} className="flex min-h-11 flex-wrap items-center gap-3 text-sm">
              <input type="checkbox" name={`req_${t}`} defaultChecked={!!r} className="h-5 w-5" />
              <span className="w-32">{label(t)}</span>
              <input name={`label_${t}`} defaultValue={r?.label ?? ""} placeholder="Shown name (optional)" className="input min-w-0 flex-1" />
            </label>
          );
        })}
        <SubmitButton className="btn-secondary">Save checklist</SubmitButton>
      </form>

      <form action={addUser} className="card grid max-w-3xl gap-3 md:grid-cols-3">
        <div className="md:col-span-3"><h2 className="h2">Add team member</h2></div>
        <div><label className="lbl">Name</label><input name="name" className="input" required /></div>
        <div><label className="lbl">Email</label><input name="email" type="email" className="input" required /></div>
        <div><label className="lbl">Phone</label><input name="phone" className="input" /></div>
        <div><label className="lbl">Role</label><select name="role" defaultValue="AGENT" className="input">{ROLES.filter((r) => s.role === "OWNER" || r !== "OWNER").map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></div>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="external" /> External broker</label>
        <div><label className="lbl">Temporary password</label><input name="password" type="text" minLength={8} className="input" required /></div>
        <div className="flex items-end"><SubmitButton>Add user</SubmitButton></div>
      </form>
    </div>
  );
}
