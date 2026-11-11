import "server-only";
import { db } from "@/lib/db";
import { getPlatformSession } from "@/lib/platform-session";
import { getSession } from "@/lib/session";
import { platformHasPermission, companyHasPermission, type PlatformAction, type CompanyAction } from "@/lib/permissions";
import { redirect } from "next/navigation";
import type { PlatformUserRole } from "@prisma/client";
import type { Role } from "@prisma/client";

/**
 * Guard for platform admin server actions.
 * Ensures user is authenticated and has required permission.
 */
export async function guardPlatformAction(action: PlatformAction): Promise<{ userId: string; role: PlatformUserRole }> {
  const session = await getPlatformSession();
  if (!session) {
    redirect("/platform-admin/login?session=expired");
  }

  if (!platformHasPermission(session.role, action)) {
    throw new Error(
      `Permission denied. Your role (${session.role}) does not have permission to perform this action.`,
    );
  }

  return {
    userId: session.platformUserId,
    role: session.role,
  };
}

/**
 * Guard for company user server actions.
 * Ensures user is authenticated and has required permission.
 */
export async function guardCompanyAction(action: CompanyAction): Promise<{ userId: string; role: Role; companyId: string }> {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/signout?session=expired");
  }

  if (!companyHasPermission(session.role, action)) {
    throw new Error(
      `Permission denied. Your role (${session.role}) does not have permission to perform this action.`,
    );
  }

  return {
    userId: session.userId,
    role: session.role,
    companyId: session.companyId,
  };
}

/**
 * Guard that checks if platform user has access to a specific company.
 * (Used for company-specific operations by admins)
 */
export async function guardPlatformCompanyAccess(companyId: string, action: PlatformAction): Promise<void> {
  await guardPlatformAction(action);

  // Verify company exists
  const company = await db.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error("Company not found.");
  }
}

/**
 * Guard that checks if company user owns the resource they're trying to access.
 * (Prevents users from accessing other users' leads, deals, etc.)
 */
export async function guardCompanyResourceAccess(
  resourceUserId: string,
  action: CompanyAction,
): Promise<{ userId: string; role: Role; companyId: string }> {
  const guard = await guardCompanyAction(action);

  // If resource belongs to a specific user, check ownership or manager/owner status
  if (resourceUserId !== guard.userId) {
    if (!["OWNER", "MANAGER", "ADMIN"].includes(guard.role)) {
      throw new Error("You do not have permission to access this resource.");
    }
  }

  return guard;
}

/**
 * Audit log helper: creates an audit log entry when an action is performed.
 */
export async function logPlatformAudit(
  platformUserId: string | undefined,
  action: string,
  entity: string,
  entityId: string | undefined,
  detail: string | undefined,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  try {
    const headerList = await import("next/headers").then((m) => m.headers());
    const ipAddress = headerList.get("x-forwarded-for") || headerList.get("x-real-ip") || "unknown";
    const userAgent = headerList.get("user-agent");

    await db.platformAuditLog.create({
      data: {
        platformUserId,
        action,
        entity,
        entityId,
        detail,
        ipAddress,
        userAgent,
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: after ? JSON.parse(JSON.stringify(after)) : null,
      },
    });
  } catch (error) {
    console.error("Failed to log platform audit:", error);
    // Don't throw - audit log failure shouldn't break the action
  }
}

/**
 * Audit log helper: creates an audit log entry for company user actions.
 */
export async function logCompanyAudit(
  companyId: string,
  userId: string,
  action: string,
  entity: string,
  entityId: string | undefined,
  detail: string | undefined,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        companyId,
        userId,
        action,
        entity,
        entityId,
        detail,
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: after ? JSON.parse(JSON.stringify(after)) : null,
      },
    });
  } catch (error) {
    console.error("Failed to log company audit:", error);
    // Don't throw - audit log failure shouldn't break the action
  }
}
