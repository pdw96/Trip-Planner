import assert from "node:assert/strict";
import { test } from "node:test";
import { lineClass, lineIndex, miniLineDots } from "./day-line.ts";

test("lineIndex cycles every 8 days", () => {
  assert.deepEqual([1, 8, 9, 16, 17].map(lineIndex), [1, 8, 1, 8, 1]);
});

test("lineClass returns literal class names", () => {
  assert.equal(lineClass(3, "bg"), "bg-line-3");
  assert.equal(lineClass(11, "border"), "border-line-3");
  assert.equal(lineClass(8, "text"), "text-line-8");
});

test("miniLineDots keeps all days up to max", () => {
  assert.deepEqual(miniLineDots(3, 14), { shown: [1, 2, 3], hidden: 0 });
  assert.deepEqual(miniLineDots(14, 14), {
    shown: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    hidden: 0,
  });
});

test("miniLineDots trims long trips", () => {
  const r = miniLineDots(30, 14);
  assert.equal(r.shown.length, 13);
  assert.equal(r.hidden, 17);
  assert.deepEqual(r.shown.slice(0, 2), [1, 2]);
});
