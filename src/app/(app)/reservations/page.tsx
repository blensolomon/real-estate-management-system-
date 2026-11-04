import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { SALES } from "@/lib/permissions";
import { ExportButtons } from "@/components/ExportButtons";
import { canManage, seesAll } from "@/lib/permissions";
import { expireReservations } from "@/lib/reservations";
import { fmtDate, money } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { cancelReservation, extendReservation } from "./actions";

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; status?: string; q?: string }> }) {
  const s = await requireSession(SALES);
  const sp = await searchParams;
  await expireReservations(s.companyId);
  const status = sp.status ?? "ACTIVE";
  const where: Prisma.ReservationWhereInput = { companyId: s.companyId, ...(status !== "ALL" ? { status: status as never } : {}) };
  if (!seesAll(s.role)) where.agentId = s.userId;
  if (sp.q) where.OR = [{ client: { fullName: { contains: sp.q, mode: "insensitive" } } }, { client: { phone: { contains: sp.q } } }, { unit: { code: { contains: sp.q, mode: "insensitive" } } }];
  const list = await db.reservation.findMany({
    where,
    include: { unit: { include: { project: true } }, client: true, agent: true, deal: true },
    orderBy: status === "ACTIVE" ? { expiresAt: "asc" } : { createdAt: "desc" },
    take: 300,
  });
  const now = Date.now();
  return (
    <div>
      <PageHeader
        title="Reservations"
        sub="Reservations hold a unit for a limited time, then expire automatically and the unit becomes available."
        actions={<><ExportButtons report="reservations" /><Link href="/reservations/new" className="btn">+ New reservation</Link></>}
      />
      <Flash msg={sp.msg} error={sp.error} />
<form className="mb-4 flex flex-wrap gap-2 print:hidden">
        <input name="q" defaultValue={sp.q} placeholder="Search buyer, phone or unit" className="input max-w-xs" />
        <select name="status" defaultValue={status} className="input max-w-[12rem]"><option value="ACTIVE">Active</option><option value="CONVERTED">Became a sale</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option><option value="ALL">All</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {list.length === 0 ? <div className="p-5"><Empty>No reservations here. Reserve an available unit to hold it for a buyer.</Empty></div> : (
          <table className="tbl">
            <thead><tr><th>Unit</th><th>Buyer</th><th>Agent</th><th>Deposit</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => {
                const hoursLeft = Math.round((r.expiresAt.getTime() - now) / 3600000);
                return (
                  <tr key={r.id}>
                    <td><div className="font-medium">{r.unit.code}</div><div className="text-xs text-slate-500">{r.unit.project.name} · {money(r.unit.price)}</div></td>
                    <td><Link href={`/clients/${r.clientId}`} className="link">{r.client.fullName}</Link><div className="text-xs text-slate-500">{r.client.phone}</div></td>
                    <td>{r.agent.name}</td>
                    <td>{money(r.depositAmount)}</td>
                    <td>
                      {fmtDate(r.expiresAt, s.calendar)}
                      {r.status === "ACTIVE" && (
                        <div className={`text-xs ${hoursLeft < 48 ? "font-medium text-rose-600" : "text-slate-500"}`}>
                          {hoursLeft < 48 ? `${hoursLeft}h left` : `${Math.floor(hoursLeft / 24)} days left`}
                        </div>
                      )}
                    </td>
                    <td><Badge>{r.status}</Badge></td>
                    <td className="space-y-1">
                      {r.status === "ACTIVE" && (
                        <div className="flex flex-wrap gap-1">
                          <Link href={`/deals/new?reservationId=${r.id}`} className="btn btn-sm">Convert to deal</Link>
                          {canManage(s.role) && (
                            <form action={extendReservation} className="flex gap-1">
                              <input type="hidden" name="id" value={r.id} />
                              <input name="days" defaultValue={3} className="input w-14 py-1" />
                              <SubmitButton className="btn-secondary btn-sm">Extend</SubmitButton>
                            </form>
                          )}
                          <form action={cancelReservation}>
                            <input type="hidden" name="id" value={r.id} />
                            <SubmitButton className="btn-secondary btn-sm" confirm="Cancel this reservation and release the unit?">Cancel</SubmitButton>
                          </form>
                        </div>
                      )}
                      {r.deal && <Link href={`/deals/${r.deal.id}`} className="link text-xs">Deal {r.deal.contractNo}</Link>}
                    </td>
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
