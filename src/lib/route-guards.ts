import "server-only";
import { guardPlatformAction, guardCompanyAction } from "@/lib/permission-guards";
import type { PlatformAction, CompanyAction } from "@/lib/permissions";

/**
 * Route guard for platform admin routes.
 * Call this at the top of your route handler or layout to ensure permission.
 */
export async function guardPlatformRoute(requiredAction: PlatformAction) {
  return await guardPlatformAction(requiredAction);
}

/**
 * Route guard for company routes.
 * Call this at the top of your route handler or layout to ensure permission.
 */
export async function guardCompanyRoute(requiredAction: CompanyAction) {
  return await guardCompanyAction(requiredAction);
}

/**
 * Route guard variants for common scenarios
 */

// Platform admin routes
export async function guardPlatformDashboard() {
  return await guardPlatformRoute("VIEW_DASHBOARD");
}

export async function guardPlatformCompanies() {
  return await guardPlatformRoute("VIEW_COMPANIES");
}

export async function guardPlatformCompanyCreate() {
  return await guardPlatformRoute("CREATE_COMPANY");
}

export async function guardPlatformUsers() {
  return await guardPlatformRoute("VIEW_USERS");
}

export async function guardPlatformSubscriptions() {
  return await guardPlatformRoute("VIEW_SUBSCRIPTIONS");
}

export async function guardPlatformAuditLog() {
  return await guardPlatformRoute("VIEW_AUDIT_LOG");
}

// Company app routes
export async function guardCompanyDashboard() {
  return await guardCompanyRoute("VIEW_DASHBOARD");
}

export async function guardCompanyLeads() {
  return await guardCompanyRoute("VIEW_LEADS");
}

export async function guardCompanyDeals() {
  return await guardCompanyRoute("VIEW_DEALS");
}

export async function guardCompanyPayments() {
  return await guardCompanyRoute("VIEW_PAYMENTS");
}

export async function guardCompanyCommissions() {
  return await guardCompanyRoute("VIEW_COMMISSIONS");
}

export async function guardCompanyTeam() {
  return await guardCompanyRoute("VIEW_USERS");
}

export async function guardCompanySettings() {
  return await guardCompanyRoute("VIEW_SETTINGS");
}

export async function guardCompanyAuditLog() {
  return await guardCompanyRoute("VIEW_AUDIT_LOG");
}

// Additional company route guards
export async function guardCompanyApprovals() {
  return await guardCompanyRoute("APPROVE_PRICE");
}

export async function guardCompanyProjects() {
  return await guardCompanyRoute("VIEW_PROJECTS");
}

export async function guardCompanyTargets() {
  return await guardCompanyRoute("VIEW_TARGETS");
}

export async function guardCompanyCollections() {
  return await guardCompanyRoute("VIEW_COLLECTIONS");
}

export async function guardCompanyNotifications() {
  return await guardCompanyRoute("VIEW_DASHBOARD");
}

export async function guardCompanyMyDay() {
  return await guardCompanyRoute("VIEW_DASHBOARD");
}

export async function guardCompanyFollowUps() {
  return await guardCompanyRoute("VIEW_LEADS");
}
