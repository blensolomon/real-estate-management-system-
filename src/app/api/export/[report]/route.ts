import ExcelJS from "exceljs";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, type Session } from "@/lib/session";
import { seesAll } from "@/lib/permissions";
import { loadCollections } from "@/lib/collections";
import { loadCommissions } from "@/lib/commissions";
import { fmtDate } from "@/lib/format";
import { enumLabel, translator, type T } from "@/i18n";

type Row = (string | number)[];
type Report = { title: string; roles?: Role[]; build: (s: Session, q: URLSearchParams, t: T) => Promise<{ head: string[]; rows: Row[] }> };

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const FINANCE_VIEW: Role[] = ["OWNER", "MANAGER", "AGENT", "ACCOUNTANT"];
const SALES_VIEW: Role[] = ["OWNER", "MANAGER", "AGENT"];

const REPORTS: Record<string, Report> = {
  collections: {
    title: "Who owes us money",
    roles: FINANCE_VIEW,
    async build(s, q, t) {
      const extra = { ...(q.get("project") ? { unit: { projectId: q.get("project")! } } : {}), ...(q.get("agent") && seesAll(s.role) ? { agentId: q.get("agent")! } : {}) };
      const { rows } = await loadCollections(s, extra);
      return {
        head: [t("Buyer"), t("Phone"), t("Unit"), t("Contract"), t("Agent"), t("Price"), t("Paid (confirmed)"), t("Balance"), t("Late amount"), t("Days late"), "1-30", "31-60", "61-90", "90+"],
        rows: rows.filter((r) => (q.get("view") === "all" ? r.f.balance > 0 : r.f.overdueAmount > 0)).filter((r) => !q.get("q") || r.deal.client.fullName.toLowerCase().includes(q.get("q")!.toLowerCase()) || r.deal.client.phone.includes(q.get("q")!)).map(({ deal: d, f }) => [d.client.fullName, d.client.phone, `${d.unit.project.name} ${d.unit.code}`, d.contractNo, d.agent.name, f.price, f.confirmed, f.balance, f.overdueAmount, f.oldestOverdueDays, f.aging.d1_30, f.aging.d31_60, f.aging.d61_90, f.aging.d90plus]),
      };
    },
  },
  commissions: {
    title: "Commissions",
    roles: FINANCE_VIEW,
    async build(s, q, t) {
      const { rows } = await loadCommissions(s, Object.fromEntries(q));
      return {
        head: [t("Contract"), t("Agent"), t("External broker"), t("Signed"), t("Rate %"), t("Earned"), t("Unlocked"), t("Approved"), t("Paid"), t("Ready to approve"), t("Waiting for buyer payments")],
        rows: rows.map(({ d, c }) => [d.contractNo, d.agent.name, d.agent.external ? t("Yes") : t("No"), fmtDate(d.signedAt, s.calendar), n(d.commissionRate), c.total, c.accrued, c.approved, c.paid, c.payable, c.locked]),
      };
    },
  },
  payments: {
    title: "Payments",
    roles: FINANCE_VIEW,
    async build(s, q, t) {
      const status = q.get("status") ?? "PENDING";
      const ps = await db.payment.findMany({
        where: { companyId: s.companyId, ...(status === "ALL" ? {} : { status: status as "PENDING" }), ...(seesAll(s.role) ? {} : { deal: { agentId: s.userId } }) },
        include: { deal: { include: { client: true, unit: true, agent: true } }, recordedBy: true, confirmedBy: true },
        orderBy: { paidAt: "desc" },
      });
      return {
        head: [t("Paid on"), t("Receipt no."), t("Contract"), t("Buyer"), t("Unit"), t("Amount"), t("Method"), t("Reference"), t("Status"), t("Recorded by"), t("Confirmed by")],
        rows: ps.map((p) => [fmtDate(p.paidAt, s.calendar), p.receiptNo ?? "", p.deal.contractNo, p.deal.client.fullName, p.deal.unit.code, n(p.amount), enumLabel(t, p.method), p.reference ?? "", enumLabel(t, p.status), p.recordedBy.name, p.confirmedBy?.name ?? ""]),
      };
    },
  },
  deals: {
    title: "Sales",
    roles: FINANCE_VIEW,
    async build(s, q, t) {
      const ds = await db.deal.findMany({
        where: { companyId: s.companyId, ...(q.get("status") ? { status: q.get("status") as "ACTIVE" } : {}), ...(seesAll(s.role) ? {} : { agentId: s.userId }) },
        include: { client: true, agent: true, unit: { include: { project: true } } },
        orderBy: { signedAt: "desc" },
      });
      return { head: [t("Contract"), t("Signed"), t("Buyer"), t("Unit"), t("Agent"), t("Price"), t("Status")], rows: ds.map((d) => [d.contractNo, fmtDate(d.signedAt, s.calendar), d.client.fullName, `${d.unit.project.name} ${d.unit.code}`, d.agent.name, n(d.price), enumLabel(t, d.status)]) };
    },
  },
  leads: {
    title: "Leads",
    roles: SALES_VIEW,
    async build(s, q, t) {
      const ls = await db.lead.findMany({
        where: {
          companyId: s.companyId,
          ...(seesAll(s.role) ? (q.get("owner") ? { ownerId: q.get("owner")! } : {}) : { ownerId: s.userId }),
          ...(q.get("status") ? { status: q.get("status") as "NEW" } : {}),
          ...(q.get("source") ? { source: q.get("source") as "FACEBOOK" } : {}),
          ...(q.get("q") ? { OR: [{ name: { contains: q.get("q")!, mode: "insensitive" as const } }, { phone: { contains: q.get("q")! } }] } : {}),
        },
        include: { owner: true },
        orderBy: { createdAt: "desc" },
      });
      return { head: [t("Name"), t("Phone"), t("Source"), t("Status"), t("Agent"), t("Added"), t("Last contact")], rows: ls.map((l) => [l.name, l.phone, enumLabel(t, l.source), enumLabel(t, l.status), l.owner?.name ?? "", fmtDate(l.createdAt, s.calendar), fmtDate(l.lastActivityAt, s.calendar)]) };
    },
  },
  units: {
    title: "Units",
    async build(s, q, t) {
      const us = await db.unit.findMany({
        where: { companyId: s.companyId, ...(q.get("project") ? { projectId: q.get("project")! } : {}), ...(q.get("status") ? { status: q.get("status") as "AVAILABLE" } : {}) },
        include: { project: true },
        orderBy: [{ project: { name: "asc" } }, { code: "asc" }],
      });
      return { head: [t("Project"), t("Unit"), t("Type"), t("Floor"), t("Size (m²)"), t("Price"), t("Status")], rows: us.map((u) => [u.project.name, u.code, u.type ?? "", u.floor ?? "", u.sizeSqm ? n(u.sizeSqm) : "", n(u.price), enumLabel(t, u.status)]) };
    },
  },
  reservations: {
    title: "Reservations",
    roles: SALES_VIEW,
    async build(s, q, t) {
      const rs = await db.reservation.findMany({
        where: { companyId: s.companyId, ...(q.get("status") ? { status: q.get("status") as "ACTIVE" } : {}), ...(seesAll(s.role) ? {} : { agentId: s.userId }) },
        include: { client: true, agent: true, unit: { include: { project: true } } },
        orderBy: { createdAt: "desc" },
      });
      return { head: [t("Buyer"), t("Phone"), t("Unit"), t("Agent"), t("Reserved"), t("Ends"), t("Status")], rows: rs.map((r) => [r.client.fullName, r.client.phone, `${r.unit.project.name} ${r.unit.code}`, r.agent.name, fmtDate(r.createdAt, s.calendar), fmtDate(r.expiresAt, s.calendar), enumLabel(t, r.status)]) };
    },
  },
};

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Unauthorized", { status: 401 });
  const { report } = await params;
  const r = REPORTS[report];
  if (!r) return new Response("Not found", { status: 404 });
  if (r.roles && !r.roles.includes(s.role)) return new Response("Forbidden", { status: 403 });
  const t = translator(s.locale);
  const { head, rows } = await r.build(s, new URL(req.url).searchParams, t);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t(r.title).slice(0, 31));
  ws.addRow([`${s.companyName} · ${t(r.title)} · ${fmtDate(new Date(), s.calendar)}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(head).font = { bold: true };
  rows.forEach((row) => ws.addRow(row));
  ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(10, head[i]?.length ?? 10, ...rows.map((row) => String(row[i] ?? "").length)) + 2); });
  ws.views = [{ state: "frozen", ySplit: 3 }];
  const buf = await wb.xlsx.writeBuffer();
  await db.auditLog.create({ data: { companyId: s.companyId, userId: s.userId, action: "report.exported", entity: "Report", entityId: report } }).catch(() => {});
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${report}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

export const dynamic = "force-dynamic";
