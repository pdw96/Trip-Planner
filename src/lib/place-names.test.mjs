import assert from "node:assert/strict";
import { test } from "node:test";
import { isCountryCode } from "./countries.ts";
import { PLACE_NAMES } from "./place-names.ts";

test("every place maps to a listed country", () => {
  for (const [name, code] of Object.entries(PLACE_NAMES)) {
    assert.ok(isCountryCode(code), `${name} → ${code}`);
  }
});

test("names have no spaces and the table is large", () => {
  const keys = Object.keys(PLACE_NAMES);
  assert.ok(keys.length > 6000, String(keys.length));
  for (const key of keys) assert.doesNotMatch(key, /\s/);
});

test("known travel places map to their countries", () => {
  const expected = {
    부산: "KR",
    도쿄: "JP",
    오사카: "JP",
    후쿠오카: "JP",
    다낭: "VN",
    방콕: "TH",
    파리: "FR",
    런던: "GB",
    시드니: "AU",
    밴쿠버: "CA",
    규슈: "JP",
    발리: "ID",
    하와이: "US",
    보라카이: "PH",
  };
  for (const [name, code] of Object.entries(expected)) {
    assert.equal(PLACE_NAMES[name], code, name);
  }
});
