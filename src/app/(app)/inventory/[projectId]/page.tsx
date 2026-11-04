import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canManage } from "@/lib/permissions";
import { expireReservations } from "@/lib/reservations";
import { fmtDate, money } from "@/lib/format";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addUnits, updateProject, updateUnit } from "../actions";

const TILE: Record<string, string> = {
  AVAILABLE: "border-emerald-300 bg-emerald-50",
  RESERVED: "border-amber-300 bg-amber-50",
  SOLD: "border-sky-300 bg-sky-50",
  BLOCKED: "border-slate-300 bg-slate-100",
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ msg?: string; error?: string; status?: string }>;
}) {
  const s = await requireSession();
  const { projectId } = await params;
  const sp = await searchParams;
  await expireReservations(s.companyId);
  const project = await db.project.findFirst({
    where: { id: projectId, companyId: s.companyId },
    include: {
      units: {
        where: sp.status ? { status: sp.status as never } : {},
        orderBy: [{ block: "asc" }, { floor: "asc" }, { code: "asc" }],
        include: {
          reservations: { where: { status: "ACTIVE" }, include: { client: true, agent: true } },
          deals: { where: { status: { not: "CANCELLED" } }, include: { client: true, agent: true } },
        },
      },
    },
  });
  if (!project) notFound();
  const manage = canManage(s.role);

  return (
    <div>
      <PageHeader title={project.name} sub={`${project.location ?? ""} · commission ${Number(project.commissionRate)}%`} actions={<Link href="/inventory" className="btn-secondary">All projects</Link>} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="mb-4 flex gap-2 text-sm">
        {["", "AVAILABLE", "RESERVED", "SOLD", "BLOCKED"].map((st) => (
          <Link key={st} href={`/inventory/${project.id}${st ? `?status=${st}` : ""}`} className={(sp.status ?? "") === st ? "btn btn-sm" : "btn-secondary btn-sm"}>{st || "All"}</Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {project.units.map((u) => {
          const r = u.reservations[0];
          const d = u.deals[0];
          return (
            <div key={u.id} className={`rounded-lg border p-3 text-sm ${TILE[u.status]}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{u.code}</span>
                <Badge>{u.status}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {[u.type, u.sizeSqm ? `${Number(u.sizeSqm)} m²` : null, u.floor != null ? `Floor ${u.floor}` : null, u.block ? `Block ${u.block}` : null].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1 font-medium">{money(u.price)}</div>
              {r && <div className="mt-1 text-xs">For {r.client.fullName} ({r.agent.name}) until {fmtDate(r.expiresAt, s.calendar)}</div>}
              {d && <div className="mt-1 text-xs">Sold: <Link className="link" href={`/deals/${d.id}`}>{d.contractNo}</Link> · {d.client.fullName}</div>}
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
                    </select>
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
          <form action={addUnits} className="card grid grid-cols-3 gap-3">
            <div className="col-span-3"><h2 className="h2">Add units</h2><p className="muted">Set count &gt; 1 to bulk-create e.g. A101…A110.</p></div>
            <input type="hidden" name="projectId" value={project.id} />
            <div><label className="lbl">Code / prefix *</label><input name="code" className="input" required placeholder="A1" /></div>
            <div><label className="lbl">Count</label><input name="count" type="number" min={1} max={200} defaultValue={1} className="input" /></div>
            <div><label className="lbl">Start number</label><input name="start" type="number" defaultValue={1} className="input" /></div>
            <div><label className="lbl">Type</label><input name="type" className="input" placeholder="2BR / Shop / Villa" /></div>
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
        </div>
      )}
    </div>
  );
}
