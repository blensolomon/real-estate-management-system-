import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canManage, seesAll, SALES } from "@/lib/permissions";
import { fmtDate, fmtDateTime, label, money, toDateInput, addDays } from "@/lib/format";
import { ACTIVITY_TYPES, LEAD_STATUSES } from "@/lib/options";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DateField } from "@/components/DateField";
import { changeStatus, completeFollowUp, logActivity, reassignLead, scheduleFollowUp } from "../actions";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const s = await requireSession(SALES);
  const { id } = await params;
  const sp = await searchParams;
  const lead = await db.lead.findFirst({
    where: { id, companyId: s.companyId },
    include: {
      owner: true,
      interestProject: true,
      activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
      followUps: { include: { assignee: true }, orderBy: { dueAt: "asc" } },
      clients: { include: { deals: { include: { unit: true } }, reservations: { include: { unit: true } } } },
    },
  });
  if (!lead || (!seesAll(s.role) && lead.ownerId !== s.userId)) notFound();
  const users = canManage(s.role)
    ? await db.user.findMany({ where: { companyId: s.companyId, active: true }, orderBy: { name: "asc" } })
    : [];
  const now = new Date();
  const open = lead.followUps.filter((f) => !f.doneAt);
  const done = lead.followUps.filter((f) => f.doneAt);
  const returnTo = `/leads/${lead.id}`;

  return (
    <div>
      <PageHeader
        title={lead.name}
        sub={<>{lead.phone} · {label(lead.source)}{lead.sourceDetail ? ` (${lead.sourceDetail})` : ""} · created {fmtDate(lead.createdAt, s.calendar)}</>}
        actions={<Link href={`/reservations/new?leadId=${lead.id}`} className="btn">Reserve a unit</Link>}
      />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <form action={logActivity} className="card space-y-3">
            <h2 className="h2">Log activity</h2>
            <input type="hidden" name="leadId" value={lead.id} />
            <div className="flex gap-2">
              <select name="type" className="input w-44">
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
              <input name="note" className="input" placeholder="What happened? e.g. Called, interested in 2BR, will visit Saturday" required />
              <SubmitButton>Log</SubmitButton>
            </div>
            <p className="text-xs text-slate-500">Activities are timestamped and cannot be edited. Logging a site visit schedules a follow-up automatically.</p>
          </form>

          <div className="card">
            <h2 className="h2 mb-3">Follow-ups</h2>
            {open.length === 0 && <Empty>No open follow-ups. Schedule one so this lead isn&apos;t lost.</Empty>}
            <div className="space-y-2">
              {open.map((f) => (
                <form key={f.id} action={completeFollowUp} className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${f.dueAt < now ? "border-rose-200 bg-rose-50" : "border-slate-200"}`}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <div className="min-w-48 flex-1 text-sm">
                    <div className="font-medium">{fmtDate(f.dueAt, s.calendar)} {f.dueAt < now && <Badge tone="red">Overdue</Badge>}</div>
                    <div className="text-slate-500">{f.note ?? "Follow up"} · {f.assignee.name}</div>
                  </div>
                  <input name="outcome" className="input w-64" placeholder="Outcome" required />
                  <SubmitButton className="btn-secondary">Done</SubmitButton>
                </form>
              ))}
            </div>
            <form action={scheduleFollowUp} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <input type="hidden" name="leadId" value={lead.id} />
              <div><label className="lbl">Due</label><DateField name="dueAt" calendar={s.calendar} defaultValue={toDateInput(addDays(now, 2))} required /></div>
              <div className="flex-1"><label className="lbl">Note</label><input name="note" className="input" placeholder="e.g. Send price list" /></div>
              <SubmitButton className="btn-secondary">Schedule</SubmitButton>
            </form>
          </div>

          <div className="card">
            <h2 className="h2 mb-3">Timeline</h2>
            {lead.activities.length === 0 && done.length === 0 && <Empty>No activity yet.</Empty>}
            <ol className="space-y-3">
              {lead.activities.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <div className="w-40 shrink-0 text-xs text-slate-500">{fmtDateTime(a.createdAt, s.calendar)}</div>
                  <div>
                    <Badge tone={a.type === "SITE_VISIT" ? "amber" : a.type === "REASSIGNED" ? "purple" : "gray"}>{a.type}</Badge>{" "}
                    <span className="font-medium">{a.user.name}</span>: {a.note}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-2 text-sm">
            <h2 className="h2">Details</h2>
            <div className="flex justify-between"><span className="text-slate-500">Status</span><Badge>{lead.status}</Badge></div>
            <div className="flex justify-between"><span className="text-slate-500">Owner</span><span>{lead.owner?.name ?? "Unassigned"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Interest</span><span>{lead.interestProject?.name ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Budget</span><span>{lead.budget ? money(lead.budget) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Last activity</span><span>{fmtDate(lead.lastActivityAt, s.calendar)}</span></div>
            {lead.email && <div className="flex justify-between"><span className="text-slate-500">Email</span><span>{lead.email}</span></div>}
            {lead.notes && <p className="rounded bg-slate-50 p-2 text-slate-600">{lead.notes}</p>}
          </div>

          <form action={changeStatus} className="card space-y-2">
            <h2 className="h2">Change status</h2>
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="status" defaultValue={lead.status} className="input">
              {LEAD_STATUSES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
            </select>
            <input name="reason" className="input" placeholder="Reason (e.g. why lost)" />
            <SubmitButton className="btn-secondary w-full">Update status</SubmitButton>
          </form>

          {(s.role === "OWNER" || (s.role === "MANAGER" && !lead.ownerId)) && (
            <form action={reassignLead} className="card space-y-2">
              <h2 className="h2">{lead.ownerId ? "Move to another agent" : "Assign to an agent"}</h2>
              <p className="muted">{lead.ownerId ? "Leads stay with the agent who registered them. Moving is recorded in the audit log." : "This lead has no owner yet."}</p>
              <input type="hidden" name="leadId" value={lead.id} />
              <select name="ownerId" defaultValue={lead.ownerId ?? ""} className="input">
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role.toLowerCase()})</option>)}
              </select>
              <SubmitButton className="btn-secondary w-full">{lead.ownerId ? "Move lead" : "Assign lead"}</SubmitButton>
            </form>
          )}

          {lead.clients.length > 0 && (
            <div className="card space-y-2 text-sm">
              <h2 className="h2">Client record</h2>
              {lead.clients.map((c) => (
                <div key={c.id}>
                  <Link href={`/clients/${c.id}`} className="link">{c.fullName}</Link>
                  {c.deals.map((d) => <div key={d.id}>Deal: <Link className="link" href={`/deals/${d.id}`}>{d.contractNo}</Link> ({d.unit.code})</div>)}
                  {c.reservations.filter((r) => r.status === "ACTIVE").map((r) => <div key={r.id}>Reserved: {r.unit.code} until {fmtDate(r.expiresAt, s.calendar)}</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
