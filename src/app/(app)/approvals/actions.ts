"use server";

import { requireSession } from "@/lib/session";
import { MANAGERS } from "@/lib/permissions";
import { back, str } from "@/lib/actions-util";
import { RuleError } from "@/lib/rules";
import { decidePriceApproval } from "@/lib/approvals";

export async function decideApproval(fd: FormData) {
  const s = await requireSession(MANAGERS);
  const approve = str(fd, "decision") === "approve";
  try {
    await decidePriceApproval(s, str(fd, "id"), approve, str(fd, "note"));
  } catch (e) {
    if (e instanceof RuleError) back("/approvals", { error: e.message });
    throw e;
  }
  back("/approvals", { msg: approve ? "Price approved. The agent can now finish the sale." : "Price rejected" });
}
