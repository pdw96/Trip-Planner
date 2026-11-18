import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeFailure,
  HolidayResponseError,
  normalizeServiceKey,
  parseHolidayResponse,
} from "./holidays.ts";

// 2026년 실제 응답 (getRestDeInfo?solYear=2026&numOfRows=100&_type=json, 사용자가 브라우저로 받아 준 것).
const REAL_2026 = `{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE."},"body":{"items":{"item":[{"dateKind":"01","dateName":"1월1일","isHoliday":"Y","locdate":20260101,"seq":1},{"dateKind":"01","dateName":"설날","isHoliday":"Y","locdate":20260216,"seq":1},{"dateKind":"01","dateName":"설날","isHoliday":"Y","locdate":20260217,"seq":1},{"dateKind":"01","dateName":"설날","isHoliday":"Y","locdate":20260218,"seq":1},{"dateKind":"01","dateName":"삼일절","isHoliday":"Y","locdate":20260301,"seq":1},{"dateKind":"01","dateName":"대체공휴일(삼일절)","isHoliday":"Y","locdate":20260302,"seq":1},{"dateKind":"01","dateName":"노동절","isHoliday":"Y","locdate":20260501,"seq":2},{"dateKind":"01","dateName":"어린이날","isHoliday":"Y","locdate":20260505,"seq":2},{"dateKind":"01","dateName":"부처님오신날","isHoliday":"Y","locdate":20260524,"seq":1},{"dateKind":"01","dateName":"대체공휴일(부처님오신날)","isHoliday":"Y","locdate":20260525,"seq":1},{"dateKind":"01","dateName":"전국동시지방선거","isHoliday":"Y","locdate":20260603,"seq":1},{"dateKind":"01","dateName":"현충일","isHoliday":"Y","locdate":20260606,"seq":2},{"dateKind":"01","dateName":"제헌절","isHoliday":"Y","locdate":20260717,"seq":1},{"dateKind":"01","dateName":"광복절","isHoliday":"Y","locdate":20260815,"seq":1},{"dateKind":"01","dateName":"대체공휴일(광복절)","isHoliday":"Y","locdate":20260817,"seq":1},{"dateKind":"01","dateName":"추석","isHoliday":"Y","locdate":20260924,"seq":1},{"dateKind":"01","dateName":"추석","isHoliday":"Y","locdate":20260925,"seq":1},{"dateKind":"01","dateName":"추석","isHoliday":"Y","locdate":20260926,"seq":1},{"dateKind":"01","dateName":"개천절","isHoliday":"Y","locdate":20261003,"seq":1},{"dateKind":"01","dateName":"대체공휴일(개천절)","isHoliday":"Y","locdate":20261005,"seq":1},{"dateKind":"01","dateName":"한글날","isHoliday":"Y","locdate":20261009,"seq":1},{"dateKind":"01","dateName":"기독탄신일","isHoliday":"Y","locdate":20261225,"seq":1}]},"numOfRows":100,"pageNo":1,"totalCount":22}}}`;

const wrap = (items, resultCode = "00") =>
  JSON.stringify({
    response: {
      header: { resultCode, resultMsg: "NORMAL SERVICE." },
      body: { items, numOfRows: 100, pageNo: 1, totalCount: 1 },
    },
  });
const item = (locdate, isHoliday = "Y") => ({
  dateKind: "01",
  dateName: "공휴일",
  isHoliday,
  locdate,
  seq: 1,
});

test("parses real 2026 response", () => {
  const dates = parseHolidayResponse(REAL_2026);
  assert.equal(dates.length, 22);
  for (const date of [
    "2026-01-01",
    "2026-02-17",
    "2026-06-03",
    "2026-09-25",
    "2026-12-25",
  ]) {
    assert.ok(dates.includes(date), date);
  }
  assert.deepEqual(dates, [...dates].sort());
});

test("parses single item object", () => {
  assert.deepEqual(parseHolidayResponse(wrap({ item: item(20270101) })), [
    "2027-01-01",
  ]);
});

test("empty items", () => {
  assert.deepEqual(parseHolidayResponse(wrap("")), []);
  assert.deepEqual(parseHolidayResponse(wrap(null)), []);
  assert.throws(() => parseHolidayResponse(wrap(5)), HolidayResponseError);
});

test("string locdate", () => {
  assert.deepEqual(parseHolidayResponse(wrap({ item: [item("20270101")] })), [
    "2027-01-01",
  ]);
});

test("skips non-holidays and duplicates", () => {
  assert.deepEqual(
    parseHolidayResponse(
      wrap({ item: [item(20270101), item(20270102, "N"), item(20270101)] }),
    ),
    ["2027-01-01"],
  );
});

test("rejects error responses", () => {
  assert.throws(
    () => parseHolidayResponse(wrap({ item: [] }, "30")),
    HolidayResponseError,
  );
  assert.throws(
    () =>
      parseHolidayResponse(
        "<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>",
      ),
    HolidayResponseError,
  );
  assert.throws(
    () => parseHolidayResponse(wrap({ item: [item(2027010)] })),
    HolidayResponseError,
  );
  assert.throws(() => parseHolidayResponse("{}"), HolidayResponseError);
});

test("normalizeServiceKey decodes an Encoding key", () => {
  assert.equal(normalizeServiceKey("abc%2Bdef%2F%3D%3D"), "abc+def/==");
  assert.equal(normalizeServiceKey("abc+def/=="), "abc+def/==");
  assert.equal(normalizeServiceKey("  abc+def  "), "abc+def");
  // 깨진 % 는 그대로 둔다
  assert.equal(normalizeServiceKey("abc%ZZ"), "abc%ZZ");
});

test("describeFailure hides the key and trims the body", () => {
  const key = "abc+def/==";
  const body = `<OpenAPI_ServiceResponse><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><key>${key}</key><enc>${encodeURIComponent(key)}</enc></OpenAPI_ServiceResponse>`;
  const text = describeFailure(403, body, key);
  assert.ok(text.startsWith("HTTP 403 "), text);
  assert.ok(text.includes("SERVICE_KEY_IS_NOT_REGISTERED_ERROR"), text);
  assert.ok(
    !text.includes(key) && !text.includes(encodeURIComponent(key)),
    text,
  );
  assert.ok(describeFailure(500, "x".repeat(1000), key).length <= 220);
  assert.equal(describeFailure(403, "a\n  b", key), "HTTP 403 a b");
});
