import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { fmtDate, money } from "@/lib/format";
import { enumLabel } from "@/i18n";
import { getT } from "@/i18n/server";
import { PrintButton } from "@/components/PrintButton";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const t = await getT();
  const { id } = await params;
  const p = await db.payment.findFirst({
    where: { id, companyId: s.companyId, status: "CONFIRMED" },
    include: { company: true, confirmedBy: true, deal: { include: { client: true, unit: { include: { project: true } } } } },
  });
  if (!p || p.receiptNo == null || (!seesAll(s.role) && p.deal.agentId !== s.userId)) notFound();
  const rows: [string, string][] = [
    [t("Received from"), p.deal.client.fullName],
    [t("Phone"), p.deal.client.phone],
    [t("Amount"), money(p.amount)],
    [t("Payment method"), enumLabel(t, p.method)],
    [t("Bank / Telebirr reference"), p.reference ?? "—"],
    [t("Paid on"), fmtDate(p.paidAt, s.calendar)],
    [t("For"), `${p.deal.unit.project.name} ${p.deal.unit.code} · ${t("contract")} ${p.deal.contractNo}`],
    [t("Confirmed by"), `${p.confirmedBy?.name ?? "—"} · ${fmtDate(p.confirmedAt, s.calendar)}`],
  ];
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton label={t("Print / Save PDF")} /></div>
      <div className="card space-y-4 p-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div><div className="text-lg font-semibold">{p.company.name}</div><div className="text-sm text-slate-500">{t("Payment receipt")}</div></div>
          <div className="text-right"><div className="text-xs text-slate-500">{t("Receipt no.")}</div><div className="text-xl font-semibold">{String(p.receiptNo).padStart(6, "0")}</div></div>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
        </dl>
        <div className="pt-8 text-sm text-slate-500">{t("Signature")}: ______________________</div>
      </div>
    </div>
  );
}
