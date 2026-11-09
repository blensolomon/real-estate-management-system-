import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { ExportButtons } from "@/components/ExportButtons";
import { canAdmin, seesAll } from "@/lib/permissions";
import { expireReservations } from "@/lib/reservations";
import { fmtDate, money, toDateInput } from "@/lib/format";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addUnits, markReachedAction, saveMilestonesAction, saveTiersAction, updateProject, updateUnit } from "../actions";
import { DateField } from "@/components/DateField";

const TILE: Record<string, string> = {
  AVAILABLE: "border-emerald-300 bg-emerald-50",
  RESERVED: "border-amber-300 bg-amber-50",
  SOLD: "border-sky-300 bg-sky-50",
  HANDED_OVER: "border-indigo-300 bg-indigo-50",
  BLOCKED: "border-slate-300 bg-slate-100",
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ msg?: string; error?: string; status?: string; q?: string }>;
}) {
  const s = await requireSession();
  const { projectId } = await params;
  const sp = await searchParams;
  await expireReservations(s.companyId);
  const project = await db.project.findFirst({
    where: { id: projectId, companyId: s.companyId },
    include: {
      units: {
        where: { ...(sp.status ? { status: sp.status as never } : {}), ...(sp.q ? { OR: [{ code: { contains: sp.q, mode: "insensitive" } }, { type: { contains: sp.q, mode: "insensitive" } }, { block: { contains: sp.q, mode: "insensitive" } }] } : {}) },
        orderBy: [{ block: "asc" }, { floor: "asc" }, { code: "asc" }],
        include: {
          reservations: { where: { status: "ACTIVE" }, include: { client: true, agent: true } },
          deals: { where: { status: { not: "CANCELLED" } }, include: { client: true, agent: true } },
        },
      },
    },
  });
  if (!project) notFound();
  const manage = canAdmin(s.role);
  const stages = await db.constructionMilestone.findMany({ where: { projectId: project.id, companyId: s.companyId }, orderBy: { seq: "asc" }, include: { _count: { select: { installments: true } } } });
  const stagesInUse = stages.some((m) => m._count.installments > 0);
  const tiers = manage ? await db.commissionTier.findMany({ where: { projectId: project.id, companyId: s.companyId }, orderBy: { fromAmount: "asc" } }) : [];

  return (
    <div>
      <PageHeader title={project.name} sub={`${project.location ?? ""} · commission ${Number(project.commissionRate)}%`} actions={<><ExportButtons report="units" /><Link href="/inventory" className="btn-secondary">All projects</Link></>} />
      <Flash msg={sp.msg} error={sp.error} />
<form className="mb-4 flex flex-wrap gap-2 print:hidden">
        <input name="q" defaultValue={sp.q} placeholder="Search unit code, type or block" className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[12rem]"><option value="">All</option><option value="AVAILABLE">Available</option><option value="RESERVED">Reserved</option><option value="SOLD">Sold</option><option value="HANDED_OVER">Handed over</option><option value="BLOCKED">Not for sale</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      <p className="muted mb-3"><span className="text-emerald-700">Green = available</span> · <span className="text-amber-700">amber = reserved</span> · <span className="text-sky-700">blue = sold</span> · <span className="text-indigo-700">purple = handed over</span></p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {project.units.map((u) => {
          const r = u.reservations[0];
          const d = u.deals[0];
          return (
            <div key={u.id} className={`rounded-lg border p-3 text-sm ${TILE[u.status]}`}>
              <div className="flex items-center justify-between">
                <Link href={`/units/${u.id}`} className="font-semibold underline-offset-2 hover:underline">{u.code}</Link>
                <Badge>{u.status}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {[u.kind === "PLOT" ? "Plot" : null, u.type, u.sizeSqm ? `${Number(u.sizeSqm)} m²` : null, u.floor != null ? `Floor ${u.floor}` : null, u.block ? `Block ${u.block}` : null, u.zoning, u.titleStatus ? `Title: ${u.titleStatus}` : null].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1 font-medium">{money(u.price)}</div>
              {r && <div className="mt-1 text-xs">For {seesAll(s.role) || r.agentId === s.userId ? `${r.client.fullName} (${r.agent.name})` : r.agent.name} until {fmtDate(r.expiresAt, s.calendar)}</div>}
              {d && (seesAll(s.role) || d.agentId === s.userId ? <div className="mt-1 text-xs">Sold: <Link className="link" href={`/deals/${d.id}`}>{d.contractNo}</Link> · {d.client.fullName}</div> : <div className="mt-1 text-xs">Sold by {d.agent.name}</div>)}
              {u.status === "AVAILABLE" && <Link href={`/reservations/new?unitId=${u.id}`} className="link mt-1 block text-xs">Reserve →</Link>}
              {manage && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-500">Edit</summary>
                  <form action={updateUnit} className="mt-2 space-y-1">
                    <input type="hidden" name="unitId" value={u.id} />
                    <input name="code" defaultValue={u.code} className="input py-1" />
                    <input name="price" defaultValue={Number(u.price)} className="input py-1" />
                    <select name="status" defaultValue={u.status} className="input py-1">
                      <option value={u.status}>{u.status}</option>
                      {u.status === "AVAILABLE" && <option value="BLOCKED">BLOCKED</option>}
                      {u.status === "BLOCKED" && <option value="AVAILABLE">AVAILABLE</option>}
                      {u.status === "SOLD" && <option value="HANDED_OVER">HANDED OVER</option>}
                    </select>
                    {u.kind === "PLOT" && <><input name="zoning" defaultValue={u.zoning ?? ""} placeholder="Zoning" className="input py-1" /><input name="titleStatus" defaultValue={u.titleStatus ?? ""} placeholder="Title status" className="input py-1" /></>}
                    <SubmitButton className="btn-secondary btn-sm w-full">Save</SubmitButton>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </div>
      {manage && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <form action={addUnits} className="card grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-full"><h2 className="h2">Add units</h2><p className="muted">Set count &gt; 1 to bulk-create e.g. A101…A110.</p></div>
            <input type="hidden" name="projectId" value={project.id} />
            <div><label className="lbl">Code / prefix *</label><input name="code" className="input" required placeholder="A1" /></div>
            <div><label className="lbl">Count</label><input name="count" type="number" min={1} max={200} defaultValue={1} className="input" /></div>
            <div><label className="lbl">Start number</label><input name="start" type="number" defaultValue={1} className="input" /></div>
            <div><label className="lbl">Kind</label><select name="kind" className="input"><option value="APARTMENT">Apartment / building unit</option><option value="PLOT">Land plot</option></select></div>
            <div><label className="lbl">Type</label><input name="type" className="input" placeholder="2BR / Shop / Villa" /></div>
            <div><label className="lbl">Zoning (plots)</label><input name="zoning" className="input" placeholder="Residential" /></div>
            <div><label className="lbl">Title status (plots)</label><input name="titleStatus" className="input" placeholder="Title deed ready" /></div>
            <div><label className="lbl">Size m²</label><input name="sizeSqm" className="input" /></div>
            <div><label className="lbl">Price ETB *</label><input name="price" className="input" required /></div>
            <div><label className="lbl">Block</label><input name="block" className="input" /></div>
            <div><label className="lbl">Floor</label><input name="floor" type="number" className="input" /></div>
            <div className="flex items-end"><SubmitButton>Add</SubmitButton></div>
          </form>
          <form action={updateProject} className="card grid grid-cols-2 gap-3">
            <div className="col-span-2"><h2 className="h2">Project settings</h2><p className="muted">Commission % applies to new deals.</p></div>
            <input type="hidden" name="projectId" value={project.id} />
            <div><label className="lbl">Name</label><input name="name" defaultValue={project.name} className="input" /></div>
            <div><label className="lbl">Location</label><input name="location" defaultValue={project.location ?? ""} className="input" /></div>
            <div><label className="lbl">Commission %</label><input name="commissionRate" defaultValue={Number(project.commissionRate)} className="input" /></div>
            <div className="flex items-end"><SubmitButton className="btn-secondary">Save</SubmitButton></div>
          </form>
          <form action={saveTiersAction} className="card space-y-2">
            <h2 className="h2">Commission by sale price</h2>
            <p className="muted">Optional. A sale at or above a starting price earns that tier&apos;s rate; below every tier the project rate applies. Only new sales use these.</p>
            <input type="hidden" name="projectId" value={project.id} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input name="fromAmount" defaultValue={tiers[i] ? Number(tiers[i].fromAmount) : ""} placeholder="From price ETB" inputMode="decimal" className="input" />
                <input name="rate" defaultValue={tiers[i] ? Number(tiers[i].rate) : ""} placeholder="Rate %" inputMode="decimal" className="input" />
              </div>
            ))}
            <SubmitButton className="btn-secondary">Save tiers</SubmitButton>
          </form>
          <div className="card space-y-2">
            <h2 className="h2">Construction stages</h2>
            <p className="muted">For &quot;pay by construction stage&quot; sales. Each stage&apos;s % is its share of the price left after the down payment. When you mark a stage reached, that payment is due 30 days later (change in Settings).</p>
            {stagesInUse ? (
              <ul className="space-y-2 text-sm">
                {stages.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <span>{m.seq}. {m.name} · {Number(m.pct)}%<span className="block text-xs text-slate-500">{m.reachedAt ? `Reached ${fmtDate(m.reachedAt, s.calendar)}` : `Expected ${fmtDate(m.expectedAt, s.calendar)}`}</span></span>
                    {m.reachedAt ? <Badge>REACHED</Badge> : (
                      <form action={markReachedAction}>
                        <input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="milestoneId" value={m.id} />
                        <SubmitButton className="btn btn-sm" confirm={`Mark "${m.name}" reached? Client payments for it become due.`}>Mark reached</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <form action={saveMilestonesAction} className="space-y-2">
                <input type="hidden" name="projectId" value={project.id} />
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <input name="stageName" defaultValue={stages[i]?.name ?? ""} placeholder="Stage, e.g. Foundation" className="input" />
                    <input name="pct" defaultValue={stages[i] ? Number(stages[i].pct) : ""} placeholder="%" inputMode="decimal" className="input" />
                    <DateField name="expectedAt" calendar={s.calendar} defaultValue={stages[i] ? toDateInput(stages[i].expectedAt) : ""} />
                  </div>
                ))}
                <p className="text-xs text-slate-500">Shares must add up to 100%. Stages lock once a sale uses them.</p>
                <SubmitButton className="btn-secondary">Save stages</SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
