import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll, SALES } from "@/lib/permissions";
import { fmtDate, label } from "@/lib/format";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/options";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";

type SP = { q?: string; status?: string; source?: string; owner?: string; msg?: string; error?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireSession(SALES);
  const sp = await searchParams;
  const where: Prisma.LeadWhereInput = { companyId: s.companyId };
  if (!seesAll(s.role)) where.ownerId = s.userId;
  else if (sp.owner) where.ownerId = sp.owner === "none" ? null : sp.owner;
  if (sp.status) where.status = sp.status as never;
  if (sp.source) where.source = sp.source as never;
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }];

  const now = new Date();
  const [leads, users] = await Promise.all([
    db.lead.findMany({
      where,
      include: {
        owner: true,
        interestProject: true,
        followUps: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.user.findMany({ where: { companyId: s.companyId, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads"
        sub={`${leads.length} leads${seesAll(s.role) ? "" : " assigned to you"}`}
        actions={<Link href="/leads/new" className="btn">+ New lead</Link>}
      />
      <Flash msg={sp.msg} error={sp.error} />
      <form className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <input name="q" defaultValue={sp.q} placeholder="Search name or phone" className="input" />
        <select name="status" defaultValue={sp.status ?? ""} className="input">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className="input">
          <option value="">All sources</option>
          {LEAD_SOURCES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
        </select>
        {seesAll(s.role) ? (
          <select name="owner" defaultValue={sp.owner ?? ""} className="input">
            <option value="">All agents</option>
            <option value="none">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : <div />}
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {leads.length === 0 ? (
          <div className="p-5"><Empty>No leads match.</Empty></div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Source</th><th>Status</th><th>Interest</th><th>Owner</th><th>Next follow-up</th><th>Created</th></tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const fu = l.followUps[0];
                const overdue = fu && fu.dueAt < now;
                return (
                  <tr key={l.id}>
                    <td><Link href={`/leads/${l.id}`} className="link font-medium">{l.name}</Link></td>
                    <td>{l.phone}</td>
                    <td>{label(l.source)}</td>
                    <td><Badge>{l.status}</Badge></td>
                    <td>{l.interestProject?.name ?? "—"}</td>
                    <td>{l.owner?.name ?? <span className="text-rose-600">Unassigned</span>}</td>
                    <td>{fu ? <span className={overdue ? "font-medium text-rose-600" : ""}>{fmtDate(fu.dueAt, s.calendar)}{overdue && " (overdue)"}</span> : ["WON", "LOST"].includes(l.status) ? "—" : <span className="text-amber-600">None scheduled</span>}</td>
                    <td className="text-slate-500">{fmtDate(l.createdAt, s.calendar)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
