import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll, SALES } from "@/lib/permissions";
import { fmtDate, daysBetween } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { completeFollowUp } from "../leads/actions";

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ agent?: string; msg?: string; error?: string }> }) {
  const s = await requireSession(SALES);
  const sp = await searchParams;
  const where: Prisma.FollowUpWhereInput = { companyId: s.companyId, doneAt: null };
  if (!seesAll(s.role)) where.assigneeId = s.userId;
  else if (sp.agent) where.assigneeId = sp.agent;
  const now = new Date();
  const endOfToday = new Date(now.getTime() + 86400000);
  const [items, users, staleLeads] = await Promise.all([
    db.followUp.findMany({ where, include: { lead: true, assignee: true }, orderBy: { dueAt: "asc" }, take: 300 }),
    db.user.findMany({ where: { companyId: s.companyId, active: true }, orderBy: { name: "asc" } }),
    db.lead.findMany({
      where: {
        companyId: s.companyId,
        status: { notIn: ["WON", "LOST"] },
        followUps: { none: { doneAt: null } },
        ...(seesAll(s.role) ? {} : { ownerId: s.userId }),
      },
      include: { owner: true },
      take: 50,
    }),
  ]);
  const overdue = items.filter((f) => f.dueAt < now);
  const today = items.filter((f) => f.dueAt >= now && f.dueAt < endOfToday);
  const upcoming = items.filter((f) => f.dueAt >= endOfToday);

  const Section = ({ title, list, tone }: { title: string; list: typeof items; tone?: string }) => (
    <div className="card p-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="h2">{title}</h2><Badge tone={tone}>{String(list.length)}</Badge>
      </div>
      {list.length === 0 ? <div className="p-5"><Empty>Nothing here.</Empty></div> : (
        <table className="tbl">
          <tbody>
            {list.map((f) => (
              <tr key={f.id}>
                <td className="w-48">
                  <div>{fmtDate(f.dueAt, s.calendar)}</div>
                  {f.dueAt < now && <div className="text-xs text-rose-600">{daysBetween(f.dueAt, now)} days overdue</div>}
                </td>
                <td><Link href={`/leads/${f.lead.id}`} className="link font-medium">{f.lead.name}</Link><div className="text-xs text-slate-500">{f.lead.phone} · {f.note}</div></td>
                <td className="text-slate-600">{f.assignee.name}</td>
                <td>
                  <form action={completeFollowUp} className="flex gap-1">
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="returnTo" value="/follow-ups" />
                    <input name="outcome" className="input py-1" placeholder="Outcome" required />
                    <SubmitButton className="btn-secondary btn-sm">Done</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Follow-ups" sub="Every open lead should have a next step. Overdue items are visible to managers." />
      <Flash msg={sp.msg} error={sp.error} />
      {seesAll(s.role) && (
        <form className="mb-4 flex gap-2">
          <select name="agent" defaultValue={sp.agent ?? ""} className="input w-64">
            <option value="">All agents</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      )}
      <div className="space-y-6">
        <Section title="Overdue" list={overdue} tone="red" />
        <Section title="Due today" list={today} tone="amber" />
        <Section title="Upcoming" list={upcoming} tone="blue" />
        <div className="card">
          <h2 className="h2 mb-2">Open leads with no follow-up scheduled ({staleLeads.length})</h2>
          {staleLeads.length === 0 ? <Empty>All open leads have a next step.</Empty> : (
            <ul className="grid gap-1 text-sm md:grid-cols-2">
              {staleLeads.map((l) => <li key={l.id}><Link href={`/leads/${l.id}`} className="link">{l.name}</Link> <span className="text-slate-500">· {l.owner?.name ?? "Unassigned"}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
