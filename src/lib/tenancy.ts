import bcrypt from "bcryptjs";
import { db } from "./db";
import { RuleError } from "./rules";

/** Platform (SaaS operator) admins are listed by email in PLATFORM_ADMIN_EMAILS, comma-separated. */
export function isPlatformAdmin(email: string | null | undefined) {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export function signupEnabled() {
  return process.env.SIGNUP_ENABLED !== "false";
}

/** Creates a new, empty company and its first Owner in one transaction. */
export async function createCompanyWithOwner(input: { company: string; name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (!input.company.trim() || !input.name.trim() || !email || input.password.length < 8)
    throw new RuleError("All fields are required; password must be at least 8 characters");
  if (await db.user.findUnique({ where: { email } })) throw new RuleError("Email already registered");
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: input.company.trim() } });
    const owner = await tx.user.create({ data: { companyId: company.id, name: input.name.trim(), email, passwordHash, role: "OWNER" } });
    await tx.auditLog.create({ data: { companyId: company.id, userId: owner.id, action: "company.create", entity: "Company", entityId: company.id, detail: company.name } });
    return { company, owner };
  });
}

/** True only while both the user and their company are active. Checked on every request. */
export async function accountActive(userId: string, companyId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { active: true, companyId: true, company: { select: { active: true } } } });
  return !!u && u.active && u.companyId === companyId && u.company.active;
}

/** Suspend or reactivate a company. Only platform admins; recorded in that company's audit log. */
export async function setCompanyActive(actorUserId: string, companyId: string, active: boolean, note: string) {
  const actor = await db.user.findUnique({ where: { id: actorUserId }, select: { email: true, name: true } });
  if (!actor || !isPlatformAdmin(actor.email)) throw new RuleError("Only platform admins can suspend or reactivate companies");
  if (!active && !note.trim()) throw new RuleError("Give a reason for suspending this company");
  return db.$transaction(async (tx) => {
    const before = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { active: true } });
    const c = await tx.company.update({ where: { id: companyId }, data: { active, suspendedAt: active ? null : new Date() } });
    await tx.auditLog.create({
      data: {
        companyId, action: active ? "company.reactivate" : "company.suspend", entity: "Company", entityId: companyId,
        detail: `${note.trim() || "Reactivated"} (platform admin: ${actor.email})`, before: { active: before.active }, after: { active },
      },
    });
    return c;
  });
}

/** Platform overview: counts only, never tenant business records. */
export async function listCompanies() {
  return db.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, active: true, suspendedAt: true, createdAt: true,
      _count: { select: { users: true, projects: true, units: true, deals: true } },
      users: { where: { role: "OWNER" }, select: { email: true, name: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
  });
}
