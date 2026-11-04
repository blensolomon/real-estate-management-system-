import { PrismaClient, type LeadSource } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildSchedule } from "../src/lib/finance";

const db = new PrismaClient();
const day = 86400000;
const ago = (d: number) => new Date(Date.now() - d * day);

async function main() {
  await db.company.deleteMany({ where: { name: "Addis Homes Real Estate" } });
  const hash = await bcrypt.hash("password123", 10);
  const company = await db.company.create({ data: { name: "Addis Homes Real Estate", reservationDays: 7, followUpDays: 2 } });
  const mk = (name: string, email: string, role: "OWNER" | "MANAGER" | "AGENT" | "ACCOUNTANT") =>
    db.user.create({ data: { companyId: company.id, name, email, role, passwordHash: hash } });
  const owner = await mk("Abebe Kebede", "owner@demo.et", "OWNER");
  await mk("Sara Tesfaye", "manager@demo.et", "MANAGER");
  const finance = await mk("Hanna Girma", "accountant@demo.et", "ACCOUNTANT");
  const agents = [await mk("Dawit Alemu", "agent@demo.et", "AGENT"), await mk("Meron Haile", "agent2@demo.et", "AGENT"), await mk("Yonas Bekele", "agent3@demo.et", "AGENT")];

  const projects = [
    await db.project.create({ data: { companyId: company.id, name: "Bole Heights", location: "Bole, Addis Ababa", commissionRate: 2 } }),
    await db.project.create({ data: { companyId: company.id, name: "CMC Gardens", location: "CMC, Addis Ababa", commissionRate: 1.5 } }),
  ];
  const units = [];
  for (const [pi, p] of projects.entries()) {
    for (let floor = 1; floor <= 4; floor++)
      for (let n = 1; n <= 5; n++) {
        const type = n <= 2 ? "2BR" : n <= 4 ? "3BR" : "Penthouse";
        const size = type === "2BR" ? 95 : type === "3BR" ? 135 : 210;
        units.push(await db.unit.create({
          data: { companyId: company.id, projectId: p.id, code: `${pi ? "C" : "B"}${floor}0${n}`, block: pi ? "C" : "A", floor, type, sizeSqm: size, price: size * (pi ? 72000 : 85000) },
        }));
      }
  }

  const names = ["Kidist Mulugeta", "Samuel Tadesse", "Bethlehem Assefa", "Ermias Wolde", "Tigist Mekonnen", "Henok Getachew", "Selam Abera", "Natnael Fikru", "Rahel Desta", "Biniam Solomon", "Liya Hailu", "Robel Tesfaye", "Eden Yohannes", "Kalkidan Amare", "Mikias Berhanu", "Saron Lemma", "Abel Negash", "Hiwot Kassa"];
  const sources: LeadSource[] = ["FACEBOOK", "TELEGRAM", "WALK_IN", "REFERRAL", "TIKTOK", "FACEBOOK", "TELEGRAM"];
  const leads = [];
  for (const [i, name] of names.entries()) {
    const agent = agents[i % 3];
    const lead = await db.lead.create({
      data: {
        companyId: company.id, name, phone: `0911${String(100000 + i * 7919).slice(0, 6)}`, source: sources[i % sources.length],
        status: i < 6 ? "WON" : i < 9 ? "SITE_VISIT" : i < 13 ? "CONTACTED" : "NEW",
        ownerId: i === 17 ? null : agent.id, interestProjectId: projects[i % 2].id, createdAt: ago(80 - i * 4), lastActivityAt: ago(10 - (i % 10)),
      },
    });
    leads.push(lead);
    await db.activity.create({ data: { companyId: company.id, leadId: lead.id, userId: agent.id, type: "CALL", note: "Initial call, shared price list", createdAt: ago(70 - i * 3) } });
    if (i >= 6 && i < 9) await db.activity.create({ data: { companyId: company.id, leadId: lead.id, userId: agent.id, type: "SITE_VISIT", note: "Visited site with family", createdAt: ago(5) } });
    if (i >= 6) await db.followUp.create({ data: { companyId: company.id, leadId: lead.id, assigneeId: agent.id, dueAt: ago(i % 2 ? 3 : -2), note: i % 2 ? "Call back about payment plan" : "Send floor plans" } });
  }

  // Six signed deals with different payment behaviour.
  const plans = [
    { months: 12, start: 200, paidInst: 7 },
    { months: 12, start: 150, paidInst: 2 },
    { months: 6, start: 120, paidInst: 6 },
    { months: 24, start: 100, paidInst: 1 },
    { months: 12, start: 60, paidInst: 2 },
    { months: 0, start: 20, paidInst: 0 },
  ];
  for (const [i, plan] of plans.entries()) {
    const lead = leads[i];
    const unit = units[i * 3];
    const price = Number(unit.price);
    const client = await db.client.create({ data: { companyId: company.id, fullName: lead.name, phone: lead.phone, idNumber: `AA${100200 + i}`, leadId: lead.id } });
    const res = await db.reservation.create({ data: { companyId: company.id, unitId: unit.id, clientId: client.id, agentId: lead.ownerId!, expiresAt: ago(plan.start - 7), status: "CONVERTED", createdAt: ago(plan.start + 3), closedAt: ago(plan.start) } });
    await db.unit.update({ where: { id: unit.id }, data: { status: "SOLD" } });
    const schedule = buildSchedule(price, 30, plan.months, ago(plan.start));
    const deal = await db.deal.create({
      data: { companyId: company.id, contractNo: `C-${String(i + 1).padStart(4, "0")}`, unitId: unit.id, clientId: client.id, agentId: lead.ownerId!, reservationId: res.id, price, commissionRate: projects.find((p) => p.id === unit.projectId)!.commissionRate, signedAt: ago(plan.start), installments: { create: schedule } },
    });
    for (const inst of schedule.slice(0, plan.paidInst)) {
      await db.payment.create({ data: { companyId: company.id, dealId: deal.id, amount: inst.amount, paidAt: inst.dueDate, method: inst.seq === 1 ? "BANK_TRANSFER" : "TELEBIRR", reference: `FT${deal.contractNo.slice(2)}${inst.seq}`, status: "CONFIRMED", recordedById: lead.ownerId!, confirmedById: finance.id, confirmedAt: inst.dueDate } });
    }
    if (i === 4) await db.payment.create({ data: { companyId: company.id, dealId: deal.id, amount: schedule[2].amount, paidAt: ago(2), method: "CBE_BIRR", reference: "CBE778812", recordedById: lead.ownerId!, status: "PENDING" } });
    if (i === 5) await db.payment.create({ data: { companyId: company.id, dealId: deal.id, amount: schedule[0].amount, paidAt: ago(1), method: "BANK_TRANSFER", reference: "FT2611ABX", recordedById: lead.ownerId!, status: "PENDING" } });
  }

  // Active reservations: one expiring soon, one already past expiry (will be auto-expired).
  for (const [k, offset] of [[6, 1], [7, -1], [8, 5]] as const) {
    const lead = leads[k];
    const unit = units[20 + k];
    const client = await db.client.create({ data: { companyId: company.id, fullName: lead.name, phone: lead.phone, leadId: lead.id } });
    await db.reservation.create({ data: { companyId: company.id, unitId: unit.id, clientId: client.id, agentId: lead.ownerId!, depositAmount: 50000, expiresAt: new Date(Date.now() + offset * day) } });
    await db.unit.update({ where: { id: unit.id }, data: { status: "RESERVED" } });
  }
  await db.unit.update({ where: { id: units[19].id }, data: { status: "BLOCKED" } });
  await db.auditLog.create({ data: { companyId: company.id, userId: owner.id, action: "seed", entity: "Company", entityId: company.id, detail: "Demo data loaded" } });
  console.log("Seeded. Log in as owner@demo.et / password123");
}

main().finally(() => db.$disconnect());
