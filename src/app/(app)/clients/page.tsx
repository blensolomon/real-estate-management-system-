import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const where: Prisma.ClientWhereInput = { companyId: s.companyId };
  if (!seesAll(s.role)) where.OR = [{ deals: { some: { agentId: s.userId } } }, { reservations: { some: { agentId: s.userId } } }];
  if (sp.q) where.AND = [{ OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }, { idNumber: { contains: sp.q } }] }];
  const clients = await db.client.findMany({
    where,
    include: { _count: { select: { documents: true, deals: true } }, documents: { select: { type: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return (
    <div>
      <PageHeader title="Clients & documents" sub="Every buyer's contracts, IDs and receipts in one place." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Search name, phone or ID" className="input w-80" /><button className="btn-secondary">Search</button></form>
      <div className="card overflow-x-auto p-0">
        {clients.length === 0 ? <div className="p-5"><Empty>No clients yet. Clients are created when a unit is reserved.</Empty></div> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th>ID no.</th><th>Deals</th><th>Documents</th><th>Missing</th><th>Since</th></tr></thead>
            <tbody>
              {clients.map((c) => {
                const types = new Set(c.documents.map((d) => d.type));
                const missing = [!types.has("ID") && "ID", c._count.deals > 0 && !types.has("CONTRACT") && "Contract"].filter(Boolean);
                return (
                  <tr key={c.id}>
                    <td><Link href={`/clients/${c.id}`} className="link font-medium">{c.fullName}</Link></td>
                    <td>{c.phone}</td><td>{c.idNumber ?? "—"}</td><td>{c._count.deals}</td><td>{c._count.documents}</td>
                    <td className="text-xs text-amber-700">{missing.join(", ") || "—"}</td>
                    <td>{fmtDate(c.createdAt, s.calendar)}</td>
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
