import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideLeg,
  directionsUrl,
  fallbackRule,
  legText,
  NOTICES,
  naverSearchUrl,
  placeUrl,
  summarizeTransit,
  summarizeWalk,
  usesNaverMap,
  WALK_MAX_SECONDS,
} from "./leg-display.ts";

const step = (type, nameShort, name) => ({
  transitDetails: { transitLine: { nameShort, name, vehicle: { type } } },
});

const seoul = {
  routes: [
    {
      duration: "2223s",
      distanceMeters: 5000,
      polyline: { encodedPolyline: "abc" },
      legs: [
        {
          steps: [{ travelMode: "WALK" }, step("BUS", "01A", "서울 01A")],
        },
      ],
    },
  ],
};

test("서울 응답: 버스 01A", () => {
  const t = summarizeTransit(seoul);
  assert.deepEqual(t, {
    durationSeconds: 2223,
    lineName: "01A",
    vehicle: "BUS",
    transfers: 0,
    polyline: "abc",
  });
  assert.equal(legText({ kind: "transit", transit: t }), "🚌 37분 · 01A");
});

test("빈 응답과 걷기만 있는 응답은 null", () => {
  assert.equal(summarizeTransit({}), null);
  const walkOnly = {
    routes: [{ duration: "600s", legs: [{ steps: [{ travelMode: "WALK" }] }] }],
  };
  assert.equal(summarizeTransit(walkOnly), null);
});

test("망가진 모양은 던지지 않고 null", () => {
  for (const bad of [
    null,
    undefined,
    1,
    "x",
    [],
    { routes: "x" },
    { routes: [null] },
    { routes: [{ legs: 3 }] },
  ]) {
    assert.equal(summarizeTransit(bad), null);
    assert.equal(summarizeWalk(bad), null);
  }
});

test("지하철 두 단계는 환승 1회, nameShort 없으면 name", () => {
  const res = {
    routes: [
      {
        duration: "1080s",
        legs: [
          {
            steps: [
              step("SUBWAY", undefined, "JR 야마노테선"),
              step("SUBWAY", "G", "긴자선"),
            ],
          },
        ],
      },
    ],
  };
  const t = summarizeTransit(res);
  assert.equal(t.transfers, 1);
  assert.equal(t.lineName, "JR 야마노테선");
  assert.equal(t.polyline, null);
  const text = legText({ kind: "transit", transit: t });
  assert.equal(text, "🚇 18분 · JR 야마노테선 · 환승 1회");
});

test("lineName 이 null 이면 아이콘과 분만", () => {
  const t = {
    durationSeconds: 600,
    lineName: null,
    vehicle: "FERRY",
    transfers: 0,
    polyline: null,
  };
  assert.equal(legText({ kind: "transit", transit: t }), "🚆 10분");
});

test("summarizeWalk: duration 만 있으면 충분", () => {
  assert.deepEqual(summarizeWalk({ routes: [{ duration: "1500s" }] }), {
    durationSeconds: 1500,
    polyline: null,
  });
  assert.equal(summarizeWalk({}), null);
  assert.equal(
    summarizeWalk({
      routes: [{ duration: "10s", polyline: { encodedPolyline: "p" } }],
    }).polyline,
    "p",
  );
});

test("fallbackRule", () => {
  assert.deepEqual(fallbackRule("KR", "JP"), { askWalk: false, notice: "kr" });
  assert.deepEqual(fallbackRule("JP", "KR"), { askWalk: false, notice: "kr" });
  assert.deepEqual(fallbackRule("JP", "JP"), { askWalk: true, notice: "jp" });
  assert.deepEqual(fallbackRule("FR", "FR"), {
    askWalk: true,
    notice: "other",
  });
  assert.deepEqual(fallbackRule(null, "FR"), { askWalk: true, notice: null });
  assert.deepEqual(fallbackRule("FR", null), { askWalk: true, notice: null });
});

test("decideLeg", () => {
  const jp = fallbackRule("JP", "JP");
  const t = {
    durationSeconds: 600,
    lineName: null,
    vehicle: null,
    transfers: 0,
    polyline: null,
  };
  assert.equal(decideLeg(t, null, jp).kind, "transit");
  assert.deepEqual(
    decideLeg(null, { durationSeconds: 3601, polyline: null }, jp),
    {
      kind: "straight",
      notice: "jp",
    },
  );
  const w = { durationSeconds: WALK_MAX_SECONDS, polyline: null };
  assert.deepEqual(decideLeg(null, w, jp), {
    kind: "walk",
    walk: w,
    notice: "jp",
  });
  assert.deepEqual(decideLeg(null, w, fallbackRule("KR", "KR")), {
    kind: "straight",
    notice: "kr",
  });
  assert.deepEqual(decideLeg(null, null, fallbackRule(null, null)), {
    kind: "straight",
    notice: null,
  });
});

test("legText: walk, straight, failed, 시간 단위", () => {
  assert.equal(
    legText({
      kind: "walk",
      walk: { durationSeconds: 3976, polyline: null },
      notice: null,
    }),
    "🚶 1시간 6분 (대중교통 정보 없음)",
  );
  assert.equal(
    legText({
      kind: "walk",
      walk: { durationSeconds: 3600, polyline: null },
      notice: null,
    }),
    "🚶 1시간 (대중교통 정보 없음)",
  );
  assert.equal(
    legText({
      kind: "walk",
      walk: { durationSeconds: 10, polyline: null },
      notice: null,
    }),
    "🚶 1분 (대중교통 정보 없음)",
  );
  assert.equal(legText({ kind: "straight", notice: "kr" }), "");
  assert.equal(legText({ kind: "failed" }), "이동 정보를 불러오지 못했어요.");
});

test("NOTICES 문구", () => {
  assert.equal(
    NOTICES.jp,
    "일본은 Google 이 앱에 대중교통 정보를 주지 않아요. Google 지도에서는 볼 수 있어요.",
  );
  assert.equal(
    NOTICES.other,
    "이 지역은 Google 이 대중교통 정보를 주지 않아요.",
  );
  assert.match(NOTICES.kr, /^국내에서는 대중교통 길찾기만 돼요\./);
});

test("URL", () => {
  const a = { label: "서울역", googlePlaceId: "ChIJ_a-1" };
  const b = { label: "경복궁 & 광화문", googlePlaceId: "ChIJ_b" };
  const u = new URL(directionsUrl(a, b));
  assert.equal(u.origin + u.pathname, "https://www.google.com/maps/dir/");
  assert.equal(u.searchParams.get("api"), "1");
  assert.equal(u.searchParams.get("origin"), "서울역");
  assert.equal(u.searchParams.get("origin_place_id"), "ChIJ_a-1");
  assert.equal(u.searchParams.get("destination"), "경복궁 & 광화문");
  assert.equal(u.searchParams.get("destination_place_id"), "ChIJ_b");
  assert.equal(u.searchParams.get("travelmode"), "transit");
  assert.ok(!directionsUrl(a, b).includes("서울역"));
  const p = new URL(placeUrl(a));
  assert.equal(p.origin + p.pathname, "https://www.google.com/maps/search/");
  assert.equal(p.searchParams.get("query"), "서울역");
  assert.equal(p.searchParams.get("query_place_id"), "ChIJ_a-1");
});

test("usesNaverMap: 한국 여행만", () => {
  assert.equal(usesNaverMap("KR"), true);
  assert.equal(usesNaverMap("JP"), false);
  assert.equal(usesNaverMap(null), false);
});

test("naverSearchUrl: 이름표만 검색어로", () => {
  assert.equal(
    naverSearchUrl("해운대 해수욕장"),
    "https://map.naver.com/p/search/%ED%95%B4%EC%9A%B4%EB%8C%80%20%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5",
  );
  const u = new URL(naverSearchUrl("카페 A/B #2 ?&%"));
  assert.equal(u.origin, "https://map.naver.com");
  assert.equal(u.hash, "");
  assert.equal(u.search, "");
  assert.equal(
    decodeURIComponent(u.pathname.slice("/p/search/".length)),
    "카페 A/B #2 ?&%",
  );
});
