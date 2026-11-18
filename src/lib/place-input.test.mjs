import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATEGORY_LABELS,
  guessCategory,
  isGooglePlaceId,
  PLACE_CATEGORIES,
  parsePlaceEdit,
  parsePlaceInput,
} from "./place-input.ts";

const valid = {
  googlePlaceId: "ChIJOWucdKiMGGARbppa4b4CKA8",
  label: "경복궁",
  category: "sight",
  memo: "",
};

function errorsOf(raw) {
  const result = parsePlaceInput(raw);
  assert.equal(result.ok, false);
  return result.errors;
}

function isOk(raw) {
  return parsePlaceInput(raw).ok;
}

test("categories and labels", () => {
  assert.deepEqual(PLACE_CATEGORIES, [
    "lodging",
    "sight",
    "food",
    "cafe",
    "etc",
  ]);
  assert.deepEqual(CATEGORY_LABELS, {
    lodging: "숙소",
    sight: "관광",
    food: "맛집",
    cafe: "카페",
    etc: "기타",
  });
});

test("accepts valid input and trims", () => {
  assert.deepEqual(
    parsePlaceInput({ ...valid, label: "  경복궁  ", memo: "  일찍 가기  " }),
    {
      ok: true,
      value: {
        googlePlaceId: "ChIJOWucdKiMGGARbppa4b4CKA8",
        label: "경복궁",
        category: "sight",
        memo: "일찍 가기",
      },
    },
  );
});

test("blank memo becomes null", () => {
  assert.equal(parsePlaceInput({ ...valid, memo: "   " }).value.memo, null);
});

test("requires label", () => {
  assert.equal(
    errorsOf({ ...valid, label: "" }).label,
    "이름을 입력해 주세요.",
  );
  assert.equal(
    errorsOf({ ...valid, label: "   " }).label,
    "이름을 입력해 주세요.",
  );
});

test("limits label length by code points", () => {
  assert.equal(
    errorsOf({ ...valid, label: "가".repeat(101) }).label,
    "100자 이하로 입력해 주세요.",
  );
  assert.equal(isOk({ ...valid, label: "😀".repeat(100) }), true);
});

test("limits memo length to 200", () => {
  assert.equal(
    errorsOf({ ...valid, memo: "가".repeat(201) }).memo,
    "200자 이하로 입력해 주세요.",
  );
  assert.equal(isOk({ ...valid, memo: "가".repeat(200) }), true);
});

test("validates category", () => {
  assert.equal(
    errorsOf({ ...valid, category: "hotel" }).category,
    "종류를 골라 주세요.",
  );
  assert.equal(
    errorsOf({ ...valid, category: "" }).category,
    "종류를 골라 주세요.",
  );
});

test("validates google place id", () => {
  const message = "장소를 찾지 못했어요. 다시 검색해 주세요.";
  assert.equal(isOk({ ...valid, googlePlaceId: "ChIJ-_09" }), true);
  for (const googlePlaceId of ["a b", "", "a".repeat(301)]) {
    assert.equal(errorsOf({ ...valid, googlePlaceId }).googlePlaceId, message);
  }
  assert.equal(isOk({ ...valid, googlePlaceId: "a".repeat(300) }), true);
});

test("isGooglePlaceId", () => {
  assert.equal(isGooglePlaceId("ChIJOWucdKiMGGARbppa4b4CKA8"), true);
  assert.equal(isGooglePlaceId("a/b"), false);
  assert.equal(isGooglePlaceId(""), false);
});

test("collects multiple errors", () => {
  const errors = errorsOf({ ...valid, label: "", category: "x" });
  assert.ok(errors.label);
  assert.ok(errors.category);
});

test("parsePlaceEdit validates like parsePlaceInput without place id", () => {
  assert.deepEqual(
    parsePlaceEdit({ label: " 카페 ", category: "cafe", memo: "" }),
    { ok: true, value: { label: "카페", category: "cafe", memo: null } },
  );
  const result = parsePlaceEdit({
    label: "",
    category: "hotel",
    memo: "가".repeat(201),
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.label, "이름을 입력해 주세요.");
  assert.equal(result.errors.category, "종류를 골라 주세요.");
  assert.equal(result.errors.memo, "200자 이하로 입력해 주세요.");
  assert.equal(result.errors.googlePlaceId, undefined);
});

test("guessCategory uses primaryType first", () => {
  assert.equal(guessCategory("lodging", []), "lodging");
  assert.equal(guessCategory("ramen_restaurant", []), "food");
  assert.equal(guessCategory("cafe", []), "cafe");
  assert.equal(guessCategory("coffee_shop", []), "cafe");
  assert.equal(guessCategory("bakery", []), "cafe");
  assert.equal(guessCategory("bar", []), "food");
  assert.equal(guessCategory("museum", []), "sight");
  assert.equal(guessCategory("tourist_attraction", []), "sight");
  assert.equal(guessCategory("park", []), "sight");
});

test("guessCategory falls back to types in order", () => {
  assert.equal(guessCategory(null, ["hotel"]), "lodging");
  assert.equal(
    guessCategory(null, ["point_of_interest", "establishment"]),
    "sight",
  );
  assert.equal(guessCategory("dentist", ["health", "cafe"]), "cafe");
  assert.equal(guessCategory("dentist", ["health"]), "etc");
  assert.equal(guessCategory(null, []), "etc");
});
