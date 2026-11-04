import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { fmtDate, label, money } from "@/lib/format";
import { dealFinancials } from "@/lib/finance";
import { DOCUMENT_TYPES } from "@/lib/options";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { updateClient, uploadClientDocument } from "../actions";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const c = await db.client.findFirst({
    where: { id, companyId: s.companyId },
    include: {
      lead: true,
      deals: { include: { unit: { include: { project: true } }, installments: true, payments: true, agent: true } },
      reservations: { include: { unit: { include: { project: true } } }, orderBy: { createdAt: "desc" } },
      documents: { include: { uploadedBy: true, deal: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();
  if (!seesAll(s.role) && !c.deals.some((d) => d.agentId === s.userId) && !c.reservations.some((r) => r.agentId === s.userId)) notFound();
  return (
    <div>
      <PageHeader title={c.fullName} sub={<>{c.phone}{c.idNumber ? ` · ID ${c.idNumber}` : ""}{c.lead && <> · from lead <Link className="link" href={`/leads/${c.lead.id}`}>{c.lead.name}</Link></>}</>} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-x-auto p-0">
            <h2 className="h2 px-5 pt-4">Deals</h2>
            {c.deals.length === 0 ? <div className="p-5"><Empty>No deals.</Empty></div> : (
              <table className="tbl mt-2">
                <thead><tr><th>Contract</th><th>Unit</th><th>Price</th><th>Paid</th><th>Balance</th><th>Overdue</th><th>Status</th></tr></thead>
                <tbody>
                  {c.deals.map((d) => { const f = dealFinancials(d); return (
                    <tr key={d.id}>
                      <td><Link className="link" href={`/deals/${d.id}`}>{d.contractNo}</Link></td>
                      <td>{d.unit.project.name} {d.unit.code}</td><td>{money(f.price)}</td><td>{money(f.confirmed)}</td><td>{money(f.balance)}</td>
                      <td className={f.overdueAmount ? "text-rose-600" : ""}>{money(f.overdueAmount)}</td><td><Badge>{d.status}</Badge></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2 className="h2 mb-3">Documents</h2>
            {c.documents.length === 0 ? <Empty>No documents.</Empty> : (
              <table className="tbl">
                <thead><tr><th>File</th><th>Type</th><th>Deal</th><th>Uploaded</th></tr></thead>
                <tbody>
                  {c.documents.map((d) => (
                    <tr key={d.id}>
                      <td><a className="link" href={`/api/documents/${d.id}`} target="_blank">{d.fileName}</a><div className="text-xs text-slate-500">{Math.round(d.size / 1024)} KB</div></td>
                      <td><Badge tone="purple">{d.type}</Badge></td>
                      <td>{d.deal?.contractNo ?? "—"}</td>
                      <td>{fmtDate(d.createdAt, s.calendar)}<div className="text-xs text-slate-500">{d.uploadedBy.name}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={uploadClientDocument} className="mt-4 grid grid-cols-4 items-end gap-2 border-t border-slate-100 pt-4">
              <input type="hidden" name="clientId" value={c.id} />
              <div><label className="lbl">Type</label><select name="type" className="input">{DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></div>
              <div><label className="lbl">Deal</label><select name="dealId" className="input"><option value="">—</option>{c.deals.map((d) => <option key={d.id} value={d.id}>{d.contractNo}</option>)}</select></div>
              <div><label className="lbl">File</label><input name="file" type="file" accept="application/pdf,image/*" className="input" required /></div>
              <SubmitButton>Upload</SubmitButton>
            </form>
          </div>
        </div>
        <div className="space-y-6">
          <form action={updateClient} className="card space-y-2">
            <h2 className="h2">Client info</h2>
            <input type="hidden" name="clientId" value={c.id} />
            <div><label className="lbl">Full name</label><input name="fullName" defaultValue={c.fullName} className="input" /></div>
            <div><label className="lbl">Email</label><input name="email" defaultValue={c.email ?? ""} className="input" /></div>
            <div><label className="lbl">ID / passport</label><input name="idNumber" defaultValue={c.idNumber ?? ""} className="input" /></div>
            <div><label className="lbl">Address</label><input name="address" defaultValue={c.address ?? ""} className="input" /></div>
            <SubmitButton className="btn-secondary w-full">Save</SubmitButton>
          </form>
          <div className="card text-sm">
            <h2 className="h2 mb-2">Reservations</h2>
            {c.reservations.length === 0 ? <Empty>None</Empty> : c.reservations.map((r) => (
              <div key={r.id} className="flex justify-between border-b border-slate-100 py-1"><span>{r.unit.project.name} {r.unit.code}</span><Badge>{r.status}</Badge></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
