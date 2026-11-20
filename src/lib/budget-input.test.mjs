import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyInfo, parseAmount, parseRateInput } from "./budget.ts";
import {
  EMPTY_AMOUNT_FIELDS,
  parseAmountFields,
  parseBudgetSettings,
  parseExtraItem,
} from "./budget-input.ts";

const p = { currencyInfo, parseAmount, parseRateInput };
const allowed = { currency: "KRW", localCurrency: "JPY" };
const opts = { actualShown: true, defaultPaidOn: "2026-11-21" };
const amt = (o) => ({ ...EMPTY_AMOUNT_FIELDS, ...o });
const settings = (o) => ({
  totalAmount: "1",
  currency: "KRW",
  localCurrency: "",
  plannedRate: "",
  ...o,
});

test("예산 설정", () => {
  assert.deepEqual(
    parseBudgetSettings(
      settings({
        totalAmount: "1,000,000",
        localCurrency: "JPY",
        plannedRate: "920",
      }),
      p,
    ),
    {
      ok: true,
      value: {
        currency: "KRW",
        totalAmount: 1_000_000,
        localCurrency: "JPY",
        plannedRate: "9.2",
      },
    },
  );
  assert.deepEqual(
    parseBudgetSettings(settings({ totalAmount: "80000", currency: "JPY" }), p),
    {
      ok: true,
      value: {
        currency: "JPY",
        totalAmount: 80000,
        localCurrency: null,
        plannedRate: null,
      },
    },
  );
});

test("예산 설정 오류", () => {
  assert.equal(
    parseBudgetSettings(settings({ totalAmount: "" }), p).errors.totalAmount,
    "총 예산을 적어 주세요.",
  );
  assert.equal(
    parseBudgetSettings(settings({ totalAmount: "1.5" }), p).errors.totalAmount,
    "소수점 없이 적어 주세요.",
  );
  assert.equal(
    parseBudgetSettings(settings({ currency: "XXX" }), p).errors.currency,
    "통화를 다시 골라 주세요.",
  );
  assert.equal(
    parseBudgetSettings(settings({ localCurrency: "ZZZ", plannedRate: "1" }), p)
      .errors.localCurrency,
    "통화를 다시 골라 주세요.",
  );
  assert.equal(
    parseBudgetSettings(settings({ localCurrency: "KRW", plannedRate: "1" }), p)
      .errors.localCurrency,
    "현지 통화는 예산 통화와 달라야 해요.",
  );
  assert.equal(
    parseBudgetSettings(settings({ localCurrency: "JPY" }), p).errors
      .plannedRate,
    "현지 통화를 쓰려면 예정 환율을 적어 주세요.",
  );
  assert.equal(
    parseBudgetSettings(settings({ localCurrency: "JPY", plannedRate: "0" }), p)
      .errors.plannedRate,
    "환율을 0보다 큰 숫자로 적어 주세요.",
  );
});

test("예상·실제 칸", () => {
  assert.deepEqual(
    parseAmountFields(
      amt({ estimateAmount: "5,000", estimateCurrency: "JPY" }),
      allowed,
      p,
      opts,
    ),
    {
      ok: true,
      value: {
        estimate: { amount: 5000, currency: "JPY" },
        actual: null,
        actualTouched: true,
      },
    },
  );
  assert.deepEqual(
    parseAmountFields(
      amt({ actualAmount: "6800", actualCurrency: "JPY" }),
      allowed,
      p,
      opts,
    ).value.actual,
    { amount: 6800, currency: "JPY", paidOn: "2026-11-21", rateField: "" },
  );
  assert.deepEqual(
    parseAmountFields(
      amt({
        actualAmount: "6800",
        actualCurrency: "JPY",
        actualPaidOn: "2026-11-01",
        actualRate: "931",
      }),
      allowed,
      p,
      opts,
    ).value.actual,
    {
      amount: 6800,
      currency: "JPY",
      paidOn: "2026-11-01",
      rateField: "9.31",
    },
  );
  assert.deepEqual(
    parseAmountFields(
      amt({ actualAmount: "9000", actualCurrency: "KRW", actualRate: "1" }),
      allowed,
      p,
      opts,
    ).value.actual,
    { amount: 9000, currency: "KRW", paidOn: null, rateField: undefined },
  );
  const untouched = parseAmountFields(
    amt({ actualAmount: "1", actualCurrency: "JPY" }),
    allowed,
    p,
    { ...opts, actualShown: false },
  ).value;
  assert.equal(untouched.actualTouched, false);
  assert.equal(untouched.actual, null);
});

test("통화 칸이 비면 현지 통화, 현지가 없으면 예산 통화", () => {
  assert.equal(
    parseAmountFields(amt({ estimateAmount: "1" }), allowed, p, opts).value
      .estimate.currency,
    "JPY",
  );
  assert.equal(
    parseAmountFields(
      amt({ estimateAmount: "1" }),
      { currency: "KRW", localCurrency: null },
      p,
      opts,
    ).value.estimate.currency,
    "KRW",
  );
});

test("예상·실제 칸 오류", () => {
  assert.equal(
    parseAmountFields(
      amt({ estimateAmount: "1", estimateCurrency: "USD" }),
      allowed,
      p,
      opts,
    ).errors.estimateCurrency,
    "통화를 다시 골라 주세요.",
  );
  assert.equal(
    parseAmountFields(
      amt({ estimateAmount: "1.5", estimateCurrency: "KRW" }),
      allowed,
      p,
      opts,
    ).errors.estimateAmount,
    "소수점 없이 적어 주세요.",
  );
  assert.equal(
    parseAmountFields(
      amt({
        actualAmount: "1",
        actualCurrency: "JPY",
        actualPaidOn: "2026-13-01",
      }),
      allowed,
      p,
      opts,
    ).errors.actualPaidOn,
    "결제일을 다시 골라 주세요.",
  );
  assert.equal(
    parseAmountFields(
      amt({ actualAmount: "1", actualCurrency: "JPY", actualRate: "abc" }),
      allowed,
      p,
      opts,
    ).errors.actualRate,
    "환율을 0보다 큰 숫자로 적어 주세요.",
  );
});

test("일정 밖 항목", () => {
  const extra = (o) => ({
    ...EMPTY_AMOUNT_FIELDS,
    title: "항공권 왕복",
    date: "",
    ...o,
  });
  const o = { ...opts, tripDates: ["2026-11-21", "2026-11-22"] };
  const ok = parseExtraItem(
    extra({ estimateAmount: "420000", estimateCurrency: "KRW" }),
    allowed,
    p,
    o,
  );
  assert.equal(ok.value.date, null);
  assert.equal(ok.value.title, "항공권 왕복");
  assert.equal(
    parseExtraItem(
      extra({
        date: "2026-11-22",
        estimateAmount: "1",
        estimateCurrency: "KRW",
      }),
      allowed,
      p,
      o,
    ).value.date,
    "2026-11-22",
  );
  assert.equal(
    parseExtraItem(
      extra({ title: " ", estimateAmount: "1", estimateCurrency: "KRW" }),
      allowed,
      p,
      o,
    ).errors.title,
    "이름을 적어 주세요.",
  );
  assert.equal(
    parseExtraItem(
      extra({
        title: "a".repeat(101),
        estimateAmount: "1",
        estimateCurrency: "KRW",
      }),
      allowed,
      p,
      o,
    ).errors.title,
    "이름은 100자까지 적을 수 있어요.",
  );
  assert.equal(
    parseExtraItem(extra({}), allowed, p, o).errors.estimateAmount,
    "예상이나 실제 중 하나는 적어 주세요.",
  );
  assert.equal(
    parseExtraItem(
      extra({
        date: "2026-12-01",
        estimateAmount: "1",
        estimateCurrency: "KRW",
      }),
      allowed,
      p,
      o,
    ).errors.date,
    "날짜를 다시 골라 주세요.",
  );
});
