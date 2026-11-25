import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COUNTRY_CODES,
  COUNTRY_CURRENCY,
  countryCurrency,
  countryNameIndex,
  countryOptions,
  FREQUENT_COUNTRY_CODES,
  isCountryCode,
} from "./countries.ts";

test("lists the 249 assigned ISO 3166-1 alpha-2 codes", () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  for (const code of COUNTRY_CODES) assert.match(code, /^[A-Z]{2}$/);
  for (const code of ["KR", "GU", "BQ", "SS", "AQ"]) {
    assert.ok(COUNTRY_CODES.includes(code), code);
  }
  assert.ok(!COUNTRY_CODES.includes("XK"));
});

test("frequent countries are real codes in the planned order", () => {
  assert.deepEqual(
    [...FREQUENT_COUNTRY_CODES],
    [
      "KR",
      "JP",
      "VN",
      "CN",
      "TH",
      "PH",
      "TW",
      "US",
      "GU",
      "HK",
      "SG",
      "MY",
      "ID",
    ],
  );
  for (const code of FREQUENT_COUNTRY_CODES) assert.ok(isCountryCode(code));
});

test("isCountryCode accepts only listed upper-case codes", () => {
  assert.equal(isCountryCode("KR"), true);
  for (const value of ["kr", "", "KOR", "ZZ", " KR", "XK"]) {
    assert.equal(isCountryCode(value), false, value);
  }
});

test("countryCurrency maps countries to supported currencies", () => {
  assert.equal(countryCurrency("KR"), "KRW");
  assert.equal(countryCurrency("JP"), "JPY");
  assert.equal(countryCurrency("BG"), "EUR");
  assert.equal(countryCurrency("GU"), "USD");
  assert.equal(countryCurrency("LI"), "CHF");
  assert.equal(countryCurrency("TW"), "TWD");
  assert.equal(countryCurrency("MN"), null);
  assert.equal(countryCurrency("MO"), null);
  assert.equal(countryCurrency("ZZ"), null);
});

test("every currency table key is a listed country", () => {
  for (const code of Object.keys(COUNTRY_CURRENCY)) {
    assert.ok(isCountryCode(code), code);
  }
});

test("countryOptions names countries in Korean, all sorted", () => {
  const { frequent, all } = countryOptions();
  assert.deepEqual(frequent[0], { code: "KR", name: "대한민국" });
  assert.equal(frequent.length, FREQUENT_COUNTRY_CODES.length);
  assert.equal(all.length, 249);
  const names = all.map((o) => o.name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b, "ko")),
  );
  assert.ok(all.some((o) => o.code === "JP" && o.name === "일본"));
});

test("countryNameIndex maps names without spaces to codes", () => {
  const index = countryNameIndex([
    { code: "JP", name: "일본" },
    { code: "NZ", name: "뉴질랜드" },
    { code: "ZA", name: "남아프리카 공화국" },
  ]);
  assert.equal(index.일본, "JP");
  assert.equal(index.남아프리카공화국, "ZA");
  assert.equal(countryNameIndex(countryOptions().all).일본, "JP");
});
