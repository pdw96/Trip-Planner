import assert from "node:assert/strict";
import { test } from "node:test";
import { AXIS_SLOP, dragAxis, shouldCloseSheet } from "./sheet-drag.ts";

test("dragAxis waits until movement passes the slop", () => {
  assert.equal(AXIS_SLOP, 8);
  assert.equal(dragAxis(3, 5), null);
  assert.equal(dragAxis(0, 8), "y");
  assert.equal(dragAxis(10, 4), "x");
  assert.equal(dragAxis(-6, -9), "y");
});

test("shouldCloseSheet closes after a long enough drag", () => {
  assert.equal(shouldCloseSheet(119, 1000, 800), false);
  assert.equal(shouldCloseSheet(120, 1000, 800), true);
  assert.equal(shouldCloseSheet(50, 1000, 200), true); // 짧은 시트는 높이의 25%
});

test("shouldCloseSheet closes on a quick flick", () => {
  assert.equal(shouldCloseSheet(40, 60, 800), true);
  assert.equal(shouldCloseSheet(20, 10, 800), false); // 24px 미만
  assert.equal(shouldCloseSheet(40, 0, 800), false);
});

test("shouldCloseSheet never closes on an upward drag", () => {
  assert.equal(shouldCloseSheet(-200, 50, 800), false);
});
