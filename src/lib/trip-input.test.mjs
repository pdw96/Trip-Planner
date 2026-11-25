import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_TRIP_FIELDS,
  isValidIsoDate,
  parseTripInput as parseRaw,
} from "./trip-input.ts";

const isCountry = (code) => code === "JP" || code === "KR";
const parseTripInput = (raw) => parseRaw(raw, isCountry);

const valid = {
  title: "겨울 휴가",
  destination: "오사카",
  startDate: "2026-12-20",
  endDate: "2026-12-23",
  notes: "",
  countryCode: "",
};

function errorsOf(raw) {
  const result = parseTripInput(raw);
  assert.equal(result.ok, false);
  return result.errors;
}

test("accepts valid input", () => {
  assert.deepEqual(parseTripInput(valid), {
    ok: true,
    value: { ...valid, notes: null, countryCode: null },
  });
});

test("trims values", () => {
  const result = parseTripInput({
    ...valid,
    title: "  겨울 휴가 ",
    destination: " 오사카",
    notes: " 메모 ",
  });
  assert.deepEqual(result, {
    ok: true,
    value: { ...valid, notes: "메모", countryCode: null },
  });
});

test("whitespace-only fields", () => {
  const errors = errorsOf({ ...valid, title: "   ", destination: " " });
  assert.equal(errors.title, "여행 이름을 입력해 주세요.");
  assert.equal(errors.destination, "여행지를 입력해 주세요.");

  const result = parseTripInput({ ...valid, notes: "  \n " });
  assert.equal(result.ok, true);
  assert.equal(result.value.notes, null);
});

test("length limits", () => {
  assert.equal(parseTripInput({ ...valid, title: "가".repeat(100) }).ok, true);
  assert.equal(
    errorsOf({ ...valid, title: "가".repeat(101) }).title,
    "100자 이하로 입력해 주세요.",
  );
  assert.equal(
    parseTripInput({ ...valid, destination: "가".repeat(100) }).ok,
    true,
  );
  assert.equal(
    errorsOf({ ...valid, destination: "가".repeat(101) }).destination,
    "100자 이하로 입력해 주세요.",
  );
  assert.equal(parseTripInput({ ...valid, notes: "가".repeat(2000) }).ok, true);
  assert.equal(
    errorsOf({ ...valid, notes: "가".repeat(2001) }).notes,
    "2000자 이하로 입력해 주세요.",
  );
  assert.equal(parseTripInput({ ...valid, title: "😀".repeat(100) }).ok, true);
});

test("missing dates", () => {
  assert.equal(
    errorsOf({ ...valid, startDate: "" }).startDate,
    "시작 날짜를 입력해 주세요.",
  );
  assert.equal(
    errorsOf({ ...valid, endDate: "" }).endDate,
    "끝 날짜를 입력해 주세요.",
  );
});

test("rejects impossible dates", () => {
  for (const date of ["2026-02-30", "2026-13-01", "2026-2-3", "2026/12/20"]) {
    const errors = errorsOf({ ...valid, startDate: date, endDate: date });
    assert.equal(errors.startDate, "날짜를 올바르게 입력해 주세요.", date);
    assert.equal(errors.endDate, "날짜를 올바르게 입력해 주세요.", date);
  }
  assert.equal(isValidIsoDate("2028-02-29"), true);
  assert.equal(isValidIsoDate("2027-02-29"), false);
});

test("end before start", () => {
  const errors = errorsOf({
    ...valid,
    startDate: "2026-12-23",
    endDate: "2026-12-20",
  });
  assert.equal(errors.endDate, "끝 날짜는 시작 날짜와 같거나 그 뒤여야 해요.");
  assert.equal(errors.startDate, undefined);

  assert.equal(
    parseTripInput({ ...valid, startDate: "2026-12-20", endDate: "2026-12-20" })
      .ok,
    true,
  );
});

test("reports every field at once", () => {
  const errors = errorsOf(EMPTY_TRIP_FIELDS);
  assert.deepEqual(Object.keys(errors).sort(), [
    "destination",
    "endDate",
    "startDate",
    "title",
  ]);
});

test("country code: empty is null, listed code is kept trimmed", () => {
  const result = parseTripInput({ ...valid, countryCode: " JP " });
  assert.equal(result.ok, true);
  assert.equal(result.value.countryCode, "JP");
  assert.equal(parseTripInput(valid).value.countryCode, null);
});

test("country code outside the list is a field error", () => {
  for (const code of ["jp", "ZZ", "JPN"]) {
    assert.equal(
      errorsOf({ ...valid, countryCode: code }).countryCode,
      "나라를 목록에서 다시 골라 주세요.",
      code,
    );
  }
});

test("EMPTY_TRIP_FIELDS has an empty country", () => {
  assert.equal(EMPTY_TRIP_FIELDS.countryCode, "");
});
