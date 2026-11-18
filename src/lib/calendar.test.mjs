import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarRange,
  formatSelection,
  initialSelection,
  monthCells,
  monthsInRange,
  monthTitle,
  nextSelection,
  stayLength,
  weekdayName,
  yearsInRange,
} from "./calendar.ts";

const TODAY = "2026-11-18";

test("calendarRange default", () => {
  assert.deepEqual(calendarRange(TODAY, "", ""), {
    first: { year: 2025, month: 11 },
    last: { year: 2028, month: 11 },
  });
});

test("calendarRange extends to selected dates", () => {
  assert.deepEqual(calendarRange(TODAY, "2020-05-01", "2020-05-03").first, {
    year: 2020,
    month: 5,
  });
  assert.deepEqual(calendarRange(TODAY, "2030-01-01", "2030-02-01").last, {
    year: 2030,
    month: 2,
  });
  assert.deepEqual(
    calendarRange(TODAY, "2020-5-1", "nope"),
    calendarRange(TODAY, "", ""),
  );
});

test("monthsInRange", () => {
  const months = monthsInRange(calendarRange(TODAY, "", ""));
  assert.equal(months.length, 37);
  const i = months.findIndex((m) => m.year === 2025 && m.month === 12);
  assert.deepEqual(months[i + 1], { year: 2026, month: 1 });
});

test("yearsInRange", () => {
  assert.deepEqual(
    yearsInRange(calendarRange(TODAY, "", "")),
    [2025, 2026, 2027, 2028],
  );
});

test("monthCells", () => {
  const dec = monthCells({ year: 2026, month: 12 });
  assert.equal(dec[0], null);
  assert.equal(dec[1], null);
  assert.deepEqual(dec[2], { date: "2026-12-01", day: 1, weekday: 2 });
  assert.equal(dec.filter(Boolean).length, 31);
  assert.equal(monthCells({ year: 2028, month: 2 }).filter(Boolean).length, 29);
  assert.equal(monthCells({ year: 2027, month: 2 }).filter(Boolean).length, 28);
});

test("monthTitle", () => {
  assert.equal(monthTitle({ year: 2027, month: 1 }), "2027.01");
});

test("invalid initial dates are ignored", () => {
  const empty = { start: null, end: null };
  assert.deepEqual(initialSelection("2026-2-3", "2026-12-01"), empty);
  assert.deepEqual(initialSelection("2026-12-03", "2026-12-01"), empty);
  assert.deepEqual(initialSelection("", ""), empty);
  assert.deepEqual(initialSelection("2026-12-01", "2026-12-03"), {
    start: "2026-12-01",
    end: "2026-12-03",
  });
});

test("nextSelection rules", () => {
  const A = "2026-12-20";
  const B = "2026-12-23";
  const C = "2027-01-05";
  assert.deepEqual(nextSelection({ start: null, end: null }, A), {
    start: A,
    end: null,
  });
  assert.deepEqual(nextSelection({ start: A, end: null }, A), {
    start: A,
    end: A,
  });
  assert.deepEqual(nextSelection({ start: A, end: null }, B), {
    start: A,
    end: B,
  });
  assert.deepEqual(nextSelection({ start: B, end: null }, A), {
    start: A,
    end: null,
  });
  assert.deepEqual(nextSelection({ start: A, end: B }, C), {
    start: C,
    end: null,
  });
});

test("nights across year", () => {
  assert.deepEqual(stayLength("2026-12-31", "2027-01-02"), {
    nights: 2,
    days: 3,
  });
  assert.deepEqual(stayLength("2026-12-20", "2026-12-20"), {
    nights: 0,
    days: 1,
  });
});

test("formatSelection", () => {
  const f = (start, end) => formatSelection({ start, end }, TODAY);
  assert.equal(f(null, null), "");
  assert.equal(f("2026-12-31", null), "12.31(목)~");
  assert.equal(
    f("2026-12-31", "2027-01-02"),
    "12.31(목)~2027.01.02(토) · 2박 3일",
  );
  assert.equal(f("2026-12-20", "2026-12-23"), "12.20(일)~12.23(수) · 3박 4일");
  assert.equal(
    f("2027-01-05", "2027-01-07"),
    "2027.01.05(화)~01.07(목) · 2박 3일",
  );
  assert.equal(f("2026-12-20", "2026-12-20"), "12.20(일) · 당일치기");
});

test("weekdayName", () => {
  assert.equal(weekdayName("2027-01-01"), "금");
  assert.equal(weekdayName("2026-12-20"), "일");
});
