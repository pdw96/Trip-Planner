import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AXIS_SLOP,
  dragAxis,
  releaseVelocity,
  shouldCloseSheet,
} from "./sheet-drag.ts";

test("dragAxis waits until movement passes the slop", () => {
  assert.equal(AXIS_SLOP, 8);
  assert.equal(dragAxis(3, 5), null);
  assert.equal(dragAxis(0, 8), "y");
  assert.equal(dragAxis(10, 4), "x");
  assert.equal(dragAxis(-6, -9), "y");
});

// shouldCloseSheet(dy, velocity, height): velocity 는 놓기 직전 속도(px/ms, 아래가 +).
test("shouldCloseSheet closes after a long enough drag", () => {
  assert.equal(shouldCloseSheet(119, 0, 800), false);
  assert.equal(shouldCloseSheet(120, 0, 800), true);
  assert.equal(shouldCloseSheet(50, 0, 200), true); // 짧은 시트는 높이의 25%
});

test("shouldCloseSheet closes on a quick flick", () => {
  assert.equal(shouldCloseSheet(40, 0.6, 800), true);
  assert.equal(shouldCloseSheet(20, 2, 800), false); // 24px 미만
  assert.equal(shouldCloseSheet(40, 0.4, 800), false);
  assert.equal(shouldCloseSheet(80, -1, 800), false); // 끝에 위로 되돌림
});

test("shouldCloseSheet never closes on an upward drag", () => {
  assert.equal(shouldCloseSheet(-200, 3, 800), false);
});

test("releaseVelocity uses only the recent samples", () => {
  // 처음 300ms 가만히 있다가 마지막 40ms 에 80px 튕김: 평균은 느리지만 놓기 직전은 빠르다.
  const samples = [
    { y: 0, t: 0 },
    { y: 0, t: 300 },
    { y: 40, t: 320 },
    { y: 80, t: 340 },
  ];
  assert.equal(releaseVelocity(samples, 340), 2);
  assert.equal(releaseVelocity([{ y: 0, t: 0 }], 0), 0);
  assert.equal(releaseVelocity([], 10), 0);
});
