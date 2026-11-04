import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { fmtDate, fmtDateTime, label, money } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const u = await db.unit.findFirst({
    where: { id, companyId: s.companyId },
    include: {
      project: true,
      reservations: { include: { client: true, agent: true }, orderBy: { createdAt: "desc" } },
      deals: { include: { client: true, agent: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!u) notFound();
  const all = seesAll(s.role);
  const history = all
    ? await db.auditLog.findMany({ where: { companyId: s.companyId, entity: "Unit", entityId: u.id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 })
    : [];
  const facts: [string, string | null][] = [
    ["Kind", u.kind === "PLOT" ? "Land plot" : "Apartment / building unit"],
    ["Type", u.type],
    ["Size", u.sizeSqm ? `${Number(u.sizeSqm)} m²` : null],
    ["Floor", u.floor != null ? String(u.floor) : null],
    ["Block", u.block],
    ["Zoning", u.zoning],
    ["Title status", u.titleStatus],
    ["List price", money(u.price)],
  ];
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={`${u.project.name} · ${u.code}`}
        sub="Everything that happened to this unit."
        actions={<><Badge>{u.status}</Badge>{u.status === "AVAILABLE" && <Link className="btn" href={`/reservations/new?unitId=${u.id}`}>Reserve</Link>}<Link className="btn-secondary" href={`/inventory/${u.projectId}`}>All units</Link></>}
      />
      <div className="card grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {facts.filter(([, v]) => v).map(([k, v]) => <div key={k}><div className="text-xs text-slate-500">{k}</div><div className="font-medium">{v}</div></div>)}
      </div>
      <div className="card text-sm">
        <h2 className="h2 mb-2">Sales</h2>
        {u.deals.length === 0 ? <Empty>Not sold yet.</Empty> : u.deals.map((d) => (
          <div key={d.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 py-2 first:border-0">
            <span>{all || d.agentId === s.userId ? <><Link className="link" href={`/deals/${d.id}`}>{d.contractNo}</Link> · {d.client.fullName}</> : "Sale"} · {d.agent.name}</span>
            <span className="text-slate-500">{fmtDate(d.signedAt, s.calendar)} · <Badge>{d.status}</Badge></span>
          </div>
        ))}
      </div>
      <div className="card text-sm">
        <h2 className="h2 mb-2">Reservations</h2>
        {u.reservations.length === 0 ? <Empty>No reservations yet.</Empty> : u.reservations.map((r) => (
          <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 py-2 first:border-0">
            <span>{all || r.agentId === s.userId ? r.client.fullName : "Buyer hidden"} · {r.agent.name} · deposit {money(r.depositAmount)}</span>
            <span className="text-slate-500">until {fmtDate(r.expiresAt, s.calendar)} · <Badge>{r.status}</Badge></span>
          </div>
        ))}
      </div>
      {all && (
        <div className="card text-sm">
          <h2 className="h2 mb-2">Changes (price, status)</h2>
          {history.length === 0 ? <Empty>No changes recorded.</Empty> : history.map((h) => (
            <div key={h.id} className="border-t border-slate-100 py-2 first:border-0">
              <span className="font-medium">{label(h.action.replace("unit.", ""))}</span> · {h.detail} <span className="text-slate-500">· {h.user?.name ?? "System"} · {fmtDateTime(h.createdAt, s.calendar)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
