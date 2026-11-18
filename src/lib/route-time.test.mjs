import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ROUTES_MAX_AHEAD_DAYS,
  requestInstant,
  zonedToUtc,
} from "./route-time.ts";

const now = new Date("2026-11-18T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("weekday")} ${get("hour")}:${get("minute")}`;
}

test("도쿄 현지 시각을 UTC 로 바꾼다", () => {
  assert.equal(
    zonedToUtc("2026-12-04", "09:30", "Asia/Tokyo").toISOString(),
    "2026-12-04T00:30:00.000Z",
  );
});

test("파리: 겨울 UTC+1, 여름 UTC+2", () => {
  assert.equal(
    zonedToUtc("2026-12-04", "09:30", "Europe/Paris").toISOString(),
    "2026-12-04T08:30:00.000Z",
  );
  assert.equal(
    zonedToUtc("2027-07-01", "09:30", "Europe/Paris").toISOString(),
    "2027-07-01T07:30:00.000Z",
  );
});

test("서머타임 시작일 갭 뒤의 시각", () => {
  assert.equal(
    zonedToUtc("2027-03-28", "10:00", "Europe/Paris").toISOString(),
    "2027-03-28T08:00:00.000Z",
  );
});

test("서머타임 갭 안의 시각도 유효한 날짜를 돌려준다", () => {
  const d = zonedToUtc("2027-03-28", "02:30", "Europe/Paris");
  assert.ok(!Number.isNaN(d.getTime()));
});

test("지난 날짜는 같은 요일의 가장 가까운 미래로", () => {
  assert.equal(
    requestInstant("2026-11-01", "10:00", "Asia/Seoul", now, 100).toISOString(),
    "2026-11-22T01:00:00.000Z",
  );
});

test("미래 날짜는 그대로", () => {
  assert.equal(
    requestInstant("2026-12-04", "10:00", "Asia/Seoul", now, 100).toISOString(),
    "2026-12-04T01:00:00.000Z",
  );
});

test("너무 먼 미래는 같은 요일·현지 시각으로 당겨 온다", () => {
  const r = requestInstant("2027-06-01", "10:00", "Asia/Seoul", now, 100);
  assert.ok(r.getTime() > now.getTime());
  assert.ok(r.getTime() <= now.getTime() + 100 * DAY);
  assert.equal(localParts(r, "Asia/Seoul"), "Tue 10:00");
  assert.equal(
    localParts(new Date("2027-06-01T01:00:00Z"), "Asia/Seoul"),
    "Tue 10:00",
  );
});

test("서머타임을 넘겨도 현지 시각이 유지된다", () => {
  // 2026-10-20(화) 파리 10:00 → 서머타임 끝난 뒤의 같은 요일
  const r = requestInstant("2026-10-20", "10:00", "Europe/Paris", now, 100);
  assert.equal(localParts(r, "Europe/Paris"), "Tue 10:00");
  assert.ok(r.getTime() > now.getTime());
});

test("ROUTES_MAX_AHEAD_DAYS 는 양의 정수", () => {
  assert.ok(
    Number.isInteger(ROUTES_MAX_AHEAD_DAYS) && ROUTES_MAX_AHEAD_DAYS > 0,
  );
});
