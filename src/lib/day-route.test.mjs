import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseForDate,
  basesForDay,
  buildDayRoute,
  DEFAULT_DEPART,
  daySignature,
  needsCoordsRefresh,
  previousDate,
  routeItemsFor,
  routesByDate,
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
const AA = { start: "A", end: "A" };
const NONE = { start: null, end: null };
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
    AA,
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
  assert.equal(r.start.id, "A");
  assert.equal(r.end.id, "A");
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
    NONE,
    places,
    dist,
  );
  assert.equal(r.start, null);
  assert.equal(r.end, null);
  assert.deepEqual(summary(r), ["B>C departure 10:00"]);
  assert.equal(DEFAULT_DEPART, "10:00");
});

test("첫 stop 이 base 와 같음", () => {
  const r = buildDayRoute(
    [
      { placeId: "A", time: "12:00" },
      { placeId: "B", time: null },
    ],
    AA,
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
    NONE,
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
  const r = buildDayRoute([{ placeId: "D", time: null }], AA, places, dist);
  assert.deepEqual(r.legs, []);
  assert.deepEqual(r.stops, []);
  assert.equal(r.start.id, "A");
  assert.equal(r.end.id, "A");
  const r2 = buildDayRoute(
    [{ placeId: "X", time: null }],
    { start: "D", end: "D" },
    places,
    dist,
  );
  assert.equal(r2.start, null);
  assert.equal(r2.end, null);
  assert.deepEqual(r2.legs, []);
});

test("비어 있음", () => {
  const r = buildDayRoute([], NONE, places, dist);
  assert.deepEqual(r, { start: null, end: null, stops: [], legs: [] });
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
    AA,
    places,
    dist,
  );
  assert.deepEqual(summary(r), ["A>B departure 10:00", "B>A arrival 15:00"]);
  const r2 = buildDayRoute(
    [
      { placeId: "B", time: "09:00" },
      { placeId: "A", time: null },
    ],
    AA,
    places,
    dist,
  );
  assert.deepEqual(summary(r2), ["A>B arrival 09:00", "B>A departure 09:00"]);
});

test("base 와 같은 stop 하나뿐이면 동선이 없다", () => {
  const r = buildDayRoute([{ placeId: "A", time: "12:00" }], AA, places, dist);
  assert.deepEqual(r.legs, []);
  assert.deepEqual(r.stops, []);
  assert.equal(r.start.id, "A");
  assert.equal(r.end.id, "A");
});

test("가운데의 base 와 같은 stop 은 번호가 남는다", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: null },
      { placeId: "A", time: null },
      { placeId: "C", time: null },
    ],
    AA,
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

test("같은 장소가 이어지면 들어오는 구간은 첫 시각, 나가는 구간은 마지막 시각을 쓴다", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: "09:00" },
      { placeId: "B", time: "11:00" },
      { placeId: "C", time: null },
    ],
    AA,
    places,
    dist,
  );
  assert.deepEqual(summary(r), [
    "A>B arrival 09:00",
    "B>C departure 11:00",
    "C>A departure 10:00",
  ]);
});

test("합친 stop 중 나중 것만 시각이 있으면 그 시각이 도착·출발 모두에 쓰인다", () => {
  const r = buildDayRoute(
    [
      { placeId: "B", time: null },
      { placeId: "B", time: "11:00" },
      { placeId: "C", time: null },
    ],
    AA,
    places,
    dist,
  );
  assert.deepEqual(summary(r), [
    "A>B arrival 11:00",
    "B>C departure 11:00",
    "C>A departure 10:00",
  ]);
});

test("구간의 일정 id: 기준점은 null, 합친 점은 도착=처음·출발=마지막", () => {
  const r = buildDayRoute(
    [
      { itemId: "i1", placeId: "B", time: "09:30" },
      { itemId: "i2", placeId: "B", time: "11:00" },
      { itemId: "i3", placeId: "C", time: null },
    ],
    AA,
    places,
    dist,
  );
  assert.deepEqual(
    r.legs.map((l) => [l.fromItemId, l.toItemId]),
    [
      [null, "i1"],
      ["i2", "i3"],
      ["i3", null],
    ],
  );
});

test("기준점과 같은 장소의 첫·끝 일정은 일정 id 가 이긴다", () => {
  const r = buildDayRoute(
    [
      { itemId: "out", placeId: "A", time: "09:00" },
      { itemId: "i1", placeId: "B", time: null },
      { itemId: "in", placeId: "A", time: "18:00" },
    ],
    AA,
    places,
    dist,
  );
  assert.deepEqual(
    r.legs.map((l) => [l.fromItemId, l.toItemId, l.fromIsBase, l.toIsBase]),
    [
      ["out", "i1", true, false],
      ["i1", "in", false, true],
    ],
  );
});

test("좌표 없는 장소의 일정은 건너뛴다", () => {
  const r = buildDayRoute(
    [
      { itemId: "i1", placeId: "B", time: null },
      { itemId: "i2", placeId: "D", time: null },
      { itemId: "i3", placeId: "C", time: null },
    ],
    NONE,
    places,
    dist,
  );
  assert.deepEqual(
    r.legs.map((l) => [l.fromItemId, l.toItemId]),
    [["i1", "i3"]],
  );
});

test("routesByDate: 날짜별로 그날 장소 일정만, 시각은 앞 5자", () => {
  const items = [
    { id: "i1", date: "2026-12-03", placeId: "B", time: "09:30:00" },
    { id: "x", date: "2026-12-03", placeId: null, time: null },
    { id: "i2", date: "2026-12-04", placeId: "C", time: null },
  ];
  const m = routesByDate(
    ["2026-12-03", "2026-12-04"],
    items,
    [{ startDate: "2026-12-03", placeId: "A" }],
    { startDate: "2026-12-03", endDate: "2026-12-05" },
    places,
    dist,
    "me",
  );
  // 12-03 은 첫날이라 전날 밤 숙소가 없다: 첫 일정에서 시작해 그날 밤 숙소 A 로.
  assert.deepEqual(summary(m.get("2026-12-03")), ["B>A departure 09:30"]);
  assert.deepEqual(m.get("2026-12-03").legs[0].fromItemId, "i1");
  assert.deepEqual(summary(m.get("2026-12-04")), [
    "A>C departure 10:00",
    "C>A departure 10:00",
  ]);
});

test("daySignature 은 일정 id 를 담는다", () => {
  const two = (second) =>
    buildDayRoute(
      [
        { itemId: "i1", placeId: "B", time: null },
        { itemId: second, placeId: "C", time: null },
      ],
      NONE,
      places,
      dist,
    );
  assert.equal(daySignature(two("i2")), daySignature(two("i2")));
  assert.notEqual(daySignature(two("i2")), daySignature(two("i3")));
});

// --- 그날 밤 숙소(#91): 시작점은 전날 밤 숙소, 끝점은 그날 밤 숙소 ---

const trip3 = { startDate: "2026-12-01", endDate: "2026-12-03" };
const moved = [
  { startDate: "2026-12-01", placeId: "A" },
  { startDate: "2026-12-02", placeId: "B" },
  { startDate: "2026-12-03", placeId: null },
];

test("previousDate", () => {
  assert.equal(previousDate("2026-12-01"), "2026-11-30");
  assert.equal(previousDate("2027-01-01"), "2026-12-31");
  assert.equal(previousDate("2028-03-01"), "2028-02-29");
});

test("basesForDay: 첫날·옮기는 날·마지막 날", () => {
  assert.deepEqual(basesForDay(moved, "2026-12-01", trip3), {
    start: null,
    end: "A",
  });
  assert.deepEqual(basesForDay(moved, "2026-12-02", trip3), {
    start: "A",
    end: "B",
  });
  assert.deepEqual(basesForDay(moved, "2026-12-03", trip3), {
    start: "B",
    end: null,
  });
});

test("basesForDay: 마지막 날 행은 무시, 당일치기는 없음", () => {
  const rows = [
    { startDate: "2026-12-01", placeId: "A" },
    { startDate: "2026-12-03", placeId: "C" },
  ];
  assert.deepEqual(basesForDay(rows, "2026-12-03", trip3), {
    start: "A",
    end: null,
  });
  const day = { startDate: "2026-12-01", endDate: "2026-12-01" };
  assert.deepEqual(basesForDay(rows, "2026-12-01", day), {
    start: null,
    end: null,
  });
});

test("basesForDay: 없음 행 = 그날 밤 숙소 없음", () => {
  const rows = [
    { startDate: "2026-12-01", placeId: "A" },
    { startDate: "2026-12-02", placeId: null },
  ];
  const trip4 = { startDate: "2026-12-01", endDate: "2026-12-04" };
  assert.deepEqual(basesForDay(rows, "2026-12-02", trip4), {
    start: "A",
    end: null,
  });
  assert.deepEqual(basesForDay(rows, "2026-12-03", trip4), {
    start: null,
    end: null,
  });
});

test("buildDayRoute: 시작점과 끝점이 다르다", () => {
  const r = buildDayRoute(
    [{ itemId: "i1", placeId: "C", time: "13:00" }],
    { start: "A", end: "B" },
    places,
    dist,
  );
  assert.deepEqual(summary(r), ["A>C arrival 13:00", "C>B departure 13:00"]);
  assert.equal(r.start.id, "A");
  assert.equal(r.end.id, "B");
  assert.deepEqual([r.legs[0].fromIsBase, r.legs[1].toIsBase], [true, true]);
});

test("buildDayRoute: 일정 없이 A → B", () => {
  const r = buildDayRoute([], { start: "A", end: "B" }, places, dist);
  assert.deepEqual(summary(r), ["A>B departure 10:00"]);
  assert.deepEqual(r.stops, []);
});

test("buildDayRoute: 시작점=끝점, 일정 없음", () => {
  const r = buildDayRoute([], { start: "A", end: "A" }, places, dist);
  assert.deepEqual(r.legs, []);
  assert.equal(r.start.id, "A");
});

test("buildDayRoute: 좌표 없는 끝점은 빠진다", () => {
  const r = buildDayRoute(
    [{ itemId: "i1", placeId: "B", time: null }],
    { start: "A", end: "D" },
    places,
    dist,
  );
  assert.deepEqual(summary(r), ["A>B departure 10:00"]);
  assert.equal(r.end, null);
});

test("routesByDate: 날짜 하나만 넘겨도 전날 밤 숙소에서 시작", () => {
  const items = [{ id: "i1", date: "2026-12-02", placeId: "C", time: null }];
  const one = routesByDate(
    ["2026-12-02"],
    items,
    moved,
    trip3,
    places,
    dist,
    "me",
  ).get("2026-12-02");
  const all = routesByDate(
    ["2026-12-01", "2026-12-02", "2026-12-03"],
    items,
    moved,
    trip3,
    places,
    dist,
    "me",
  ).get("2026-12-02");
  assert.deepEqual(summary(one), [
    "A>C departure 10:00",
    "C>B departure 10:00",
  ]);
  assert.equal(daySignature(one), daySignature(all));
});

test("daySignature 는 시작점·끝점을 담는다", () => {
  const s = (bases) =>
    daySignature(
      buildDayRoute(
        [{ itemId: "i1", placeId: "C", time: null }],
        bases,
        places,
        dist,
      ),
    );
  assert.notEqual(s({ start: "A", end: "B" }), s({ start: "B", end: "A" }));
});

test("routeItemsFor: 모두 + 나만, 순서 유지", () => {
  const items = [
    { id: "a", forUserId: "me" },
    { id: "b", forUserId: "friend" },
    { id: "c", forUserId: null },
    { id: "d" },
  ];
  assert.deepEqual(
    routeItemsFor(items, "me").map((i) => i.id),
    ["a", "c", "d"],
  );
  assert.deepEqual(
    routeItemsFor(items, "friend").map((i) => i.id),
    ["b", "c", "d"],
  );
});

test("routesByDate: 첫날 각자 오는 길 → 합류, 사람마다 동선이 다름", () => {
  // B = 부산역, C = 동대구역, A = 서울역(모두). 첫날, 밤 숙소 없음.
  const items = [
    {
      id: "me1",
      date: "2026-12-03",
      placeId: "B",
      time: "08:00:00",
      forUserId: "me",
    },
    {
      id: "fr1",
      date: "2026-12-03",
      placeId: "C",
      time: "08:30:00",
      forUserId: "friend",
    },
    {
      id: "all",
      date: "2026-12-03",
      placeId: "A",
      time: "11:00:00",
      forUserId: null,
    },
  ];
  const run = (viewer) =>
    routesByDate(
      ["2026-12-03"],
      items,
      [],
      { startDate: "2026-12-03", endDate: "2026-12-03" },
      places,
      dist,
      viewer,
    ).get("2026-12-03");
  assert.deepEqual(summary(run("me")), ["B>A arrival 11:00"]);
  assert.deepEqual(summary(run("friend")), ["C>A arrival 11:00"]);
  assert.deepEqual(
    run("me").stops.map((s) => s.place.id),
    ["B", "A"],
  );
});

test("routesByDate: 마지막 날 해산 → 각자", () => {
  const items = [
    {
      id: "all",
      date: "2026-12-05",
      placeId: "A",
      time: "15:00:00",
      forUserId: null,
    },
    {
      id: "me2",
      date: "2026-12-05",
      placeId: "B",
      time: "18:00:00",
      forUserId: "me",
    },
    {
      id: "fr2",
      date: "2026-12-05",
      placeId: "C",
      time: "18:30:00",
      forUserId: "friend",
    },
  ];
  const r = routesByDate(
    ["2026-12-05"],
    items,
    [],
    { startDate: "2026-12-03", endDate: "2026-12-05" },
    places,
    dist,
    "friend",
  ).get("2026-12-05");
  assert.deepEqual(summary(r), ["A>C arrival 18:30"]);
});

test("routesByDate: 모두뿐이면 viewer 와 상관없이 같은 결과", () => {
  const items = [
    {
      id: "i1",
      date: "2026-12-03",
      placeId: "B",
      time: "09:30:00",
      forUserId: null,
    },
    { id: "i2", date: "2026-12-03", placeId: "C", time: null, forUserId: null },
  ];
  const args = [
    ["2026-12-03"],
    items,
    [{ startDate: "2026-12-03", placeId: "A" }],
    { startDate: "2026-12-03", endDate: "2026-12-05" },
    places,
    dist,
  ];
  assert.deepEqual(
    daySignature(routesByDate(...args, "me").get("2026-12-03")),
    daySignature(routesByDate(...args, "x").get("2026-12-03")),
  );
});
