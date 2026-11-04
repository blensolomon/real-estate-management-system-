import type { Role } from "@prisma/client";

/** Role groups used for server-side access checks (pages and server actions). */
export const SALES: Role[] = ["OWNER", "MANAGER", "AGENT"];
export const MANAGERS: Role[] = ["OWNER", "MANAGER"];
export const ADMINS: Role[] = ["OWNER", "ADMIN"];
export const ACCOUNTS: Role[] = ["OWNER", "ACCOUNTANT"];
export const AUDITORS: Role[] = ["OWNER", "MANAGER", "ADMIN"];
export const ALL_ROLES: Role[] = ["OWNER", "MANAGER", "AGENT", "ACCOUNTANT", "ADMIN"];

/** Agents/brokers only see their own leads, clients, reservations, deals and commissions. */
export function seesAll(role: Role) {
  return role !== "AGENT";
}

/** Manage agents, leads, reassignment, reservation extensions and targets. */
export function canManage(role: Role) {
  return MANAGERS.includes(role);
}

/** Manage users, projects, units and company settings. */
export function canAdmin(role: Role) {
  return ADMINS.includes(role);
}

/** Confirm payments, issue receipts, approve and pay commissions. */
export function canConfirmPayments(role: Role) {
  return ACCOUNTS.includes(role);
}
