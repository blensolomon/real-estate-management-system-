import type { Role } from "@prisma/client";

/** The signed-in user a business operation runs as. */
export type Actor = { userId: string; companyId: string; role: Role };

/** A business-rule violation with a message that is safe to show the user. */
export class RuleError extends Error {}

export function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
