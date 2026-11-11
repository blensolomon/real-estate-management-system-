"use client";

import React from "react";
import { platformHasPermission, companyHasPermission, type PlatformAction, type CompanyAction } from "@/lib/permissions";
import type { PlatformUserRole, Role } from "@prisma/client";

interface IfPlatformPermissionProps {
  role: PlatformUserRole;
  action: PlatformAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally render content if platform user has permission.
 */
export function IfPlatformPermission({ role, action, children, fallback }: IfPlatformPermissionProps) {
  if (!platformHasPermission(role, action)) {
    return fallback ?? null;
  }
  return <>{children}</>;
}

interface IfCompanyPermissionProps {
  role: Role;
  action: CompanyAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally render content if company user has permission.
 */
export function IfCompanyPermission({ role, action, children, fallback }: IfCompanyPermissionProps) {
  if (!companyHasPermission(role, action)) {
    return fallback ?? null;
  }
  return <>{children}</>;
}

interface PermissionButtonProps
  extends Omit<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, 'type'> {
  role: PlatformUserRole | Role;
  action: PlatformAction | CompanyAction;
  isPlatform?: boolean;
  permissionType?: "platform" | "company";
  children: React.ReactNode;
}

/**
 * Button that's disabled if user doesn't have permission.
 */
export function PermissionButton({ role, action, isPlatform, permissionType, children, ...props }: PermissionButtonProps) {
  const isPlat = isPlatform !== undefined ? isPlatform : permissionType === "platform";
  const hasPermission = isPlat
    ? platformHasPermission(role as PlatformUserRole, action as PlatformAction)
    : companyHasPermission(role as Role, action as CompanyAction);

  return (
    <button {...props} disabled={!hasPermission || props.disabled} title={hasPermission ? props.title : "You do not have permission to perform this action."}>
      {children}
    </button>
  );
}

interface PermissionLinkProps {
  role: PlatformUserRole | Role;
  action: PlatformAction | CompanyAction;
  isPlatform?: boolean;
  permissionType?: "platform" | "company";
  href: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Link that appears disabled if user doesn't have permission.
 */
export function PermissionLink({ role, action, isPlatform, permissionType, href, children, className }: PermissionLinkProps) {
  const isPlat = isPlatform !== undefined ? isPlatform : permissionType === "platform";
  const hasPermission = isPlat
    ? platformHasPermission(role as PlatformUserRole, action as PlatformAction)
    : companyHasPermission(role as Role, action as CompanyAction);

  if (!hasPermission) {
    return (
      <span className={`${className} cursor-not-allowed opacity-50`} title="You do not have permission to perform this action.">
        {children}
      </span>
    );
  }

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
