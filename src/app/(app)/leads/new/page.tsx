import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canManage, SALES } from "@/lib/permissions";
import { label } from "@/lib/format";
import { LEAD_SOURCES } from "@/lib/options";
import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createLead } from "../actions";

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requireSession(SALES);
  const { error } = await searchParams;
  const [projects, users] = await Promise.all([
    db.project.findMany({ where: { companyId: s.companyId }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { companyId: s.companyId, active: true, role: { in: ["AGENT", "MANAGER", "OWNER"] } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="max-w-2xl">
      <PageHeader title="New lead" sub="Phone numbers are unique per company, so the same buyer can't be registered twice." />
      <Flash error={error} />
      <form action={createLead} className="card grid grid-cols-2 gap-4">
        <div><label className="lbl">Full name *</label><input name="name" className="input" required /></div>
        <div><label className="lbl">Phone *</label><input name="phone" className="input" required placeholder="09..." /></div>
        <div><label className="lbl">Email</label><input name="email" type="email" className="input" /></div>
        <div><label className="lbl">Budget (ETB)</label><input name="budget" className="input" inputMode="numeric" /></div>
        <div>
          <label className="lbl">Source *</label>
          <select name="source" className="input" required>
            {LEAD_SOURCES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
          </select>
        </div>
        <div><label className="lbl">Source detail</label><input name="sourceDetail" className="input" placeholder="Campaign, referrer name, group…" /></div>
        <div>
          <label className="lbl">Interested project</label>
          <select name="interestProjectId" className="input">
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {canManage(s.role) && (
          <div>
            <label className="lbl">Assign to</label>
            <select name="ownerId" className="input" defaultValue={s.userId}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role.toLowerCase()})</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2"><label className="lbl">Notes</label><textarea name="notes" className="input" rows={3} /></div>
        <div className="col-span-2"><SubmitButton>Create lead</SubmitButton></div>
      </form>
    </div>
  );
}
