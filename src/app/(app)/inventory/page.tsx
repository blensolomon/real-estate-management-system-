import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canAdmin } from "@/lib/permissions";
import { expireReservations } from "@/lib/reservations";
import { money } from "@/lib/format";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createProject } from "./actions";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  await expireReservations(s.companyId);
  const projects = await db.project.findMany({
    where: { companyId: s.companyId },
    include: { units: { select: { status: true, price: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <div>
      <PageHeader title="Inventory" sub="Live unit availability. A unit can only be reserved or sold once; expired reservations free the unit automatically." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const c = (st: string) => p.units.filter((u) => u.status === st).length;
          const availValue = p.units.filter((u) => u.status === "AVAILABLE").reduce((a, u) => a + Number(u.price), 0);
          return (
            <Link key={p.id} href={`/inventory/${p.id}`} className="card block hover:border-emerald-400">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.location ?? "—"} · commission {Number(p.commissionRate)}%</div>
                </div>
                <div className="text-sm text-slate-500">{p.units.length} units</div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded bg-emerald-50 p-2"><div className="text-lg font-semibold text-emerald-700">{c("AVAILABLE")}</div>Available</div>
                <div className="rounded bg-amber-50 p-2"><div className="text-lg font-semibold text-amber-700">{c("RESERVED")}</div>Reserved</div>
                <div className="rounded bg-sky-50 p-2"><div className="text-lg font-semibold text-sky-700">{c("SOLD")}</div>Sold</div>
                <div className="rounded bg-slate-100 p-2"><div className="text-lg font-semibold text-slate-600">{c("BLOCKED")}</div>Blocked</div>
              </div>
              <div className="mt-3 text-xs text-slate-500">Unsold value: {money(availValue)}</div>
            </Link>
          );
        })}
        {projects.length === 0 && <Empty>No projects yet.</Empty>}
      </div>
      {canAdmin(s.role) && (
        <form action={createProject} className="card mt-6 grid max-w-3xl grid-cols-4 items-end gap-3">
          <div className="col-span-4"><h2 className="h2">New project</h2></div>
          <div><label className="lbl">Name</label><input name="name" className="input" required /></div>
          <div><label className="lbl">Location</label><input name="location" className="input" placeholder="e.g. Bole, Addis Ababa" /></div>
          <div><label className="lbl">Commission %</label><input name="commissionRate" className="input" defaultValue="2" required /></div>
          <SubmitButton>Create project</SubmitButton>
        </form>
      )}
    </div>
  );
}
