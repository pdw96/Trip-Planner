// 구간 표시 결정. Google Routes computeRoutes 응답을 요약하고, 대중교통 → 도보 → 직선 순서의 대체를 나라별로 정한다.
// 서버와 화면이 함께 쓰고, node --test 로 시험하므로 다른 모듈을 import 하지 않는다.

export type TransitSummary = {
  durationSeconds: number;
  lineName: string | null;
  vehicle: string | null;
  transfers: number;
  polyline: string | null;
};

export type WalkSummary = {
  durationSeconds: number;
  polyline: string | null;
};

export type Notice = "kr" | "jp" | "other";

export type FallbackRule = { askWalk: boolean; notice: Notice | null };

export type LegResult =
  | { kind: "transit"; transit: TransitSummary }
  | { kind: "walk"; walk: WalkSummary; notice: "jp" | "other" | null }
  | { kind: "straight"; notice: Notice | null }
  | { kind: "failed" };

export type PlaceRef = { label: string; googlePlaceId: string };

export const WALK_MAX_SECONDS = 3600;

export const NOTICES: Record<Notice, string> = {
  kr: "국내에서는 대중교통 길찾기만 돼요. Google 지도의 국내 도보·자동차 길찾기는 지도 데이터 반출 규제로 막혀 있다가 2026년 11월 규제가 풀렸고, Google 이 아직 출시하지 않았어요.",
  jp: "일본은 Google 이 앱에 대중교통 정보를 주지 않아요. Google 지도에서는 볼 수 있어요.",
  other: "이 지역은 Google 이 대중교통 정보를 주지 않아요.",
};

const FAILED_TEXT = "이동 정보를 불러오지 못했어요.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

// "2223s" → 2223. 모양이 틀리면 null.
function parseSeconds(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function firstRoute(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response) || !Array.isArray(response.routes)) return null;
  const route = response.routes[0];
  return isRecord(route) ? route : null;
}

function polylineOf(route: Record<string, unknown>): string | null {
  return isRecord(route.polyline) ? str(route.polyline.encodedPolyline) : null;
}

export function summarizeTransit(response: unknown): TransitSummary | null {
  const route = firstRoute(response);
  if (!route) return null;
  const durationSeconds = parseSeconds(route.duration);
  if (durationSeconds === null) return null;
  if (!Array.isArray(route.legs)) return null;

  const lines: { lineName: string | null; vehicle: string | null }[] = [];
  for (const leg of route.legs) {
    if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
    for (const step of leg.steps) {
      if (!isRecord(step) || !isRecord(step.transitDetails)) continue;
      const line = step.transitDetails.transitLine;
      const lineRec = isRecord(line) ? line : {};
      lines.push({
        lineName: str(lineRec.nameShort) ?? str(lineRec.name),
        vehicle: isRecord(lineRec.vehicle) ? str(lineRec.vehicle.type) : null,
      });
    }
  }
  if (lines.length === 0) return null;
  return {
    durationSeconds,
    lineName: lines[0].lineName,
    vehicle: lines[0].vehicle,
    transfers: lines.length - 1,
    polyline: polylineOf(route),
  };
}

export function summarizeWalk(response: unknown): WalkSummary | null {
  const route = firstRoute(response);
  if (!route) return null;
  const durationSeconds = parseSeconds(route.duration);
  if (durationSeconds === null) return null;
  return { durationSeconds, polyline: polylineOf(route) };
}

export function fallbackRule(
  fromCountry: string | null,
  toCountry: string | null,
): FallbackRule {
  if (fromCountry === "KR" || toCountry === "KR") {
    return { askWalk: false, notice: "kr" };
  }
  if (fromCountry === "JP" || toCountry === "JP") {
    return { askWalk: true, notice: "jp" };
  }
  if (fromCountry && toCountry) return { askWalk: true, notice: "other" };
  return { askWalk: true, notice: null };
}

export function decideLeg(
  transit: TransitSummary | null,
  walk: WalkSummary | null,
  rule: FallbackRule,
): LegResult {
  if (transit) return { kind: "transit", transit };
  if (rule.askWalk && walk && walk.durationSeconds <= WALK_MAX_SECONDS) {
    return {
      kind: "walk",
      walk,
      notice: rule.notice === "kr" ? null : rule.notice,
    };
  }
  return { kind: "straight", notice: rule.notice };
}

function minutesText(seconds: number): string {
  const total = Math.max(1, Math.round(seconds / 60));
  if (total < 60) return `${total}분`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

const RAIL = new Set([
  "SUBWAY",
  "HEAVY_RAIL",
  "COMMUTER_TRAIN",
  "HIGH_SPEED_TRAIN",
  "RAIL",
  "TRAM",
  "MONORAIL",
  "LIGHT_RAIL",
]);
const BUS = new Set(["BUS", "INTERCITY_BUS", "TROLLEYBUS"]);

function vehicleIcon(vehicle: string | null): string {
  if (vehicle && RAIL.has(vehicle)) return "🚇";
  if (vehicle && BUS.has(vehicle)) return "🚌";
  return "🚆";
}

export function legText(result: LegResult): string {
  switch (result.kind) {
    case "transit": {
      const t = result.transit;
      let text = `${vehicleIcon(t.vehicle)} ${minutesText(t.durationSeconds)}`;
      if (t.lineName) text += ` · ${t.lineName}`;
      if (t.transfers > 0) text += ` · 환승 ${t.transfers}회`;
      return text;
    }
    case "walk":
      return `🚶 ${minutesText(result.walk.durationSeconds)} (대중교통 정보 없음)`;
    case "straight":
      return "";
    case "failed":
      return FAILED_TEXT;
  }
}

export function directionsUrl(from: PlaceRef, to: PlaceRef): string {
  const params = new URLSearchParams({
    api: "1",
    origin: from.label,
    origin_place_id: from.googlePlaceId,
    destination: to.label,
    destination_place_id: to.googlePlaceId,
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function placeUrl(p: PlaceRef): string {
  const params = new URLSearchParams({
    api: "1",
    query: p.label,
    query_place_id: p.googlePlaceId,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

// 국내 여행(나라 코드 KR)은 장소·이동 링크를 네이버 지도로 연다(#36). 여행 나라 코드 하나로 정한다.
export function usesNaverMap(countryCode: string | null): boolean {
  return countryCode === "KR";
}

// 네이버 지도 이름 검색. 이름표만 넘긴다: Google 좌표·장소 id 는 Google 이 아닌 지도와 함께 쓰지 못한다(Google 약관).
export function naverSearchUrl(label: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(label)}`;
}
