import type { PaymentPlan } from "@prisma/client";

export function planSummary(p: Pick<PaymentPlan, "type" | "downPct" | "months" | "bankName"> | null) {
  if (!p) return "Installments";
  if (p.type === "CASH") return "Full cash payment";
  if (p.type === "MORTGAGE") return `Bank loan${p.bankName ? ` (${p.bankName})` : ""}: ${Number(p.downPct)}% down, bank pays in ${p.months} month(s)`;
  return `${Number(p.downPct)}% down + ${p.months} monthly installments`;
}
