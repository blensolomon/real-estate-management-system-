import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { FINANCE_VIEW, seesAll } from "@/lib/permissions";
import { fmtDate, label, money } from "@/lib/format";
import { receiptPdf } from "@/lib/pdf";
import { sum } from "@/lib/finance";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!FINANCE_VIEW.includes(s.role)) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const p = await db.payment.findFirst({
    where: { id, companyId: s.companyId, status: "CONFIRMED", receiptNo: { not: null } },
    include: { company: true, confirmedBy: true, deal: { include: { client: true, unit: { include: { project: true } } } } },
  });
  if (!p || (!seesAll(s.role) && p.deal.agentId !== s.userId)) return new NextResponse("Not found", { status: 404 });
  const upTo = await db.payment.findMany({ where: { dealId: p.dealId, status: "CONFIRMED", confirmedAt: { lte: p.confirmedAt! } }, select: { amount: true } });
  const bytes = await receiptPdf({
    company: p.company.name,
    receiptNo: p.receiptNo!,
    date: fmtDate(p.confirmedAt, s.calendar),
    buyer: p.deal.client.fullName,
    phone: p.deal.client.phone,
    amount: money(p.amount),
    method: label(p.method),
    reference: p.reference ?? "",
    unit: `${p.deal.unit.project.name} ${p.deal.unit.code}`,
    contractNo: p.deal.contractNo,
    confirmedBy: p.confirmedBy?.name ?? "",
    balanceAfter: money(Number(p.deal.price) - sum(upTo.map((x) => Number(x.amount)))),
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="receipt-${p.receiptNo}.pdf"` },
  });
}
