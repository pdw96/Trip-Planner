import assert from "node:assert/strict";
import { test } from "node:test";
import { placeTravelLines } from "./travel-lines.ts";

const leg = (fromItemId, toItemId, fromLabel = "F", toLabel = "T") => ({
  key: `${fromItemId}>${toItemId}`,
  fromItemId,
  toItemId,
  fromLabel,
  toLabel,
});

test("바로 앞 줄에서 오면 출발지를 적지 않는다", () => {
  const r = placeTravelLines(["a", "b"], [leg("a", "b")]);
  assert.equal(r.before.get("b").caption, null);
  assert.equal(r.after, null);
});

test("사이에 다른 줄이 끼면 '<출발>에서'", () => {
  const r = placeTravelLines(["a", "x", "b"], [leg("a", "b", "경복궁")]);
  assert.equal(r.before.get("b").caption, "경복궁에서");
});

test("기준점에서 출발·기준점까지", () => {
  const r = placeTravelLines(
    ["a"],
    [leg(null, "a", "호텔"), leg("a", null, "A", "호텔")],
  );
  assert.equal(r.before.get("a").caption, "호텔에서");
  assert.equal(r.after.caption, "호텔까지");
});

test("기준점까지 구간의 출발이 마지막 줄이 아니면 출발지도", () => {
  const r = placeTravelLines(["a", "x"], [leg("a", null, "A", "호텔")]);
  assert.equal(r.after.caption, "A에서 호텔까지");
});

test("도착이 일정이면 그 줄 위 (기준점과 합친 끝 일정)", () => {
  const r = placeTravelLines(["a", "in"], [leg("a", "in")]);
  assert.ok(r.before.has("in"));
  assert.equal(r.after, null);
});

test("도착 일정이 없는 구간은 버린다", () => {
  const r = placeTravelLines(["a"], [leg("a", "gone")]);
  assert.equal(r.before.size, 0);
});

test("출발 일정이 없는 구간은 버린다 (위·아래 모두)", () => {
  const r = placeTravelLines(["a", "b"], [leg("gone", "b"), leg("gone", null)]);
  assert.equal(r.before.size, 0);
  assert.equal(r.after, null);
});

test("이름표를 모르면 출발지 없이", () => {
  const r = placeTravelLines(["a", "x", "b"], [leg("a", "b", null)]);
  assert.equal(r.before.get("b").caption, null);
});

test("같은 자리 둘째 구간은 버린다", () => {
  const first = leg("a", "b");
  const r = placeTravelLines(
    ["a", "b"],
    [first, { ...leg("a", "b"), key: "2" }],
  );
  assert.equal(r.before.get("b").leg, first);
});
