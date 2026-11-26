import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countCompanions,
  namesByTrip,
  peopleLine,
  withNames,
} from "./trip-people.ts";

const rows = [
  { tripId: "t1", userId: "u1", name: "민수" },
  { tripId: "t1", userId: "u2", name: "지영" },
  { tripId: "t2", userId: "u1", name: "민수" },
  { tripId: "t3", userId: "u3", name: "민수" }, // 이름만 같은 다른 사람
  { tripId: "t9", userId: "u4", name: "수진" }, // 추억이 아닌 여행
];

test("countCompanions: 서로 다른 사람, 여행 수, 정렬", () => {
  assert.deepEqual(countCompanions(rows, ["t1", "t2", "t3"]), [
    { name: "민수", count: 2 },
    { name: "민수", count: 1 },
    { name: "지영", count: 1 },
  ]);
});

test("countCompanions: 같은 이름 다른 사람은 따로", () => {
  assert.equal(countCompanions(rows, ["t2", "t3"]).length, 2);
});

test("countCompanions: 결과에 userId 가 없다", () => {
  for (const p of countCompanions(rows, ["t1"])) {
    assert.deepEqual(Object.keys(p).sort(), ["count", "name"]);
  }
});

test("countCompanions: 같은 여행에 같은 사람이 두 번 와도 1", () => {
  const twice = [
    { tripId: "t1", userId: "u1", name: "민수" },
    { tripId: "t1", userId: "u1", name: "민수" },
  ];
  assert.deepEqual(countCompanions(twice, ["t1"]), [
    { name: "민수", count: 1 },
  ]);
});

test("countCompanions: 고른 여행이 없으면 빈 목록", () => {
  assert.deepEqual(countCompanions(rows, []), []);
});

test("namesByTrip: 여행마다 들어온 순서, 같은 사람 한 번", () => {
  const map = namesByTrip([
    ...rows,
    { tripId: "t1", userId: "u1", name: "민수" },
  ]);
  assert.deepEqual(map.get("t1"), ["민수", "지영"]);
  assert.deepEqual(map.get("t3"), ["민수"]);
  assert.equal(map.get("none"), undefined);
});

test("peopleLine: 3명 넘으면 외 N명", () => {
  assert.equal(
    peopleLine(["가", "나", "다", "라", "마"]),
    "가 · 나 · 다 외 2명",
  );
  assert.equal(peopleLine(["가", "나", "다"]), "가 · 나 · 다");
  assert.equal(peopleLine(["가"]), "가");
  assert.equal(peopleLine([]), null);
});

test("withNames: 3명 넘으면 외 N명과", () => {
  assert.equal(withNames(["민수", "지영"]), "민수님, 지영님과");
  assert.equal(
    withNames(["가", "나", "다", "라"]),
    "가님, 나님, 다님 외 1명과",
  );
  assert.equal(withNames(["민수"]), "민수님과");
  assert.equal(withNames([]), null);
});
