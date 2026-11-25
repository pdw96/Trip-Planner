import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountInputValue,
  budgetMeter,
  budgetStartValues,
  CURRENCIES,
  currencyInfo,
  decideRate,
  formatMoney,
  normalizeRate,
  parseAmount,
  parseRateInput,
  rateInputValue,
  summarizeBudget,
  toBudgetMinor,
  totalsByPeriod,
} from "./budget.ts";

const KRW = {
  currency: "KRW",
  totalAmount: 1_000_000,
  localCurrency: null,
  plannedRate: null,
};
const KRW_JPY = {
  currency: "KRW",
  totalAmount: 1_000_000,
  localCurrency: "JPY",
  plannedRate: "9.2",
};
const line = (o) => ({
  id: o.id ?? "x",
  scheduleItemId: null,
  title: "t",
  date: null,
  estimate: null,
  actual: null,
  ...o,
});
const act = (amount, currency, extra = {}) => ({
  amount,
  currency,
  paidOn: null,
  rate: null,
  rateSource: null,
  ...extra,
});

test("통화 표", () => {
  assert.deepEqual(
    CURRENCIES.map((c) => c.code),
    [
      "KRW",
      "JPY",
      "USD",
      "EUR",
      "CNY",
      "HKD",
      "TWD",
      "THB",
      "VND",
      "SGD",
      "PHP",
      "MYR",
      "IDR",
      "GBP",
      "AUD",
      "CAD",
      "CHF",
    ],
  );
  assert.equal(currencyInfo("KRW").digits, 0);
  assert.equal(currencyInfo("USD").digits, 2);
  assert.equal(currencyInfo("TWD").ecb, false);
  assert.equal(currencyInfo("VND").ecb, false);
  assert.equal(currencyInfo("JPY").rateUnit, 100);
  assert.equal(currencyInfo("USD").rateUnit, 1);
  assert.equal(currencyInfo("XXX"), null);
});

test("금액 글자를 최소 단위로", () => {
  assert.deepEqual(parseAmount("12,000", "KRW"), { ok: true, minor: 12000 });
  assert.deepEqual(parseAmount("  ", "KRW"), { ok: true, minor: null });
  assert.deepEqual(parseAmount("12.5", "USD"), { ok: true, minor: 1250 });
  assert.deepEqual(parseAmount("0", "JPY"), { ok: true, minor: 0 });
  for (const bad of ["12.5", "-1", "1e3", "abc", "1,2,3.4"]) {
    assert.equal(parseAmount(bad, "KRW").ok, false, bad);
  }
  assert.equal(parseAmount("12.345", "USD").ok, false);
  assert.deepEqual(parseAmount("999999999999", "KRW"), {
    ok: true,
    minor: 999999999999,
  });
  assert.equal(parseAmount("1000000000000", "KRW").ok, false);
  assert.equal(parseAmount("10000000000", "USD").ok, false);
});

test("금액 오류 문구", () => {
  assert.equal(parseAmount("abc", "KRW").error, "금액을 숫자로 적어 주세요.");
  assert.equal(parseAmount("1.5", "KRW").error, "소수점 없이 적어 주세요.");
  assert.equal(
    parseAmount("1.555", "USD").error,
    "소수점 아래는 2자리까지 적을 수 있어요.",
  );
  assert.equal(parseAmount("1000000000000", "KRW").error, "금액이 너무 커요.");
});

test("금액 표시와 양식 기본값", () => {
  assert.equal(formatMoney(1_000_000, "KRW"), "₩1,000,000");
  assert.equal(formatMoney(1200, "JPY"), "¥1,200");
  assert.equal(formatMoney(1250, "USD"), "$12.50");
  assert.equal(formatMoney(5, "USD"), "$0.05");
  assert.equal(amountInputValue(1250, "USD"), "12.50");
  assert.equal(amountInputValue(1200, "JPY"), "1200");
});

test("환율 입력과 정리", () => {
  assert.deepEqual(parseRateInput("920", 100), { ok: true, rate: "9.2" });
  assert.deepEqual(parseRateInput("1,380.5", 1), { ok: true, rate: "1380.5" });
  for (const bad of ["0", "-3", "abc", "", "0.000000001"]) {
    assert.equal(parseRateInput(bad, 100).ok, false, bad);
  }
  assert.equal(
    parseRateInput("abc", 1).error,
    "환율을 0보다 큰 숫자로 적어 주세요.",
  );
  assert.equal(rateInputValue("9.2", 100), "920");
  assert.equal(rateInputValue("1380.5", 1), "1380.5");
  assert.equal(normalizeRate("9.2000000000"), "9.2");
  assert.equal(normalizeRate("0"), null);
  assert.equal(normalizeRate("1.12345678901"), null);
});

test("예산 통화로 바꾸기(행마다 반올림)", () => {
  assert.equal(
    toBudgetMinor({ amount: 1200, currency: "JPY" }, "9.2", "KRW"),
    11040,
  );
  assert.equal(
    toBudgetMinor({ amount: 1250, currency: "USD" }, "1380.5", "KRW"),
    17256,
  );
  assert.equal(
    toBudgetMinor({ amount: 1000, currency: "JPY" }, "0.0067", "USD"),
    670,
  );
  assert.equal(toBudgetMinor({ amount: 1, currency: "JPY" }, "0.5", "KRW"), 1);
  assert.equal(
    toBudgetMinor({ amount: 5000, currency: "KRW" }, null, "KRW"),
    5000,
  );
});

test("요약(설계 §5.7.1 예시 숫자)", () => {
  const s = summarizeBudget(
    [
      line({
        id: "a",
        estimate: { amount: 430_000, currency: "KRW" },
        actual: act(502_000, "KRW"),
      }),
      line({ id: "b", actual: act(50_000, "KRW") }),
      line({ id: "c", estimate: { amount: 620_000, currency: "KRW" } }),
    ],
    KRW,
  );
  assert.deepEqual(s, {
    total: 1_000_000,
    planned: 1_050_000,
    actual: 552_000,
    actualOverPlan: 122_000,
    unplanned: 50_000,
    remaining: 620_000,
    projected: 1_172_000,
    balance: -172_000,
    hasActual: true,
  });
  assert.equal(summarizeBudget([], KRW).hasActual, false);
});

test("요약: 예상은 예정 환율, 실제는 행의 환율", () => {
  const j = summarizeBudget(
    [
      line({
        estimate: { amount: 1000, currency: "JPY" },
        actual: act(1000, "JPY", {
          rate: "9.5",
          rateSource: "ecb",
          paidOn: "2026-11-21",
        }),
      }),
    ],
    KRW_JPY,
  );
  assert.equal(j.planned, 9200);
  assert.equal(j.actual, 9500);
  assert.equal(j.actualOverPlan, 300);
});

test("기간별 합계", () => {
  const planned = { rate: "9.2", rateSource: "planned", paidOn: "2026-11-21" };
  const t = totalsByPeriod(
    [
      line({
        id: "p",
        date: null,
        estimate: { amount: 420_000, currency: "KRW" },
        actual: act(420_000, "KRW"),
      }),
      line({
        id: "q",
        date: "2026-11-21",
        estimate: { amount: 5000, currency: "JPY" },
        actual: act(6800, "JPY", planned),
      }),
      line({ id: "r", date: "2026-11-21", actual: act(900, "JPY", planned) }),
      line({
        id: "o",
        date: "2026-12-30",
        estimate: { amount: 12_000, currency: "KRW" },
      }),
    ],
    KRW_JPY,
    "2026-11-21",
    "2026-11-23",
  );
  assert.deepEqual(t.tripWide, {
    estimate: 420_000,
    actual: 420_000,
    diff: 0,
    native: { currency: "KRW", estimate: 420_000, actual: 420_000, diff: 0 },
  });
  assert.deepEqual(t.byDate["2026-11-21"], {
    estimate: 46_000,
    actual: 70_840,
    diff: 24_840,
    native: { currency: "JPY", estimate: 5000, actual: 7700, diff: 2700 },
  });
  assert.equal(t.byDate["2026-11-22"], undefined);
  assert.deepEqual(t.outside, {
    estimate: 12_000,
    actual: 0,
    diff: null,
    native: { currency: "KRW", estimate: 12_000, actual: 0, diff: null },
  });
  assert.equal(
    totalsByPeriod([], KRW, "2026-11-21", "2026-11-23").outside,
    null,
  );
});

test("기간별 합계: 통화가 섞이면 native 없음", () => {
  const t = totalsByPeriod(
    [
      line({ date: "2026-11-21", estimate: { amount: 5000, currency: "JPY" } }),
      line({ date: "2026-11-21", estimate: { amount: 3000, currency: "KRW" } }),
    ],
    KRW_JPY,
    "2026-11-21",
    "2026-11-23",
  );
  assert.equal(t.byDate["2026-11-21"].native, null);
  assert.equal(t.byDate["2026-11-21"].estimate, 49_000);
});

test("환율 결정", () => {
  const base = {
    currency: "JPY",
    paidOn: "2026-11-20",
    rateField: "",
    previous: null,
    settings: KRW_JPY,
    today: "2026-11-20",
  };
  assert.deepEqual(decideRate({ ...base, currency: "KRW" }), { kind: "none" });
  assert.deepEqual(decideRate(base), { kind: "fetch" });
  assert.deepEqual(decideRate({ ...base, paidOn: "2026-11-21" }), {
    kind: "planned",
  });
  assert.deepEqual(decideRate({ ...base, rateField: "9.4" }), {
    kind: "manual",
    rate: "9.4",
  });
  const prev = act(1000, "JPY", {
    paidOn: "2026-11-20",
    rate: "9.31",
    rateSource: "ecb",
  });
  assert.deepEqual(decideRate({ ...base, previous: prev, rateField: "9.31" }), {
    kind: "keep",
    rate: "9.31",
    source: "ecb",
  });
  assert.deepEqual(
    decideRate({ ...base, previous: prev, rateField: undefined }),
    { kind: "keep", rate: "9.31", source: "ecb" },
  );
  assert.deepEqual(
    decideRate({
      ...base,
      previous: prev,
      paidOn: "2026-11-19",
      rateField: "9.31",
    }),
    { kind: "fetch" },
  );
  assert.deepEqual(
    decideRate({
      ...base,
      previous: { ...prev, rateSource: "planned", rate: "9.2" },
      rateField: "9.2",
    }),
    { kind: "fetch" },
  );
  assert.deepEqual(
    decideRate({
      ...base,
      settings: { ...KRW_JPY, localCurrency: "TWD" },
      currency: "TWD",
    }),
    { kind: "planned" },
  );
});

test("환율 정수부는 10자리까지(numeric(20,10))", () => {
  assert.deepEqual(parseRateInput("9999999999", 1), {
    ok: true,
    rate: "9999999999",
  });
  assert.equal(parseRateInput("99999999999", 1).error, "환율이 너무 커요.");
  assert.equal(parseRateInput("9999999999.5", 1).ok, true);
  assert.equal(parseRateInput("99999999999", 100).ok, true);
});

test("budgetMeter", () => {
  assert.deepEqual(budgetMeter(472000, 600000), {
    percent: 78.67,
    over: false,
  });
  assert.deepEqual(budgetMeter(700000, 600000), { percent: 100, over: true });
  assert.deepEqual(budgetMeter(600000, 600000), { percent: 100, over: false });
  assert.deepEqual(budgetMeter(0, 0), { percent: 0, over: false });
  assert.deepEqual(budgetMeter(1000, 0), { percent: 100, over: true });
});

test("budgetStartValues: nothing for no currency, KRW or unsupported", () => {
  assert.equal(budgetStartValues(null, null), null);
  assert.equal(budgetStartValues("KRW", "1"), null);
  assert.equal(budgetStartValues("XXX", "1"), null);
});

test("budgetStartValues: local currency with rate in the field's unit", () => {
  assert.deepEqual(budgetStartValues("JPY", "8.4523"), {
    localCurrency: "JPY",
    plannedRate: "845.23",
  });
  assert.deepEqual(budgetStartValues("USD", "1450.5"), {
    localCurrency: "USD",
    plannedRate: "1450.5",
  });
});

test("budgetStartValues: blank rate when missing or not an ECB currency", () => {
  assert.deepEqual(budgetStartValues("JPY", null), {
    localCurrency: "JPY",
    plannedRate: "",
  });
  assert.deepEqual(budgetStartValues("VND", "0.055"), {
    localCurrency: "VND",
    plannedRate: "",
  });
});
