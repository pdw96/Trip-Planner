import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOOGLE_PLACE_ID_PATTERN,
  PLACE_CATEGORIES,
  PLACE_LABEL_MAX,
} from "./place-input.ts";
import {
  EMPTY_SCHEDULE_FIELDS,
  parseScheduleInput,
  SCHEDULE_GOOGLE_LABEL_MAX,
  SCHEDULE_GOOGLE_PLACE_ID_PATTERN,
  SCHEDULE_PLACE_CATEGORIES,
} from "./schedule-input.ts";

const range = { startDate: "2026-12-03", endDate: "2026-12-05" };
const valid = {
  date: "2026-12-04",
  time: "09:30",
  title: "박물관",
  place: "",
  placeId: "",
  memo: "",
  googlePlaceId: "",
  googleLabel: "",
  googleCategory: "",
  estimateAmount: "",
  estimateCurrency: "",
  actualAmount: "",
  actualCurrency: "",
  actualPaidOn: "",
  actualRate: "",
};

const googlePick = {
  googlePlaceId: "ChIJabc",
  googleLabel: "시부야 스카이",
  googleCategory: "sight",
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
    placeId: "",
    memo: "",
    googlePlaceId: "",
    googleLabel: "",
    googleCategory: "",
    estimateAmount: "",
    estimateCurrency: "",
    actualAmount: "",
    actualCurrency: "",
    actualPaidOn: "",
    actualRate: "",
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
      placeId: null,
      memo: null,
      google: null,
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
      placeId: null,
      memo: null,
      google: null,
    },
  });
});

test("title or place is required", () => {
  assert.equal(
    errorsOf({ ...valid, title: "   " }).title,
    "제목이나 장소를 적어 주세요.",
  );
});

test("title is optional when a place is given", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(
    parseScheduleInput({ ...valid, title: "", place: "역" }, range).value.title,
    null,
  );
  assert.equal(isOk({ ...valid, title: "", placeId: id }), true);
  assert.equal(isOk({ ...valid, title: "", ...googlePick }), true);
});

test("google pick wins over placeId and place text", () => {
  const result = parseScheduleInput(
    {
      ...valid,
      placeId: "123e4567-e89b-12d3-a456-426614174000",
      place: "x".repeat(300),
      googlePlaceId: " ChIJabc ",
      googleLabel: " 시부야 스카이 ",
      googleCategory: "sight",
    },
    range,
  );
  assert.deepEqual(result.value.google, {
    googlePlaceId: "ChIJabc",
    label: "시부야 스카이",
    category: "sight",
  });
  assert.equal(result.value.placeId, null);
  assert.equal(result.value.place, null);
});

test("rejects a bad google pick", () => {
  for (const bad of [
    { googlePlaceId: "a/b" },
    { googleLabel: "" },
    { googleLabel: "가".repeat(101) },
    { googleCategory: "shop" },
  ]) {
    assert.equal(
      errorsOf({ ...valid, ...googlePick, ...bad }).place,
      "장소를 찾지 못했어요. 다시 검색해 주세요.",
      JSON.stringify(bad),
    );
  }
});

test("google place rules match place-input", () => {
  assert.deepEqual([...SCHEDULE_PLACE_CATEGORIES], [...PLACE_CATEGORIES]);
  assert.equal(SCHEDULE_GOOGLE_LABEL_MAX, PLACE_LABEL_MAX);
  assert.equal(
    SCHEDULE_GOOGLE_PLACE_ID_PATTERN.source,
    GOOGLE_PLACE_ID_PATTERN.source,
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

test("placeId: empty becomes null, uuid is kept, others are rejected", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(parseScheduleInput(valid, range).value.placeId, null);
  assert.equal(
    parseScheduleInput({ ...valid, placeId: id }, range).value.placeId,
    id,
  );
  assert.equal(
    errorsOf({ ...valid, placeId: "not-a-uuid" }).place,
    "장소를 다시 골라 주세요.",
  );
});

test("금액 칸은 일정 검증이 보지 않는다(#14, 금액은 budget-input 이 검증)", () => {
  const result = parseScheduleInput(
    { ...valid, estimateAmount: "abc", actualAmount: "-1" },
    range,
  );
  assert.equal(result.ok, true);
  assert.equal("estimateAmount" in result.value, false);
});
