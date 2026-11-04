import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { ADMINS } from "@/lib/permissions";
import { ROLES } from "@/lib/options";
import { canAdmin } from "@/lib/permissions";
import { LOCALES } from "@/i18n";
import { label } from "@/lib/format";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addUser, updateCompany, updateUser } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const s = await requireSession(ADMINS);
  const sp = await searchParams;
  const admin = canAdmin(s.role);
  const [company, users] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: s.companyId } }),
    db.user.findMany({ where: { companyId: s.companyId }, include: { _count: { select: { leads: true, deals: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
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
        {admin && <div className="md:col-span-2"><SubmitButton>Save settings</SubmitButton></div>}
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
