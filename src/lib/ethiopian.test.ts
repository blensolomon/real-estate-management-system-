import assert from "node:assert/strict";
import { test } from "node:test";
import { fromEthiopian, toEthiopian } from "./ethiopian";

const addis = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 9));

test("known Ethiopian new year dates", () => {
  assert.deepEqual(toEthiopian(addis(2023, 9, 12)), { year: 2016, month: 1, day: 1 });
  assert.deepEqual(toEthiopian(addis(2024, 9, 11)), { year: 2017, month: 1, day: 1 });
  assert.deepEqual(toEthiopian(addis(2023, 9, 11)), { year: 2015, month: 13, day: 6 });
});

test("Genna (Ethiopian Christmas) is Tahsas 29", () => {
  assert.deepEqual(toEthiopian(addis(2024, 1, 7)), { year: 2016, month: 4, day: 28 });
  assert.deepEqual(toEthiopian(addis(2025, 1, 7)), { year: 2017, month: 4, day: 29 });
});

test("round trip", () => {
  for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2030, 0, 1); t += 86400000 * 3) {
    const d = new Date(t + 9 * 3600 * 1000);
    const back = fromEthiopian(toEthiopian(d));
    assert.equal(toEthiopian(back).day, toEthiopian(d).day);
    assert.ok(Math.abs(back.getTime() - d.getTime()) < 86400000);
  }
});
