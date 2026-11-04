import { PrismaClient, type LeadSource, type PlanType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildPlanSchedule } from "../src/lib/finance";
import { monthOf } from "../src/lib/months";

const db = new PrismaClient();
const day = 86400000;
const ago = (d: number) => new Date(Date.now() - d * day);
const DEMO = "Addis Homes Real Estate";

async function main() {
  // Financial rows are protected from deletion by triggers; the demo reset opts in for this transaction only.
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('resms.allow_purge', 'on', true)`;
    await tx.company.deleteMany({ where: { name: DEMO } });
  });
  const hash = await bcrypt.hash("password123", 10);
  const company = await db.company.create({ data: { name: DEMO, reservationDays: 7, followUpDays: 2 } });
  const mk = (name: string, email: string, role: "OWNER" | "MANAGER" | "AGENT" | "ACCOUNTANT" | "ADMIN", external = false) =>
    db.user.create({ data: { companyId: company.id, name, email, role, external, passwordHash: hash } });
  const owner = await mk("Abebe Kebede", "owner@demo.et", "OWNER");
  await mk("Sara Tesfaye", "manager@demo.et", "MANAGER");
  const accountant = await mk("Hanna Girma", "accountant@demo.et", "ACCOUNTANT");
  await mk("Kebede Admasu", "admin@demo.et", "ADMIN");
  const agents = [await mk("Dawit Alemu", "agent@demo.et", "AGENT"), await mk("Meron Haile", "agent2@demo.et", "AGENT"), await mk("Yonas Bekele (broker)", "broker@demo.et", "AGENT", true)];
  let receiptNo = 0;

  const apartments = await db.project.create({ data: { companyId: company.id, name: "Bole Heights", location: "Bole, Addis Ababa", commissionRate: 2 } });
  const plots = await db.project.create({ data: { companyId: company.id, name: "Legetafo Plots", location: "Legetafo, Oromia", commissionRate: 3 } });
  const units = [];
  // 18 apartments: 3 floors x 6
  for (let floor = 1; floor <= 3; floor++)
    for (let n = 1; n <= 6; n++) {
      const type = n <= 2 ? "2BR" : n <= 5 ? "3BR" : "Penthouse";
      const size = type === "2BR" ? 95 : type === "3BR" ? 135 : 210;
      units.push(await db.unit.create({ data: { companyId: company.id, projectId: apartments.id, kind: "APARTMENT", code: `A${floor}0${n}`, block: "A", floor, type, sizeSqm: size, price: size * 85000 } }));
    }
  // 12 land plots
  for (let n = 1; n <= 12; n++) {
    const size = [200, 250, 300, 500][n % 4];
    units.push(await db.unit.create({
      data: { companyId: company.id, projectId: plots.id, kind: "PLOT", code: `P-${String(n).padStart(2, "0")}`, block: n <= 6 ? "North" : "South", type: "Residential plot", sizeSqm: size, price: size * 28000, zoning: n % 5 === 0 ? "Mixed use" : "Residential", titleStatus: n % 3 === 0 ? "In process" : "Title deed ready" },
    }));
  }

  const names = ["Kidist Mulugeta", "Samuel Tadesse", "Bethlehem Assefa", "Ermias Wolde", "Tigist Mekonnen", "Henok Getachew", "Selam Abera", "Natnael Fikru", "Rahel Desta", "Biniam Solomon", "Liya Hailu", "Robel Tesfaye", "Eden Yohannes", "Kalkidan Amare", "Mikias Berhanu", "Saron Lemma", "Abel Negash", "Hiwot Kassa", "Yared Getu", "Meseret Alemayehu"];
  const sources: LeadSource[] = ["FACEBOOK", "TELEGRAM", "WALK_IN", "REFERRAL", "BILLBOARD", "WEBSITE", "FACEBOOK", "TELEGRAM", "OTHER"];
  const leads = [];
  for (const [i, name] of names.entries()) {
    const agent = agents[i % 3];
    const lead = await db.lead.create({
      data: {
        companyId: company.id, name, phone: `0911${String(100000 + i * 7919).slice(0, 6)}`, source: sources[i % sources.length],
        status: i < 5 ? "WON" : i < 8 ? "SITE_VISIT" : i < 13 ? "CONTACTED" : "NEW",
        budget: [3_000_000, 6_000_000, 12_000_000][i % 3], notes: i % 2 ? "Prefers 3BR, high floor" : "Wants a plot for a villa",
        ownerId: i === 19 ? null : agent.id, interestProjectId: (i % 2 ? apartments : plots).id, createdAt: ago(80 - i * 3), lastActivityAt: ago(10 - (i % 10)),
      },
    });
    leads.push(lead);
    await db.activity.create({ data: { companyId: company.id, leadId: lead.id, userId: agent.id, type: "CALL", note: "Initial call, shared price list", createdAt: ago(70 - i * 3) } });
    if (i >= 5 && i < 8) await db.activity.create({ data: { companyId: company.id, leadId: lead.id, userId: agent.id, type: "SITE_VISIT", note: "Visited site with family", createdAt: ago(5) } });
    if (i >= 5) await db.followUp.create({ data: { companyId: company.id, leadId: lead.id, assigneeId: agent.id, dueAt: ago(i % 2 ? 3 : -2), note: i % 2 ? "Call back about payment plan" : "Send floor plans" } });
  }

  // Five sales, each partly paid.
  const sales: { unit: number; type: PlanType; downPct: number; months: number; bank?: string; start: number; paid: number }[] = [
    { unit: 0, type: "INSTALLMENT", downPct: 30, months: 12, start: 200, paid: 6 },
    { unit: 3, type: "INSTALLMENT", downPct: 30, months: 12, start: 150, paid: 2 },
    { unit: 6, type: "MORTGAGE", downPct: 40, months: 3, bank: "CBE", start: 120, paid: 1 },
    { unit: 9, type: "INSTALLMENT", downPct: 20, months: 24, start: 100, paid: 1 },
    { unit: 20, type: "INSTALLMENT", downPct: 50, months: 6, start: 60, paid: 2 },
  ];
  for (const [i, plan] of sales.entries()) {
    const lead = leads[i];
    const unit = units[plan.unit];
    const price = Number(unit.price);
    const project = unit.projectId === apartments.id ? apartments : plots;
    const client = await db.client.create({ data: { companyId: company.id, fullName: lead.name, phone: lead.phone, idNumber: `AA${100200 + i}`, leadId: lead.id } });
    const res = await db.reservation.create({ data: { companyId: company.id, unitId: unit.id, clientId: client.id, agentId: lead.ownerId!, expiresAt: ago(plan.start - 7), status: "CONVERTED", createdAt: ago(plan.start + 3), closedAt: ago(plan.start) } });
    await db.unit.update({ where: { id: unit.id }, data: { status: "SOLD" } });
    const schedule = buildPlanSchedule(price, { type: plan.type, downPct: plan.downPct, months: plan.months, bankName: plan.bank }, ago(plan.start));
    const deal = await db.deal.create({
      data: {
        companyId: company.id, contractNo: `C-${String(i + 1).padStart(4, "0")}`, unitId: unit.id, clientId: client.id, agentId: lead.ownerId!, reservationId: res.id, price, commissionRate: project.commissionRate, signedAt: ago(plan.start),
        plan: { create: { type: plan.type, downPct: plan.downPct, months: plan.months, bankName: plan.bank } },
        installments: { create: schedule },
      },
    });
    for (const inst of schedule.slice(0, plan.paid)) {
      await db.payment.create({ data: { companyId: company.id, dealId: deal.id, amount: inst.amount, paidAt: inst.dueDate, method: inst.seq === 1 ? "BANK_TRANSFER" : "TELEBIRR", reference: `FT${deal.contractNo.slice(2)}${inst.seq}`, status: "CONFIRMED", recordedById: lead.ownerId!, confirmedById: accountant.id, confirmedAt: inst.dueDate, receiptNo: ++receiptNo } });
    }
    if (i === 3) await db.payment.create({ data: { companyId: company.id, dealId: deal.id, amount: schedule[1].amount, paidAt: ago(2), method: "CBE_BIRR", reference: "CBE778812", recordedById: lead.ownerId!, status: "PENDING" } });
    if (i === 4) await db.payment.create({ data: { companyId: company.id, dealId: deal.id, amount: schedule[2].amount, paidAt: ago(1), method: "BANK_TRANSFER", reference: "FT2611ABX", recordedById: lead.ownerId!, status: "PENDING" } });
  }

  // Active reservations: one ends tomorrow, one past expiry with a confirmed deposit (held), one with time left and a discount waiting for approval.
  for (const [k, u, offset] of [[5, 12, 1], [6, 22, -1], [7, 13, 5]] as const) {
    const lead = leads[k];
    const unit = units[u];
    const client = await db.client.create({ data: { companyId: company.id, fullName: lead.name, phone: lead.phone, leadId: lead.id } });
    // The already-expired one has a confirmed deposit, so it stays held for the manager to decide.
    const held = offset < 0 ? { depositConfirmedAt: ago(3), depositConfirmedById: accountant.id, depositRef: "FT-DEP-2611" } : {};
    const r = await db.reservation.create({ data: { companyId: company.id, unitId: unit.id, clientId: client.id, agentId: lead.ownerId!, depositAmount: 50000, expiresAt: new Date(Date.now() + offset * day), ...held } });
    if (offset === 5) await db.priceApproval.create({ data: { companyId: company.id, reservationId: r.id, listPrice: unit.price, price: Math.round(Number(unit.price) * 0.92), reason: "Cash buyer, pays in full this month", requestedById: lead.ownerId! } });
    await db.unit.update({ where: { id: unit.id }, data: { status: "RESERVED" } });
  }
  await db.unit.update({ where: { id: units[17].id }, data: { status: "BLOCKED" } });
  await db.auditLog.create({ data: { companyId: company.id, userId: owner.id, action: "seed", entity: "Company", entityId: company.id, detail: "Demo data loaded" } });
  await db.company.update({ where: { id: company.id }, data: { receiptSeq: receiptNo } });
  const month = monthOf(new Date(), company.calendar).key;
  for (const [i, a] of agents.entries()) await db.salesTarget.create({ data: { companyId: company.id, userId: a.id, month, amount: [12_000_000, 8_000_000, 5_000_000][i] } });
  console.log("Seeded. Log in as owner@demo.et / password123");
}

main().finally(() => db.$disconnect());
