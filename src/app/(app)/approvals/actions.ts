"use server";

import { getSession } from "@/lib/session";
import { back, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { decidePriceApproval } from "@/lib/approvals";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function decideApproval(fd: FormData) {
  // Guard: Check permission to approve price requests
  const guard = await guardCompanyAction("APPROVE_PRICE");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const approve = str(fd, "decision") === "approve";
  const approvalId = str(fd, "id");
  const note = str(fd, "note");
  try {
    await decidePriceApproval(s, approvalId, approve, note);
    await logCompanyAudit(s.companyId, s.userId, "APPROVE_PRICE", "PriceApproval", approvalId, `Price ${approve ? "approved" : "rejected"}: ${note}`);
  } catch (e) {
    if (e instanceof RuleError) back("/approvals", { error: e.message });
    throw e;
  }
  back("/approvals", { msg: approve ? "Price approved. The agent can now finish the sale." : "Price rejected" });
}
