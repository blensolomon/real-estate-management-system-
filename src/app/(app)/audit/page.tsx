import { db } from "@/lib/db";
import { guardCompanyAuditLog } from "@/lib/route-guards";
import { getSession } from "@/lib/session";
import { AUDITORS } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export default async function AuditPage() {
  // Guard: Check if user has permission to view audit log
  await guardCompanyAuditLog();
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const logs = await db.auditLog.findMany({ where: { companyId: s.companyId }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <div>
      <PageHeader title="Audit log" sub="Every important change: who did it and when." />
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(l.createdAt, s.calendar)}</td>
                <td>{l.user?.name ?? "System"}</td>
                <td><code className="text-xs">{l.action}</code></td>
                <td>{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
