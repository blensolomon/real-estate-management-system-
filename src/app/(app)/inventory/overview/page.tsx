import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { money } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";

const STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "HANDED_OVER", "BLOCKED"] as const;
const COLOR: Record<string, string> = { AVAILABLE: "bg-emerald-500", RESERVED: "bg-amber-400", SOLD: "bg-sky-600", HANDED_OVER: "bg-indigo-600", BLOCKED: "bg-slate-400" };

/** Which units are really available, per project, and what they are worth. */
export default async function InventoryOverviewPage() {
  const s = await requireSession();
  const [projects, rows] = await Promise.all([
    db.project.findMany({ where: { companyId: s.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.unit.groupBy({ by: ["projectId", "status"], where: { companyId: s.companyId }, _count: true, _sum: { price: true } }),
  ]);
  const count = (pid: string | null, st: string) => rows.filter((r) => (!pid || r.projectId === pid) && r.status === st).reduce((a, r) => a + r._count, 0);
  const value = (pid: string | null, st: string) => rows.filter((r) => (!pid || r.projectId === pid) && r.status === st).reduce((a, r) => a + Number(r._sum.price ?? 0), 0);
  const total = rows.reduce((a, r) => a + r._count, 0);
  const statuses = STATUSES.filter((st) => rows.some((r) => r.status === st));

  return (
    <div>
      <PageHeader title="Inventory overview" sub="How many units are free, held or sold in each project, and the list-price value still available to sell." actions={<Link href="/inventory" className="btn-secondary">Unit list</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Available units" value={count(null, "AVAILABLE")} sub={`of ${total}`} tone="green" />
        <Stat label="Value still to sell" value={money(value(null, "AVAILABLE"))} tone="green" />
        <Stat label="Reserved (on hold)" value={count(null, "RESERVED")} tone="amber" href="/reservations" />
        <Stat label="Sold or handed over" value={count(null, "SOLD") + count(null, "HANDED_OVER")} />
      </div>
      <div className="card">
        <h2 className="h2 mb-3">By project</h2>
        <div className="mb-4 flex flex-wrap gap-3 text-xs">
          {statuses.map((st) => <span key={st} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded ${COLOR[st]}`} />{st.replace("_", " ").toLowerCase()}</span>)}
        </div>
        <div className="space-y-4">
          {projects.map((p) => {
            const n = statuses.reduce((a, st) => a + count(p.id, st), 0);
            return (
              <div key={p.id}>
                <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                  <Link href={`/inventory/${p.id}`} className="link font-medium">{p.name}</Link>
                  <span className="text-slate-500">{count(p.id, "AVAILABLE")} available of {n} · {money(value(p.id, "AVAILABLE"))} to sell</span>
                </div>
                <div className="flex h-5 overflow-hidden rounded bg-slate-100">
                  {n > 0 && statuses.map((st) => count(p.id, st) > 0 && (
                    <div key={st} title={`${st}: ${count(p.id, st)}`} className={COLOR[st]} style={{ width: `${(count(p.id, st) / n) * 100}%` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
