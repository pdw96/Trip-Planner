import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseForDate,
  buildDayRoute,
  DEFAULT_DEPART,
  needsCoordsRefresh,
} from "./day-route.ts";

const mk = (id, lat, lng) => ({
  id,
  label: id,
  googlePlaceId: `g-${id}`,
  lat,
  lng,
});
const places = new Map([
  ["A", mk("A", 1, 1)],
  ["B", mk("B", 2, 2)],
  ["C", mk("C", 3, 3)],
  ["D", mk("D", null, null)],
]);
const dist = () => 1;
const summary = (r) =>
  r.legs.map(
    (l) => `${l.from.id}>${l.to.id} ${l.timing.kind} ${l.timing.time}`,
  );

test("baseForDate", () => {
  const rows = [
    { startDate: "2026-12-03", placeId: "A" },
    { startDate: "2026-12-05", placeId: null },
  ];
  assert.equal(baseForDate(rows, "2026-12-04"), "A");
  assert.equal(baseForDate(rows, "2026-12-05"), null);
  assert.equal(baseForDate(rows, "2026-12-02"), null);
  assert.equal(
    baseForDate([{ startDate: "2026-12-01", placeId: "A" }], "2026-12-03"),
    "A",
  );
  // 행 순서와 무관하게 가장 늦은 행
  assert.equal(baseForDate([...rows].reverse(), "2026-12-04"), "A");
});

test("base 있음: base → stops → base", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: "09:30" },
      { placeId: "C", time: null },
    ],
    "A",
    places,
    dist,
  );
  assert.deepEqual(summary(r), [
    "A>B arrival 09:30",
    "B>C departure 09:30",
    "C>A departure 10:00",
  ]);
  assert.deepEqual(
    r.stops.map((s) => [s.place.id, s.number]),
    [
      ["B", 1],
      ["C", 2],
    ],
  );
  assert.equal(r.base.id, "A");
  assert.equal(r.legs[0].fromIsBase, true);
  assert.equal(r.legs[0].toIsBase, false);
  assert.equal(r.legs[2].toIsBase, true);
  assert.equal(r.legs[0].straightMeters, 1);
});

test("base 없음", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: null },
      { placeId: "C", time: null },
    ],
    null,
    places,
    dist,
  );
  assert.equal(r.base, null);
  assert.deepEqual(summary(r), ["B>C departure 10:00"]);
  assert.equal(DEFAULT_DEPART, "10:00");
});

test("첫 stop 이 base 와 같음", () => {
  const r = buildDayRoute(
    [
      { placeId: "A", time: "12:00" },
      { placeId: "B", time: null },
    ],
    "A",
    places,
    dist,
  );
  assert.deepEqual(summary(r), ["A>B departure 12:00", "B>A departure 10:00"]);
  assert.equal(r.legs[0].fromIsBase, true);
  assert.deepEqual(
    r.stops.map((s) => [s.place.id, s.number]),
    [["B", 1]],
  );
});

test("연달아 같은 stop 은 합치고 번호를 건너뛰지 않는다", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: "09:00" },
      { placeId: "B", time: "11:00" },
      { placeId: "C", time: null },
    ],
    null,
    places,
    dist,
  );
  assert.deepEqual(summary(r), ["B>C departure 11:00"]);
  assert.deepEqual(
    r.stops.map((s) => [s.place.id, s.number]),
    [
      ["B", 1],
      ["C", 2],
    ],
  );
});

test("좌표 없는 장소는 뺀다", () => {
  const r = buildDayRoute([{ placeId: "D", time: null }], "A", places, dist);
  assert.deepEqual(r.legs, []);
  assert.deepEqual(r.stops, []);
  assert.equal(r.base.id, "A");
  const r2 = buildDayRoute([{ placeId: "X", time: null }], "D", places, dist);
  assert.equal(r2.base, null);
  assert.deepEqual(r2.legs, []);
});

test("비어 있음", () => {
  const r = buildDayRoute([], null, places, dist);
  assert.deepEqual(r, { base: null, stops: [], legs: [] });
});

test("needsCoordsRefresh", () => {
  const now = new Date("2026-11-18T00:00:01Z");
  assert.equal(needsCoordsRefresh(new Date("2026-10-18T00:00:00Z"), now), true);
  assert.equal(
    needsCoordsRefresh(new Date("2026-10-20T00:00:00Z"), now),
    false,
  );
});

test("마지막 stop 이 base 와 합쳐져도 시각은 도착으로 남는다", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: null },
      { placeId: "A", time: "15:00" },
    ],
    "A",
    places,
    dist,
  );
  assert.deepEqual(summary(r), ["A>B departure 10:00", "B>A arrival 15:00"]);
  const r2 = buildDayRoute(
    [
      { placeId: "B", time: "09:00" },
      { placeId: "A", time: null },
    ],
    "A",
    places,
    dist,
  );
  assert.deepEqual(summary(r2), ["A>B arrival 09:00", "B>A departure 09:00"]);
});

test("base 와 같은 stop 하나뿐이면 동선이 없다", () => {
  const r = buildDayRoute([{ placeId: "A", time: "12:00" }], "A", places, dist);
  assert.deepEqual(r.legs, []);
  assert.deepEqual(r.stops, []);
  assert.equal(r.base.id, "A");
});

test("가운데의 base 와 같은 stop 은 번호가 남는다", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: null },
      { placeId: "A", time: null },
      { placeId: "C", time: null },
    ],
    "A",
    places,
    dist,
  );
  assert.deepEqual(
    r.stops.map((s) => [s.place.id, s.number]),
    [
      ["B", 1],
      ["A", 2],
      ["C", 3],
    ],
  );
  assert.equal(r.legs.length, 4);
});
