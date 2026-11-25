import assert from "node:assert/strict";
import { test } from "node:test";
import {
  companionsLine,
  recordBadge,
  recordNotice,
  splitRecords,
} from "./trip-records.ts";

test("splitRecords: 기록은 따로, 최근 먼저", () => {
  const a = { id: "a", detachedAt: null };
  const r1 = { id: "r1", detachedAt: "2026-11-20T03:00:00Z" };
  const r2 = { id: "r2", detachedAt: "2026-11-22T03:00:00Z" };
  assert.deepEqual(splitRecords([r1, a, r2]), {
    active: [a],
    records: [r2, r1],
  });
});

test("recordBadge", () => {
  assert.equal(
    recordBadge("민수", "2026-11-20T15:30:00Z"),
    "민수님 여행에서 · 11/21 떼어 냄",
  ); // 서울 00:30
  assert.equal(
    recordBadge(null, "2026-11-20T03:00:00Z"),
    "함께한 여행에서 · 11/20 떼어 냄",
  );
});

test("companionsLine", () => {
  assert.equal(companionsLine([]), null);
  assert.equal(companionsLine(["B"]), "B님과 함께");
  assert.equal(companionsLine(["B", "C"]), "B님, C님과 함께");
});

test("recordNotice", () => {
  assert.equal(
    recordNotice("민수", "2026-11-20T15:30:00Z"),
    "민수님의 여행에서 11월 21일에 떼어 냈어요. 함께 쓰던 일정, 장소, 모임 지출은 그날 모습 그대로 보기만 할 수 있어요.",
  ); // 서울 00:30
  assert.equal(
    recordNotice(null, new Date("2026-11-20T03:00:00Z")),
    "함께한 여행에서 11월 20일에 떼어 냈어요. 함께 쓰던 일정, 장소, 모임 지출은 그날 모습 그대로 보기만 할 수 있어요.",
  );
});
