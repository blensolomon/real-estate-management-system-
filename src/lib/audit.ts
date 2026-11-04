import { db } from "./db";
import type { Session } from "./session";

export async function audit(s: Session, action: string, entity: string, entityId?: string, detail?: string) {
  await db.auditLog.create({
    data: { companyId: s.companyId, userId: s.userId, action, entity, entityId, detail },
  });
}
