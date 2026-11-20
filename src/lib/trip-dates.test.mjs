import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatLongRange,
  formatShortRange,
  splitTrips,
  todayInSeoul,
  tripCountdown,
} from "./trip-dates.ts";

test("todayInSeoul crosses midnight in Seoul", () => {
  assert.equal(todayInSeoul(new Date("2026-11-17T14:59:00Z")), "2026-11-17");
  assert.equal(todayInSeoul(new Date("2026-11-17T15:00:00Z")), "2026-11-18");
});

function trip(id, startDate, endDate, createdAt = "2026-01-01T00:00:00Z") {
  return { id, startDate, endDate, createdAt: new Date(createdAt) };
}

test("splitTrips keeps trips ending today upcoming", () => {
  const { upcoming, past } = splitTrips(
    [
      trip("today", "2026-11-15", "2026-11-18"),
      trip("yesterday", "2026-11-15", "2026-11-17"),
    ],
    "2026-11-18",
  );
  assert.deepEqual(
    upcoming.map((t) => t.id),
    ["today"],
  );
  assert.deepEqual(
    past.map((t) => t.id),
    ["yesterday"],
  );
});

test("splitTrips orders", () => {
  const input = [
    trip("later", "2027-01-05", "2027-01-07"),
    trip("sooner-b", "2026-12-20", "2026-12-23", "2026-02-01T00:00:00Z"),
    trip("sooner-a", "2026-12-20", "2026-12-21", "2026-01-01T00:00:00Z"),
    trip("old", "2025-10-03", "2025-10-05"),
    trip("recent-b", "2026-10-01", "2026-10-05", "2026-02-01T00:00:00Z"),
    trip("recent-a", "2026-10-03", "2026-10-05", "2026-01-01T00:00:00Z"),
  ];
  const before = input.map((t) => t.id);
  const { upcoming, past } = splitTrips(input, "2026-11-18");
  assert.deepEqual(
    upcoming.map((t) => t.id),
    ["sooner-a", "sooner-b", "later"],
  );
  assert.deepEqual(
    past.map((t) => t.id),
    ["recent-a", "recent-b", "old"],
  );
  assert.deepEqual(
    input.map((t) => t.id),
    before,
  );
});

test("formatShortRange", () => {
  const today = "2026-11-18";
  assert.equal(
    formatShortRange("2026-12-20", "2026-12-23", today),
    "12/20 – 12/23",
  );
  assert.equal(
    formatShortRange("2027-01-05", "2027-01-07", today),
    "2027/1/5 – 1/7",
  );
  assert.equal(
    formatShortRange("2026-12-30", "2027-01-02", today),
    "12/30 – 2027/1/2",
  );
  assert.equal(
    formatShortRange("2025-10-03", "2025-10-05", today),
    "2025/10/3 – 10/5",
  );
  assert.equal(formatShortRange("2026-12-20", "2026-12-20", today), "12/20");
});

test("formatLongRange", () => {
  assert.equal(
    formatLongRange("2026-12-20", "2026-12-23"),
    "2026년 12월 20일 – 12월 23일",
  );
  assert.equal(
    formatLongRange("2026-12-30", "2027-01-02"),
    "2026년 12월 30일 – 2027년 1월 2일",
  );
  assert.equal(formatLongRange("2026-12-20", "2026-12-20"), "2026년 12월 20일");
});

test("tripCountdown", () => {
  assert.equal(
    tripCountdown("2026-12-05", "2026-12-07", "2026-11-20"),
    "15일 남음",
  );
  assert.equal(
    tripCountdown("2026-12-05", "2026-12-07", "2026-12-04"),
    "내일 출발",
  );
  assert.equal(
    tripCountdown("2026-12-05", "2026-12-07", "2026-12-05"),
    "여행 중",
  );
  assert.equal(
    tripCountdown("2026-12-05", "2026-12-07", "2026-12-07"),
    "여행 중",
  );
  assert.equal(tripCountdown("2026-12-05", "2026-12-07", "2026-12-08"), null);
});
