import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultSide,
  isBudgetMode,
  personalTotalFor,
  splitByOwner,
  visibleSides,
} from "./budget-wallets.ts";

test("isBudgetMode", () => {
  assert.equal(isBudgetMode("both"), true);
  assert.equal(isBudgetMode("x"), false);
  assert.equal(isBudgetMode(null), false);
});

test("visibleSides: 방식의 쪽과 행이 남은 쪽", () => {
  assert.deepEqual(visibleSides("shared", { shared: false, mine: false }), [
    "shared",
  ]);
  assert.deepEqual(visibleSides("personal", { shared: false, mine: false }), [
    "mine",
  ]);
  assert.deepEqual(visibleSides("both", { shared: false, mine: false }), [
    "shared",
    "mine",
  ]);
  assert.deepEqual(visibleSides("personal", { shared: true, mine: false }), [
    "shared",
    "mine",
  ]);
  assert.deepEqual(visibleSides("shared", { shared: false, mine: true }), [
    "shared",
    "mine",
  ]);
});

test("splitByOwner: 남의 행은 버리고 센다", () => {
  const r = splitByOwner(
    [{ ownerUserId: null }, { ownerUserId: "me" }, { ownerUserId: "other" }],
    "me",
  );
  assert.equal(r.shared.length, 1);
  assert.equal(r.mine.length, 1);
  assert.equal(r.dropped, 1);
});

test("personalTotalFor: 통화가 바뀌면 stale", () => {
  assert.deepEqual(personalTotalFor(null, "KRW"), { total: null, stale: null });
  assert.deepEqual(
    personalTotalFor({ totalAmount: 1_000_000, currency: "KRW" }, "KRW"),
    { total: 1_000_000, stale: null },
  );
  assert.deepEqual(
    personalTotalFor({ totalAmount: 1_000_000, currency: "KRW" }, "USD"),
    { total: null, stale: { amount: 1_000_000, currency: "KRW" } },
  );
});

test("defaultSide", () => {
  assert.equal(defaultSide("personal"), "mine");
  assert.equal(defaultSide("both"), "shared");
  assert.equal(defaultSide("shared"), "shared");
});
