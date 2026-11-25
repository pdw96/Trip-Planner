import assert from "node:assert/strict";
import { test } from "node:test";
import { matchCountry } from "./place-match.ts";

const names = {
  오사카: "JP",
  교토: "JP",
  부산: "KR",
  제주: "KR",
  일본: "JP",
  서울: "KR",
  도쿄: "JP",
  빈: "AT",
};

function match(destination) {
  return matchCountry(destination, names);
}

test("one country from several places", () => {
  assert.equal(match("오사카 교토"), "JP");
});

test("strips common suffixes before looking up", () => {
  assert.equal(match("부산여행"), "KR");
  assert.equal(match("제주도"), "KR");
});

test("matches country names", () => {
  assert.equal(match("일본 일주"), "JP");
});

test("two countries or none gives null", () => {
  assert.equal(match("서울 도쿄"), null);
  assert.equal(match("유럽 일주"), null);
  assert.equal(match(""), null);
});

test("matches whole words only", () => {
  assert.equal(match("빈티지 숍"), null);
  assert.equal(match("빈"), "AT");
});

test("splits on punctuation and spaces", () => {
  assert.equal(match("  부산 , 제주 "), "KR");
  assert.equal(match("오사카(교토)"), "JP");
  assert.equal(match("오사카/교토·일본"), "JP");
});

test("does not strip a suffix that would leave one letter", () => {
  // "도시" 에서 "시" 를 떼면 "도" 한 글자 → 떼지 않는다.
  assert.equal(matchCountry("도시", { 도: "JP" }), null);
});
