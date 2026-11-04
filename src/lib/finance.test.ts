import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchedule, commissionState, dealFinancials } from "./finance";

const day = 86400000;
const now = new Date("2026-06-01T00:00:00Z");
const inst = (seq: number, daysFromNow: number, amount: number) =>
  ({ id: `i${seq}`, dealId: "d", seq, label: `#${seq}`, dueDate: new Date(now.getTime() + daysFromNow * day), amount }) as never;
const pay = (amount: number, status: string) => ({ amount, status }) as never;

test("allocates confirmed payments oldest-first and ages the rest", () => {
  const f = dealFinancials(
    {
      price: 1000,
      installments: [inst(1, -100, 300), inst(2, -45, 300), inst(3, -10, 200), inst(4, 20, 200)],
      payments: [pay(400, "CONFIRMED"), pay(100, "PENDING"), pay(50, "REJECTED")],
    },
    now,
  );
  assert.equal(f.confirmed, 400);
  assert.equal(f.pending, 100);
  assert.equal(f.balance, 600);
  assert.equal(f.overdueAmount, 400);
  assert.equal(f.oldestOverdueDays, 45);
  assert.deepEqual(f.aging, { current: 200, d1_30: 200, d31_60: 200, d61_90: 0, d90plus: 0 });
});

test("commission becomes payable proportionally to confirmed collections", () => {
  const c = commissionState({ price: 1_000_000, commissionRate: 2, status: "ACTIVE" }, 250_000, [{ amount: 2000 } as never]);
  assert.deepEqual(c, { total: 20000, accrued: 5000, paid: 2000, payable: 3000, locked: 15000 });
});

test("schedule sums to price", () => {
  const rows = buildSchedule(1_000_000, 30, 7, now);
  assert.equal(rows.length, 8);
  assert.equal(Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100, 1_000_000);
});
