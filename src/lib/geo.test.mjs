import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceMeters, formatDistance, sortByDistance } from "./geo.ts";

test("distanceMeters between Seoul and Busan stations", () => {
  const d = distanceMeters(
    { lat: 37.5547, lng: 126.9707 },
    { lat: 35.1152, lng: 129.0422 },
  );
  assert.ok(d > 320_000 && d < 330_000, `got ${d}`);
});

test("distanceMeters of the same point is 0", () => {
  assert.equal(
    distanceMeters({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 }),
    0,
  );
});

test("formatDistance", () => {
  assert.equal(formatDistance(849.6), "850m");
  assert.equal(formatDistance(3449), "3.4km");
  assert.equal(formatDistance(123456), "123km");
});

test("sortByDistance puts ungeolocated items last, keeping their order", () => {
  const from = { lat: 37.5665, lng: 126.978 };
  const result = sortByDistance(
    [
      { id: "far", lat: 35.1796, lng: 129.0756 },
      { id: "none", lat: null, lng: null },
      { id: "near", lat: 37.5707, lng: 126.9769 },
    ],
    from,
  );
  assert.deepEqual(
    result.map((r) => r.item.id),
    ["near", "far", "none"],
  );
  assert.equal(result[2].meters, null);
  assert.ok(
    typeof result[0].meters === "number" && result[0].meters < result[1].meters,
  );
});
