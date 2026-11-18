import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_SCHEDULE_FIELDS, parseScheduleInput } from "./schedule-input.ts";

const range = { startDate: "2026-12-03", endDate: "2026-12-05" };
const valid = {
  date: "2026-12-04",
  time: "09:30",
  title: "박물관",
  place: "",
  memo: "",
};

function errorsOf(raw, allowed = range) {
  const result = parseScheduleInput(raw, allowed);
  assert.equal(result.ok, false);
  return result.errors;
}

function isOk(raw, allowed = range) {
  return parseScheduleInput(raw, allowed).ok;
}

test("empty fields are all blank", () => {
  assert.deepEqual(EMPTY_SCHEDULE_FIELDS, {
    date: "",
    time: "",
    title: "",
    place: "",
    memo: "",
  });
});

test("accepts valid input", () => {
  assert.deepEqual(parseScheduleInput(valid, range), {
    ok: true,
    value: {
      date: "2026-12-04",
      time: "09:30",
      title: "박물관",
      place: null,
      memo: null,
    },
  });
});

test("trims and nulls optional fields", () => {
  const result = parseScheduleInput(
    { ...valid, time: "", title: " a ", place: "  역  ", memo: "   " },
    range,
  );
  assert.deepEqual(result, {
    ok: true,
    value: {
      date: "2026-12-04",
      time: null,
      title: "a",
      place: "역",
      memo: null,
    },
  });
});

test("requires title", () => {
  assert.equal(
    errorsOf({ ...valid, title: "   " }).title,
    "제목을 입력해 주세요.",
  );
});

test("limits lengths", () => {
  assert.equal(
    errorsOf({ ...valid, title: "가".repeat(101) }).title,
    "100자 이하로 입력해 주세요.",
  );
  assert.equal(isOk({ ...valid, title: "😀".repeat(100) }), true);
  assert.equal(
    errorsOf({ ...valid, place: "가".repeat(201) }).place,
    "200자 이하로 입력해 주세요.",
  );
  assert.equal(
    errorsOf({ ...valid, memo: "가".repeat(2001) }).memo,
    "2000자 이하로 입력해 주세요.",
  );
});

test("validates time", () => {
  for (const time of ["24:00", "9:30", "12:60", "09:30:00", "ab"]) {
    assert.equal(
      errorsOf({ ...valid, time }).time,
      "시각을 올바르게 입력해 주세요.",
      time,
    );
  }
  assert.equal(isOk({ ...valid, time: "00:00" }), true);
  assert.equal(isOk({ ...valid, time: "23:59" }), true);
});

test("validates date in trip range", () => {
  for (const date of ["2026-12-02", "2026-12-06"]) {
    assert.equal(
      errorsOf({ ...valid, date }).date,
      "여행 기간 안의 날짜를 골라 주세요.",
      date,
    );
  }
  assert.equal(isOk({ ...valid, date: "2026-12-03" }), true);
  assert.equal(isOk({ ...valid, date: "2026-12-05" }), true);
  for (const date of ["2026-02-30", ""]) {
    assert.equal(
      errorsOf({ ...valid, date }).date,
      "날짜를 올바르게 입력해 주세요.",
      date,
    );
  }
});

test("allows keeping an out-of-range current date", () => {
  const allowed = { ...range, currentDate: "2026-12-07" };
  assert.equal(isOk({ ...valid, date: "2026-12-07" }, allowed), true);
  assert.equal(
    errorsOf({ ...valid, date: "2026-12-08" }, allowed).date,
    "여행 기간 안의 날짜를 골라 주세요.",
  );
});

test("collects multiple errors", () => {
  const errors = errorsOf({ ...valid, title: "", time: "25:00" });
  assert.ok(errors.title);
  assert.ok(errors.time);
});
