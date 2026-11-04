import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Actor } from "./rules";

type Change = { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue };

export async function audit(
  s: Actor,
  action: string,
  entity: string,
  entityId?: string,
  detail?: string,
  change: Change = {},
  tx: Prisma.TransactionClient = db,
) {
  await tx.auditLog.create({
    data: { companyId: s.companyId, userId: s.userId, action, entity, entityId, detail, before: change.before, after: change.after },
  });
}
