import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { FINANCE_VIEW, seesAll } from "@/lib/permissions";
import { fmtDate, label, money } from "@/lib/format";
import { dealFinancials } from "@/lib/finance";
import { statementPdf } from "@/lib/pdf";
import { planSummary } from "@/lib/plans";

export async function GET(_req: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!FINANCE_VIEW.includes(s.role)) return new NextResponse("Forbidden", { status: 403 });
  const { dealId } = await params;
  const deal = await db.deal.findFirst({
    where: { id: dealId, companyId: s.companyId },
    include: { company: true, client: true, plan: true, unit: { include: { project: true } }, installments: true, payments: { orderBy: { paidAt: "asc" } } },
  });
  if (!deal || (!seesAll(s.role) && deal.agentId !== s.userId)) return new NextResponse("Not found", { status: 404 });
  const f = dealFinancials(deal);
  const bytes = await statementPdf({
    company: deal.company.name,
    date: fmtDate(new Date(), s.calendar),
    buyer: deal.client.fullName,
    phone: deal.client.phone,
    unit: `${deal.unit.project.name} ${deal.unit.code}`,
    contractNo: deal.contractNo,
    plan: planSummary(deal.plan),
    totals: [
      ["Price", money(f.price)],
      ["Confirmed paid", money(f.confirmed)],
      ["Balance", money(f.balance)],
      ["Overdue now", money(f.overdueAmount)],
    ],
    schedule: f.installments.map((i) => [String(i.seq), i.label, fmtDate(i.dueDate, s.calendar), money(i.amount), money(i.paid), money(i.remaining)]),
    payments: deal.payments
      .filter((p) => p.status === "CONFIRMED")
      .map((p) => [fmtDate(p.paidAt, s.calendar), label(p.method), p.reversalOfId ? `Reversal: ${p.voidReason ?? ""}` : (p.reference ?? ""), p.receiptNo ? String(p.receiptNo) : "", money(p.amount)]),
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="statement-${deal.contractNo}.pdf"` },
  });
}
