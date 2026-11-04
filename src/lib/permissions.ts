import type { Role } from "@prisma/client";

export const MANAGERS: Role[] = ["OWNER", "MANAGER"];
export const FINANCE: Role[] = ["OWNER", "FINANCE"];
export const ALL_ROLES: Role[] = ["OWNER", "MANAGER", "AGENT", "FINANCE"];

/** Agents only see their own leads, reservations and deals. */
export function seesAll(role: Role) {
  return role !== "AGENT";
}

export function canManage(role: Role) {
  return MANAGERS.includes(role);
}

export function canConfirmPayments(role: Role) {
  return FINANCE.includes(role);
}
