import assert from "node:assert/strict";
import { test } from "node:test";
import {
  insertByTime,
  isReorderOf,
  keepsTimeOrder,
  orderWithItem,
} from "./schedule-order.ts";

const o = (id, time = null) => ({ id, time });
const ids = (items) => items.map((x) => x.id);

test("keepsTimeOrder allows untimed anywhere", () => {
  assert.equal(
    keepsTimeOrder([o("a"), o("b", "09:30"), o("c"), o("d", "18:00")]),
    true,
  );
});

test("keepsTimeOrder rejects later above earlier", () => {
  assert.equal(
    keepsTimeOrder([o("a", "10:00"), o("b"), o("c", "09:00")]),
    false,
  );
});

test("keepsTimeOrder allows equal times", () => {
  assert.equal(keepsTimeOrder([o("a", "12:00"), o("b", "12:00:00")]), true);
});

const day = [o("g", "09:30:00"), o("i"), o("b"), o("r", "18:00:00")];

test("insertByTime puts untimed last", () => {
  assert.deepEqual(ids(insertByTime(day, o("n"))), ["g", "i", "b", "r", "n"]);
});

test("insertByTime puts timed right before next later item", () => {
  assert.deepEqual(ids(insertByTime(day, o("n", "12:00"))), [
    "g",
    "i",
    "b",
    "n",
    "r",
  ]);
});

test("insertByTime goes after equal times", () => {
  assert.deepEqual(ids(insertByTime(day, o("n", "09:30"))), [
    "g",
    "i",
    "b",
    "n",
    "r",
  ]);
});

test("insertByTime with no later item goes last", () => {
  assert.deepEqual(ids(insertByTime(day, o("n", "20:00"))), [
    "g",
    "i",
    "b",
    "r",
    "n",
  ]);
});

test("insertByTime does not change the given array", () => {
  const copy = [...day];
  insertByTime(day, o("n"));
  assert.deepEqual(day, copy);
});

test("orderWithItem new item uses insertByTime", () => {
  assert.deepEqual(orderWithItem(day, o("n", "12:00")), [
    "g",
    "i",
    "b",
    "n",
    "r",
  ]);
});

test("orderWithItem into an empty day", () => {
  assert.deepEqual(orderWithItem([], o("n", "12:00")), ["n"]);
});

test("orderWithItem returns null when time unchanged", () => {
  assert.equal(orderWithItem(day, o("g", "09:30")), null);
  assert.equal(orderWithItem(day, o("i", null)), null);
});

test("orderWithItem treats HH:MM and HH:MM:SS as equal", () => {
  assert.equal(orderWithItem([o("a", "09:30:00")], o("a", "09:30")), null);
});

test("orderWithItem keeps place when time removed", () => {
  assert.deepEqual(orderWithItem(day, o("g", null)), ["g", "i", "b", "r"]);
});

test("orderWithItem keeps place when new time still fits", () => {
  assert.deepEqual(orderWithItem(day, o("b", "12:00")), ["g", "i", "b", "r"]);
});

test("orderWithItem reinserts when new time breaks order", () => {
  assert.deepEqual(orderWithItem(day, o("g", "19:00")), ["i", "b", "r", "g"]);
  assert.deepEqual(orderWithItem(day, o("i", "20:00")), ["g", "b", "r", "i"]);
});

test("isReorderOf accepts permutation", () => {
  assert.equal(isReorderOf(["b", "a"], ["a", "b"]), true);
});

test("isReorderOf rejects missing/extra/duplicate", () => {
  assert.equal(isReorderOf(["a"], ["a", "b"]), false);
  assert.equal(isReorderOf(["a", "b", "c"], ["a", "b"]), false);
  assert.equal(isReorderOf(["a", "a"], ["a", "b"]), false);
  assert.equal(isReorderOf(["a", "c"], ["a", "b"]), false);
});
