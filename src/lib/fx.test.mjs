import assert from "node:assert/strict";
import { test } from "node:test";
import { frankfurterUrl, parseFrankfurterRate } from "./fx.ts";

test("Frankfurter 주소", () => {
  assert.equal(
    frankfurterUrl("2026-11-14", "JPY", "KRW"),
    "https://api.frankfurter.dev/v1/2026-11-14?base=JPY&symbols=KRW",
  );
});

test("Frankfurter 응답 해석", () => {
  assert.deepEqual(
    parseFrankfurterRate(
      { amount: 1, base: "JPY", date: "2026-11-13", rates: { KRW: 9.2345 } },
      "KRW",
    ),
    { rate: "9.2345", rateDate: "2026-11-13" },
  );
  assert.deepEqual(
    parseFrankfurterRate(
      { amount: 1, base: "KRW", date: "2026-11-13", rates: { IDR: 1.5e-7 } },
      "IDR",
    ),
    { rate: "0.00000015", rateDate: "2026-11-13" },
  );
  for (const bad of [
    null,
    {},
    { date: "2026-11-13", rates: {} },
    { date: "x", rates: { KRW: 9 } },
    { date: "2026-11-13", rates: { KRW: 0 } },
    { date: "2026-11-13", rates: { KRW: "9" } },
    { date: "2026-11-13", rates: { KRW: 1e-12 } },
  ]) {
    assert.equal(parseFrankfurterRate(bad, "KRW"), null, JSON.stringify(bad));
  }
});
