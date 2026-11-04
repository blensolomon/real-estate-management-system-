import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll, SALES } from "@/lib/permissions";
import { addDays } from "@/lib/format";
import { STAGES } from "@/lib/pipeline";
import { Flash, PageHeader } from "@/components/ui";
import { PipelineBoard } from "./PipelineBoard";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ agent?: string; q?: string; msg?: string; error?: string }> }) {
  const s = await requireSession(SALES);
  const sp = await searchParams;
  const where: Prisma.LeadWhereInput = {
    companyId: s.companyId,
    // Won and Lost columns only show the last 30 days so the board stays short.
    OR: [{ status: { notIn: ["WON", "LOST"] } }, { lastActivityAt: { gte: addDays(new Date(), -30) } }],
  };
  if (!seesAll(s.role)) where.ownerId = s.userId;
  else if (sp.agent) where.ownerId = sp.agent;
  if (sp.q) where.AND = [{ OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }] }];
  const [leads, agents] = await Promise.all([
    db.lead.findMany({ where, include: { owner: { select: { name: true } } }, orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } }, take: 600 }),
    seesAll(s.role) ? db.user.findMany({ where: { companyId: s.companyId, active: true, role: { in: ["AGENT", "MANAGER", "OWNER"] } }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const cards = leads.map((l) => ({ id: l.id, name: l.name, phone: l.phone, owner: l.owner?.name ?? "Unassigned", budget: l.budget ? Number(l.budget) : null, status: l.status, lostReason: l.lostReason }));
  return (
    <div>
      <PageHeader title="Pipeline" sub="Drag a lead to the next stage (on a phone, pick the stage under the lead). Won happens automatically when a sale is made." />
      <Flash msg={sp.msg} error={sp.error} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} className="input w-56" placeholder="Search name or phone" />
        {seesAll(s.role) && (
          <select name="agent" defaultValue={sp.agent ?? ""} className="input w-48">
            <option value="">All agents</option>
            {agents.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <button className="btn-secondary">Filter</button>
      </form>
      <PipelineBoard stages={STAGES} cards={cards} />
    </div>
  );
}
