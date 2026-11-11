import type { PlatformUserRole } from "@prisma/client";
import type { Role } from "@prisma/client";

/**
 * Permission matrix for platform admin roles.
 * Each role can perform specific actions.
 */

export type PlatformAction =
  | "VIEW_DASHBOARD"
  | "VIEW_COMPANIES"
  | "CREATE_COMPANY"
  | "EDIT_COMPANY"
  | "SUSPEND_COMPANY"
  | "REACTIVATE_COMPANY"
  | "DELETE_COMPANY"
  | "VIEW_USERS"
  | "CREATE_USER"
  | "EDIT_USER"
  | "DELETE_USER"
  | "VIEW_SUBSCRIPTIONS"
  | "VIEW_INVOICES"
  | "PROCESS_PAYMENT"
  | "ISSUE_REFUND"
  | "CHANGE_PLAN"
  | "VIEW_AUDIT_LOG"
  | "EXPORT_DATA"
  | "VIEW_SUPPORT_TICKETS"
  | "ESCALATE_SUPPORT";

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformUserRole, Set<PlatformAction>> = {
  ADMIN: new Set([
    "VIEW_DASHBOARD",
    "VIEW_COMPANIES",
    "CREATE_COMPANY",
    "EDIT_COMPANY",
    "SUSPEND_COMPANY",
    "REACTIVATE_COMPANY",
    "DELETE_COMPANY",
    "VIEW_USERS",
    "CREATE_USER",
    "EDIT_USER",
    "DELETE_USER",
    "VIEW_SUBSCRIPTIONS",
    "VIEW_INVOICES",
    "PROCESS_PAYMENT",
    "ISSUE_REFUND",
    "CHANGE_PLAN",
    "VIEW_AUDIT_LOG",
    "EXPORT_DATA",
    "VIEW_SUPPORT_TICKETS",
    "ESCALATE_SUPPORT",
  ]),

  BILLING_MANAGER: new Set([
    "VIEW_DASHBOARD",
    "VIEW_COMPANIES",
    "VIEW_USERS",
    "VIEW_SUBSCRIPTIONS",
    "VIEW_INVOICES",
    "PROCESS_PAYMENT",
    "ISSUE_REFUND",
    "CHANGE_PLAN",
  ]),

  SUPPORT: new Set([
    "VIEW_DASHBOARD",
    "VIEW_COMPANIES",
    "VIEW_USERS",
    "VIEW_SUBSCRIPTIONS",
    "VIEW_SUPPORT_TICKETS",
    "ESCALATE_SUPPORT",
    "VIEW_AUDIT_LOG",
  ]),

  VIEWER: new Set([
    "VIEW_DASHBOARD",
    "VIEW_COMPANIES",
    "VIEW_USERS",
    "VIEW_SUBSCRIPTIONS",
    "VIEW_INVOICES",
    "VIEW_AUDIT_LOG",
  ]),
};

/**
 * Permission matrix for company user roles.
 * Each role can perform specific actions within a company.
 */

export type CompanyAction =
  | "VIEW_DASHBOARD"
  | "VIEW_LEADS"
  | "CREATE_LEAD"
  | "EDIT_LEAD"
  | "DELETE_LEAD"
  | "ASSIGN_LEAD"
  | "VIEW_DEALS"
  | "CREATE_DEAL"
  | "EDIT_DEAL"
  | "DELETE_DEAL"
  | "REQUEST_APPROVAL"
  | "APPROVE_PRICE"
  | "REJECT_PRICE"
  | "RECORD_PAYMENT"
  | "CONFIRM_PAYMENT"
  | "VOID_PAYMENT"
  | "REVERSE_PAYMENT"
  | "VIEW_PAYMENTS"
  | "APPROVE_PAYOUT"
  | "PROCESS_PAYOUT"
  | "VIEW_COMMISSIONS"
  | "DECIDE_PENALTY"
  | "VIEW_COLLECTIONS"
  | "VIEW_SETTINGS"
  | "EDIT_SETTINGS"
  | "VIEW_USERS"
  | "CREATE_USER"
  | "EDIT_USER"
  | "DELETE_USER"
  | "VIEW_AUDIT_LOG"
  | "EXPORT_DATA"
  | "VIEW_PROJECTS"
  | "EDIT_PROJECTS"
  | "VIEW_TARGETS"
  | "EDIT_TARGETS";

export const COMPANY_ROLE_PERMISSIONS: Record<Role, Set<CompanyAction>> = {
  OWNER: new Set([
    "VIEW_DASHBOARD",
    "VIEW_LEADS",
    "CREATE_LEAD",
    "EDIT_LEAD",
    "DELETE_LEAD",
    "ASSIGN_LEAD",
    "VIEW_DEALS",
    "CREATE_DEAL",
    "EDIT_DEAL",
    "DELETE_DEAL",
    "REQUEST_APPROVAL",
    "APPROVE_PRICE",
    "REJECT_PRICE",
    "RECORD_PAYMENT",
    "CONFIRM_PAYMENT",
    "VOID_PAYMENT",
    "REVERSE_PAYMENT",
    "VIEW_PAYMENTS",
    "APPROVE_PAYOUT",
    "PROCESS_PAYOUT",
    "DECIDE_PENALTY",
    "VIEW_COMMISSIONS",
    "VIEW_COLLECTIONS",
    "VIEW_SETTINGS",
    "EDIT_SETTINGS",
    "VIEW_USERS",
    "CREATE_USER",
    "EDIT_USER",
    "DELETE_USER",
    "VIEW_AUDIT_LOG",
    "EXPORT_DATA",
    "VIEW_PROJECTS",
    "EDIT_PROJECTS",
    "VIEW_TARGETS",
    "EDIT_TARGETS",
  ]),

  MANAGER: new Set([
    "VIEW_DASHBOARD",
    "VIEW_LEADS",
    "CREATE_LEAD",
    "EDIT_LEAD",
    "ASSIGN_LEAD",
    "VIEW_DEALS",
    "CREATE_DEAL",
    "EDIT_DEAL",
    "REQUEST_APPROVAL",
    "APPROVE_PRICE",
    "REJECT_PRICE",
    "VIEW_PAYMENTS",
    "APPROVE_PAYOUT",
    "VIEW_COMMISSIONS",
    "VIEW_COLLECTIONS",
    "VIEW_SETTINGS",
    "VIEW_USERS",
    "VIEW_AUDIT_LOG",
    "VIEW_PROJECTS",
    "VIEW_TARGETS",
  ]),

  AGENT: new Set([
    "VIEW_DASHBOARD",
    "VIEW_LEADS",
    "CREATE_LEAD",
    "EDIT_LEAD",
    "VIEW_DEALS",
    "CREATE_DEAL",
    "EDIT_DEAL",
    "REQUEST_APPROVAL",
    "VIEW_PAYMENTS",
    "VIEW_COMMISSIONS",
    "VIEW_PROJECTS",
  ]),

  ACCOUNTANT: new Set([
    "VIEW_DASHBOARD",
    "VIEW_LEADS",
    "VIEW_DEALS",
    "RECORD_PAYMENT",
    "CONFIRM_PAYMENT",
    "VOID_PAYMENT",
    "REVERSE_PAYMENT",
    "VIEW_PAYMENTS",
    "APPROVE_PAYOUT",
    "PROCESS_PAYOUT",
    "DECIDE_PENALTY",
    "VIEW_COMMISSIONS",
    "VIEW_COLLECTIONS",
    "VIEW_AUDIT_LOG",
    "EXPORT_DATA",
  ]),

  ADMIN: new Set([
    "VIEW_DASHBOARD",
    "VIEW_LEADS",
    "CREATE_LEAD",
    "EDIT_LEAD",
    "DELETE_LEAD",
    "ASSIGN_LEAD",
    "VIEW_DEALS",
    "CREATE_DEAL",
    "EDIT_DEAL",
    "DELETE_DEAL",
    "REQUEST_APPROVAL",
    "APPROVE_PRICE",
    "REJECT_PRICE",
    "RECORD_PAYMENT",
    "CONFIRM_PAYMENT",
    "VOID_PAYMENT",
    "REVERSE_PAYMENT",
    "VIEW_PAYMENTS",
    "APPROVE_PAYOUT",
    "PROCESS_PAYOUT",
    "DECIDE_PENALTY",
    "VIEW_COMMISSIONS",
    "VIEW_COLLECTIONS",
    "VIEW_SETTINGS",
    "EDIT_SETTINGS",
    "VIEW_USERS",
    "CREATE_USER",
    "EDIT_USER",
    "DELETE_USER",
    "VIEW_AUDIT_LOG",
    "EXPORT_DATA",
    "VIEW_PROJECTS",
    "EDIT_PROJECTS",
    "VIEW_TARGETS",
    "EDIT_TARGETS",
  ]),
};

/**
 * Check if a platform user role has permission to perform an action.
 */
export function platformHasPermission(role: PlatformUserRole, action: PlatformAction): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

/**
 * Check if a company user role has permission to perform an action.
 */
export function companyHasPermission(role: Role, action: CompanyAction): boolean {
  return COMPANY_ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

/**
 * Require platform user to have specific permission(s).
 * Throws if user doesn't have required permission.
 */
export function requirePlatformPermission(role: PlatformUserRole, action: PlatformAction): void {
  if (!platformHasPermission(role, action)) {
    throw new Error(`Permission denied: ${role} cannot perform ${action}`);
  }
}

/**
 * Require company user to have specific permission(s).
 * Throws if user doesn't have required permission.
 */
export function requireCompanyPermission(role: Role, action: CompanyAction): void {
  if (!companyHasPermission(role, action)) {
    throw new Error(`Permission denied: ${role} cannot perform ${action}`);
  }
}

/**
 * Get all permissions for a platform role.
 */
export function getPlatformPermissions(role: PlatformUserRole): PlatformAction[] {
  return Array.from(PLATFORM_ROLE_PERMISSIONS[role] ?? []);
}

/**
 * Get all permissions for a company role.
 */
export function getCompanyPermissions(role: Role): CompanyAction[] {
  return Array.from(COMPANY_ROLE_PERMISSIONS[role] ?? []);
}

/**
 * Backward compatibility exports for existing code
 */
export const MANAGERS: Role[] = ["OWNER", "MANAGER", "ADMIN"];
export const SALES: Role[] = ["AGENT", "MANAGER", "OWNER", "ADMIN"];
export const AUDITORS: Role[] = ["ADMIN", "ACCOUNTANT", "OWNER"];
export const FINANCE_VIEW: Role[] = ["ACCOUNTANT", "ADMIN", "OWNER"];
export const ACCOUNTS: Role[] = ["ACCOUNTANT", "ADMIN", "OWNER"];
export const ADMINS: Role[] = ["ADMIN", "OWNER"];

// Helper functions for existing code
export function seesAll(role: Role): boolean {
  return ["OWNER", "MANAGER", "ADMIN"].includes(role);
}

export function canManage(role: Role): boolean {
  return ["OWNER", "ADMIN"].includes(role);
}

export function canConfirmPayments(role: Role): boolean {
  return ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
}

export function canAdmin(role: Role): boolean {
  return ["OWNER", "ADMIN"].includes(role);
}
