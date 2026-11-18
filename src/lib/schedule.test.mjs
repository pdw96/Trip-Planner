import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareScheduleItems,
  dateLabel,
  displayTime,
  groupSchedule,
  mapsSearchUrl,
  tripDays,
} from "./schedule.ts";

test("tripDays builds every day", () => {
  assert.deepEqual(tripDays("2026-12-03", "2026-12-05"), [
    { date: "2026-12-03", dayNumber: 1, label: "1일차 · 12월 3일 (목)" },
    { date: "2026-12-04", dayNumber: 2, label: "2일차 · 12월 4일 (금)" },
    { date: "2026-12-05", dayNumber: 3, label: "3일차 · 12월 5일 (토)" },
  ]);
});

test("tripDays single day", () => {
  assert.equal(tripDays("2026-12-03", "2026-12-03").length, 1);
});

test("tripDays across year end", () => {
  const days = tripDays("2026-12-30", "2027-01-02");
  assert.deepEqual(
    days.map((d) => d.date),
    ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"],
  );
  assert.equal(days[3].label, "4일차 · 1월 2일 (토)");
});

test("dateLabel", () => {
  assert.equal(dateLabel("2026-12-06", false), "12월 6일 (일)");
  assert.equal(dateLabel("2027-01-01", true), "2027년 1월 1일 (금)");
});

const at = (ms) => new Date(ms);
const item = (id, date, time, createdAt = at(0)) => ({
  id,
  date,
  time,
  createdAt,
});

function sorted(items) {
  return [...items].sort(compareScheduleItems).map((i) => i.id);
}

test("compareScheduleItems puts timed items in time order and untimed last", () => {
  assert.deepEqual(
    sorted([
      item("a", "2026-12-04", "15:00:00"),
      item("b", "2026-12-04", null),
      item("c", "2026-12-04", "09:30:00"),
    ]),
    ["c", "a", "b"],
  );
});

test("compareScheduleItems breaks ties by createdAt then id", () => {
  assert.deepEqual(
    sorted([
      item("x", "2026-12-04", null, at(2)),
      item("y", "2026-12-04", null, at(1)),
    ]),
    ["y", "x"],
  );
  assert.deepEqual(
    sorted([
      item("b", "2026-12-04", "10:00:00", at(1)),
      item("a", "2026-12-04", "10:00:00", at(1)),
    ]),
    ["a", "b"],
  );
});

test("compareScheduleItems orders by date first", () => {
  assert.deepEqual(
    sorted([
      item("late", "2026-12-05", "08:00:00"),
      item("early", "2026-12-04", null),
    ]),
    ["early", "late"],
  );
});

test("groupSchedule splits days and outside", () => {
  const items = [
    item("in", "2026-12-04", null),
    item("before", "2026-12-02", null),
    item("after2", "2026-12-06", null, at(2)),
    item("after1", "2026-12-06", "08:00:00", at(5)),
  ];
  const { days, outside } = groupSchedule(items, "2026-12-03", "2026-12-05");
  assert.equal(days.length, 3);
  assert.deepEqual(days[0].items, []);
  assert.deepEqual(
    days[1].items.map((i) => i.id),
    ["in"],
  );
  assert.deepEqual(
    outside.map((g) => [g.date, g.label, g.items.map((i) => i.id)]),
    [
      ["2026-12-02", "12월 2일 (수)", ["before"]],
      ["2026-12-06", "12월 6일 (일)", ["after1", "after2"]],
    ],
  );
});

test("groupSchedule shows year on outside dates in another year", () => {
  const { outside } = groupSchedule(
    [item("next", "2027-01-03", null)],
    "2026-12-30",
    "2027-01-02",
  );
  assert.equal(outside[0].label, "2027년 1월 3일 (일)");
});

test("displayTime", () => {
  assert.equal(displayTime("09:30:00"), "09:30");
  assert.equal(displayTime("09:30"), "09:30");
  assert.equal(displayTime(null), "");
});

test("mapsSearchUrl", () => {
  assert.equal(
    mapsSearchUrl("오사카 성"),
    "https://www.google.com/maps/search/?api=1&query=%EC%98%A4%EC%82%AC%EC%B9%B4%20%EC%84%B1",
  );
});

test("tripDays ends at the last representable year", () => {
  assert.deepEqual(
    tripDays("9999-12-30", "9999-12-31").map((d) => d.date),
    ["9999-12-30", "9999-12-31"],
  );
});
