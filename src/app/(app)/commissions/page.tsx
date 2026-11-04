import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { canConfirmPayments, seesAll } from "@/lib/permissions";
import { fmtDate, money } from "@/lib/format";
import { round } from "@/lib/finance";
import { getT } from "@/i18n/server";
import { Empty, Flash, PageHeader, Stat } from "@/components/ui";
import { ExportButtons } from "@/components/ExportButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { approveCommission, markCommissionPaid } from "../deals/actions";
import { loadCommissions, type CommissionsSP as SP } from "@/lib/commissions";

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const t = await getT();
  const { agentFilter, rows } = await loadCommissions(s, sp);
  const agents = seesAll(s.role) ? await db.user.findMany({ where: { companyId: s.companyId, role: { in: ["AGENT", "MANAGER"] } }, orderBy: { name: "asc" } }) : [];
  const tot = rows.reduce((x, { c }) => ({ total: x.total + c.total, payable: x.payable + c.payable, approved: x.approved + c.approved, paid: x.paid + c.paid, locked: x.locked + c.locked }), { total: 0, payable: 0, approved: 0, paid: 0, locked: 0 });
  const toPay = rows.flatMap(({ d }) => d.payouts.filter((p) => p.status === "APPROVED").map((p) => ({ p, d })));
  const accountant = canConfirmPayments(s.role);
  const returnTo = `/commissions${agentFilter && seesAll(s.role) ? `?agent=${agentFilter}` : ""}`;

  return (
    <div>
      <PageHeader
        title={seesAll(s.role) ? t("Commissions") : t("My commissions")}
        sub={t("Earned when a deal is signed. It unlocks as the buyer's payments are confirmed, then the accountant approves and pays it.")}
        actions={<ExportButtons report="commissions" />}
      />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Ready to approve")} value={money(round(tot.payable))} tone="green" />
        <Stat label={t("Approved, not paid")} value={money(round(tot.approved))} tone="amber" />
        <Stat label={t("Paid")} value={money(round(tot.paid))} />
        <Stat label={t("Waiting for buyer payments")} value={money(round(tot.locked))} />
      </div>

      {toPay.length > 0 && (
        <div className="card mb-6 p-0">
          <h2 className="h2 px-4 pt-4">{t("Approved, waiting to be paid")}</h2>
          <ul className="divide-y divide-slate-100">
            {toPay.map(({ p, d }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.agent.name} · <span className="text-amber-700">{money(p.amount)}</span></div>
                  <div className="text-xs text-slate-500">{d.contractNo} · {t("approved by {name} on {date}", { name: p.approvedBy.name, date: fmtDate(p.approvedAt, s.calendar) })}</div>
                </div>
                {accountant && (
                  <form action={markCommissionPaid} className="flex gap-2">
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input name="reference" placeholder={t("Bank ref")} className="input w-32" />
                    <SubmitButton>{t("Mark paid")}</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="mb-4 flex flex-wrap gap-2 print:hidden">
        <input name="q" defaultValue={sp.q} placeholder={t("Search contract, buyer or unit")} className="input max-w-xs" />
        {seesAll(s.role) && (
          <select name="agent" defaultValue={sp.agent ?? ""} className="input max-w-[12rem]"><option value="">{t("All agents")}</option>{agents.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        )}
        <select name="show" defaultValue={sp.show ?? ""} className="input max-w-[12rem]"><option value="">{t("All deals")}</option><option value="payable">{t("Ready to approve")}</option></select>
        <button className="btn-secondary">{t("Filter")}</button>
      </form>

      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <div className="p-4"><Empty>{t("No commissions yet. They appear here when a deal is signed.")}</Empty></div> : (
          <table className="tbl">
            <thead><tr><th>{t("Deal")}</th><th>{t("Agent")}</th><th>{t("Signed")}</th><th>{t("Rate")}</th><th>{t("Earned")}</th><th>{t("Unlocked")}</th><th>{t("Approved")}</th><th>{t("Paid")}</th><th>{t("Ready to approve")}</th>{accountant && <th className="print:hidden"></th>}</tr></thead>
            <tbody>
              {rows.map(({ d, c }) => (
                <tr key={d.id} className={d.status === "CANCELLED" ? "opacity-50" : ""}>
                  <td><Link href={`/deals/${d.id}`} className="link">{d.contractNo}</Link><div className="text-xs text-slate-500">{d.unit.project.name} {d.unit.code} · {d.client.fullName}</div></td>
                  <td>{d.agent.name}{d.agent.external && <div className="text-xs text-slate-500">{t("External broker")}</div>}</td>
                  <td>{fmtDate(d.signedAt, s.calendar)}</td>
                  <td>{Number(d.commissionRate)}%</td>
                  <td>{money(c.total)}</td>
                  <td>{money(c.accrued)}</td>
                  <td className={c.approved ? "text-amber-700" : ""}>{money(c.approved)}</td>
                  <td>{money(c.paid)}</td>
                  <td className="font-semibold text-emerald-700">{money(c.payable)}</td>
                  {accountant && (
                    <td className="print:hidden">
                      {c.payable > 0 && (
                        <form action={approveCommission} className="flex gap-1">
                          <input type="hidden" name="dealId" value={d.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input name="amount" defaultValue={c.payable} className="input w-28 py-1" />
                          <SubmitButton className="btn btn-sm">{t("Approve")}</SubmitButton>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
