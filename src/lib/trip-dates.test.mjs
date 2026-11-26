import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatLongRange,
  formatShortRange,
  groupTrips,
  nextTripBadge,
  resolveSelection,
  splitTrips,
  stayLength,
  todayInSeoul,
  tripCountdown,
  tripDayCount,
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

test("tripDayCount counts days without expanding them", () => {
  assert.equal(tripDayCount("2026-12-05", "2026-12-07"), 3);
  assert.equal(tripDayCount("2026-12-05", "2026-12-05"), 1);
  assert.equal(tripDayCount("2026-12-30", "2027-01-02"), 4);
  assert.equal(tripDayCount("2026-01-01", "3026-01-01"), 365243);
});

test("resolveSelection keeps all and in-range dates", () => {
  assert.equal(resolveSelection("all", "2026-12-05", "2026-12-07"), "all");
  assert.equal(
    resolveSelection("2026-12-05", "2026-12-05", "2026-12-07"),
    "2026-12-05",
  );
  assert.equal(
    resolveSelection("2026-12-07", "2026-12-05", "2026-12-07"),
    "2026-12-07",
  );
});

test("resolveSelection falls back to all", () => {
  assert.equal(
    resolveSelection("2026-12-08", "2026-12-05", "2026-12-07"),
    "all",
  );
  assert.equal(
    resolveSelection("2026-12-04", "2026-12-05", "2026-12-07"),
    "all",
  );
  assert.equal(resolveSelection("", "2026-12-05", "2026-12-07"), "all");
});

test("stayLength", () => {
  assert.equal(stayLength("2026-12-05", "2026-12-05"), "당일");
  assert.equal(stayLength("2026-12-05", "2026-12-06"), "1박 2일");
  assert.equal(stayLength("2026-12-30", "2027-01-02"), "3박 4일");
});

// #122 여행 나누기. 기존 trip() 은 넷째 인자가 createdAt 이라 따로 둔다.
function t(
  id,
  startDate,
  endDate,
  { hasMembers = false, detachedAt = null } = {},
) {
  return {
    id,
    startDate,
    endDate,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    hasMembers,
    detachedAt,
  };
}

const ids = (list) => list.map((x) => x.id);

test("groupTrips: 표의 네 줄", () => {
  const today = "2026-11-26";
  const shared = t("shared", "2026-12-01", "2026-12-03", { hasMembers: true });
  const solo = t("solo", "2027-02-14", "2027-02-17");
  const rec = t("rec", "2026-12-10", "2026-12-11", {
    detachedAt: "2026-11-20T00:00:00Z",
  });
  const past = t("past", "2026-03-28", "2026-03-31", { hasMembers: true });
  const g = groupTrips([past, rec, solo, shared], today);
  assert.deepEqual(ids(g.together), ["shared"]);
  assert.deepEqual(ids(g.ahead), ["rec", "solo"]);
  assert.deepEqual(g.memories, [{ year: "2026", trips: [past] }]);
  assert.equal(g.next?.id, "shared");
  assert.equal(g.memoryCount, 1);
  assert.equal(g.thisYearCount, 1);
});

test("groupTrips: 모든 여행이 정확히 한 곳", () => {
  const today = "2026-11-26";
  const input = [
    t("shared", "2026-12-01", "2026-12-03", { hasMembers: true }),
    t("solo", "2027-02-14", "2027-02-17"),
    t("rec", "2026-12-10", "2026-12-11", {
      detachedAt: "2026-11-20T00:00:00Z",
    }),
    t("past", "2026-03-28", "2026-03-31", { hasMembers: true }),
    t("now", "2026-11-25", "2026-11-27"),
    t("pastRec", "2026-08-02", "2026-08-03", {
      detachedAt: "2026-11-21T00:00:00Z",
    }),
  ];
  const g = groupTrips(input, today);
  const placed = [
    ...ids(g.together),
    ...ids(g.ahead),
    ...g.memories.flatMap((m) => ids(m.trips)),
  ];
  assert.deepEqual([...placed].sort(), ids(input).sort());
  assert.equal(new Set(placed).size, placed.length);
  assert.ok(g.memories.some((m) => ids(m.trips).includes("pastRec")));
});

test("groupTrips: 오늘 끝나는 여행은 아직 추억이 아니다", () => {
  const g = groupTrips([t("a", "2026-11-24", "2026-11-26")], "2026-11-26");
  assert.equal(g.memories.length, 0);
  assert.equal(g.next?.id, "a");
});

test("groupTrips: 오늘 시작하는 여행이 다음 여행", () => {
  const g = groupTrips(
    [
      t("later", "2026-12-01", "2026-12-02"),
      t("today", "2026-11-26", "2026-11-28"),
    ],
    "2026-11-26",
  );
  assert.equal(g.next?.id, "today");
});

test("groupTrips: 기록은 다음 여행이 아니다", () => {
  const rec = t("rec", "2026-11-27", "2026-11-28", {
    detachedAt: "2026-11-20T00:00:00Z",
  });
  const later = t("later", "2026-12-20", "2026-12-21");
  assert.equal(groupTrips([rec, later], "2026-11-26").next?.id, "later");
  assert.equal(groupTrips([rec], "2026-11-26").next, null);
});

test("groupTrips: 연도 묶음은 최근 먼저, 올해 세기", () => {
  const a = t("a", "2026-03-01", "2026-03-02");
  const b = t("b", "2026-07-01", "2026-07-03");
  const c = t("c", "2025-12-30", "2026-01-02");
  const g = groupTrips([a, c, b], "2026-11-26");
  assert.deepEqual(
    g.memories.map((m) => [m.year, ids(m.trips)]),
    [
      ["2026", ["b", "a"]],
      ["2025", ["c"]],
    ],
  );
  assert.equal(g.memoryCount, 3);
  assert.equal(g.thisYearCount, 2);
});

test("nextTripBadge", () => {
  assert.equal(nextTripBadge("2026-11-29", "2026-11-26"), "D-3");
  assert.equal(nextTripBadge("2026-11-27", "2026-11-26"), "D-1");
  assert.equal(nextTripBadge("2026-11-25", "2026-11-26"), "여행 중 · 2일째");
  assert.equal(nextTripBadge("2026-11-26", "2026-11-26"), "여행 중 · 1일째");
});
