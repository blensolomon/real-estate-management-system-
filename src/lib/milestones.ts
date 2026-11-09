import { db } from "./db";
import { addDays } from "./format";
import { round } from "./finance";
import { notify } from "./notifications";
import { RuleError, type Actor } from "./rules";

type Stage = { id: string; name: string; pct: unknown; expectedAt: Date; reachedAt: Date | null };

/** Down payment now, the rest split over the project's construction stages by their %. Unreached stages use their expected date until marked reached. */
export function milestoneSchedule(price: number, downPct: number, stages: Stage[], start: Date, dueDays: number) {
  if (!stages.length) throw new RuleError("This project has no construction stages yet");
  const down = round((price * downPct) / 100);
  const rest = round(price - down);
  const rows: { seq: number; label: string; dueDate: Date; amount: number; milestoneId?: string }[] = [];
  if (down > 0) rows.push({ seq: 1, label: "Down payment", dueDate: start, amount: down });
  let left = rest;
  stages.forEach((m, i) => {
    const amount = i === stages.length - 1 ? round(left) : round((rest * Number(m.pct)) / 100);
    left = round(left - amount);
    const reachedDue = m.reachedAt ? addDays(m.reachedAt, dueDays) : null;
    const dueDate = reachedDue ? (reachedDue > start ? reachedDue : start) : m.expectedAt;
    rows.push({ seq: rows.length + 1, label: m.name, dueDate, amount, milestoneId: m.id });
  });
  return rows;
}

/** Owner/Admin: set a project's construction stages. Locked once any sale uses them. */
export async function saveMilestones(actor: Actor, projectId: string, items: { name: string; pct: number; expectedAt: Date | null }[]) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new RuleError("Only the Owner or Admin can change construction stages");
  const clean = items.filter((i) => i.name.trim() || i.pct);
  for (const i of clean) {
    if (!i.name.trim()) throw new RuleError("Each stage needs a name");
    if (!(i.pct > 0)) throw new RuleError("Each stage needs a share above 0%");
    if (!i.expectedAt) throw new RuleError("Each stage needs an expected date");
  }
  const total = clean.reduce((a, i) => a + i.pct, 0);
  if (clean.length && Math.abs(total - 100) > 0.001) throw new RuleError(`Stage shares must add up to 100% (now ${round(total)}%)`);
  return db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: projectId, companyId: actor.companyId } });
    if (!project) throw new RuleError("Project not found");
    const used = await tx.installment.count({ where: { milestone: { projectId } } });
    if (used) throw new RuleError("Sales already use these stages; they can only be marked reached now");
    await tx.constructionMilestone.deleteMany({ where: { projectId } });
    if (clean.length) await tx.constructionMilestone.createMany({ data: clean.map((i, k) => ({ companyId: actor.companyId, projectId, seq: k + 1, name: i.name.trim(), pct: i.pct, expectedAt: i.expectedAt! })) });
    await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.userId, action: "milestones.updated", entity: "Project", entityId: projectId, detail: clean.map((i) => `${i.name} ${i.pct}%`).join(", ") || "none" } });
  });
}

/** Owner/Admin: mark a stage reached. Every sale's due for this stage becomes due `milestoneDueDays` later. */
export async function markMilestoneReached(actor: Actor, milestoneId: string, reachedAt = new Date()) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new RuleError("Only the Owner or Admin can mark a stage reached");
  return db.$transaction(async (tx) => {
    const m = await tx.constructionMilestone.findFirst({ where: { id: milestoneId, companyId: actor.companyId }, include: { company: true, project: true } });
    if (!m) throw new RuleError("Stage not found");
    if (m.reachedAt) throw new RuleError("This stage is already marked reached");
    const dueDate = addDays(reachedAt, m.company.milestoneDueDays);
    await tx.constructionMilestone.update({ where: { id: m.id }, data: { reachedAt, reachedById: actor.userId } });
    const due = await tx.installment.findMany({ where: { milestoneId: m.id, deal: { status: { not: "CANCELLED" } } }, include: { deal: true } });
    await tx.installment.updateMany({ where: { id: { in: due.map((i) => i.id) } }, data: { dueDate } });
    await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.userId, action: "milestone.reached", entity: "Project", entityId: m.projectId, detail: `${m.name}: ${due.length} dues now due ${dueDate.toISOString().slice(0, 10)}` } });
    const agents = [...new Set(due.map((i) => i.deal.agentId))];
    await notify(tx, ...agents.map((userId) => ({ companyId: actor.companyId, userId, kind: "milestone.reached", title: `${m.project.name}: "${m.name}" reached — client payments due in ${m.company.milestoneDueDays} days`, link: "/collections", dedupeKey: `ms:${m.id}` })));
    return { dueDate, count: due.length };
  });
}
