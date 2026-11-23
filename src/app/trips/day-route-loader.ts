import "server-only";
import { listPlaces } from "@/db/queries/places";
import { listScheduleItems } from "@/db/queries/schedule-items";
import { listTripBases } from "@/db/queries/trip-bases";
import { getTrip } from "@/db/queries/trips";
import {
  type DayLeg,
  type RoutePlace,
  routesByDate,
  type TripRange,
} from "@/lib/day-route";
import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo";
import {
  fetchPlaceRegion,
  fetchTransit,
  fetchWalk,
} from "@/lib/google-maps-server";
import {
  decideLeg,
  directionsUrl,
  fallbackRule,
  type LegResult,
  legText,
  type Notice,
} from "@/lib/leg-display";
import { ROUTES_MAX_AHEAD_DAYS, requestInstant } from "@/lib/route-time";
import { isValidIsoDate } from "@/lib/trip-input";

// 하루 동선의 구간 이동 정보를 묻는다. 부르는 곳은 Route Handler(./[id]/day-route/route.ts) 하나다.
// Server Action 으로 두면 Next 가 클라이언트의 Server Action 을 하나씩 차례로 보내므로,
// Google 을 기다리는 동안 완료 체크·기준점·일정 저장이 뒤에서 기다린다(브라우저 확인 #39).
// userId 는 부르는 쪽이 getCurrentUser() 로 확인한 값이다. tripId·date 는 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위), 날짜 검사가 막는다.
// 인자는 tripId·date 뿐이다(§5.7): 구간은 서버가 이 사용자의 여행 장소로만 만들고,
// 클라이언트가 좌표나 장소 id 쌍을 보내 임의 구간을 묻게 하지 않는다(서버 키로 남의 좌표 조회 막기).
// 구간 결과·나라·시간대는 저장하지 않는다(§3.2, §5.3): DB 에도, 요청을 넘어서는 메모리에도 두지 않는다.

export type LegView = {
  fromId: string;
  toId: string;
  // 출발·도착 일정 id(기준점만이면 null). 일정표가 이동 줄 자리를 정한다(#37).
  fromItemId: string | null;
  toItemId: string | null;
  result: LegResult;
  text: string;
  straightMeters: number;
  distanceText: string;
  directionsUrl: string;
};

export type DayRouteResult =
  | { ok: true; legs: LegView[]; notices: Notice[] }
  | { ok: false };

type Region = { countryCode: string | null; timeZone: string | null };

const NOTICE_ORDER: Notice[] = ["kr", "jp", "other"];

// 한 번에 Google 에 묻는 구간 수 상한(호출 비용 상한). 한 날 구간은 많아야 십여 개다(§5.3).
// 넘는 구간은 Google 을 부르지 않고 직선 거리만(안내 문구 없이) 보인다. 나라·시간대도 앞 구간들의 장소만 묻는다.
const MAX_LEGS_PER_DAY = 20;
const STRAIGHT_ONLY: LegResult = { kind: "straight", notice: null };

function coordsOf(place: RoutePlace): LatLng | null {
  return place.lat === null || place.lng === null
    ? null
    : { lat: place.lat, lng: place.lng };
}

// 구간 시각을 Routes 요청 순간으로. 시간대를 모르거나 계산이 안 되면 null(시각 없이, 지금 기준으로 묻는다).
function requestTime(
  date: string,
  leg: DayLeg,
  regions: Map<string, Region | null>,
  now: Date,
): { kind: "arrival" | "departure"; instant: Date } | null {
  // 도착 시각은 도착 장소의, 출발 시각은 출발 장소의 현지 시각이다.
  const place = leg.timing.kind === "arrival" ? leg.to : leg.from;
  const timeZone = regions.get(place.id)?.timeZone ?? null;
  if (!timeZone) return null;
  try {
    const instant = requestInstant(
      date,
      leg.timing.time,
      timeZone,
      now,
      ROUTES_MAX_AHEAD_DAYS,
    );
    if (Number.isNaN(instant.getTime())) return null;
    return { kind: leg.timing.kind, instant };
  } catch {
    // 이 런타임이 모르는 시간대 이름이면 Intl 이 RangeError 를 던진다.
    return null;
  }
}

// 대중교통 → (필요하면) 도보 → 직선. 대중교통 호출이 실패하면 failed(저장하지 않으므로 다음에 다시 묻는다).
async function resolveLeg(
  date: string,
  leg: DayLeg,
  regions: Map<string, Region | null>,
  now: Date,
): Promise<LegResult> {
  const from = coordsOf(leg.from);
  const to = coordsOf(leg.to);
  if (!from || !to) return { kind: "failed" };

  const rule = fallbackRule(
    regions.get(leg.from.id)?.countryCode ?? null,
    regions.get(leg.to.id)?.countryCode ?? null,
  );
  const transit = await fetchTransit(
    from,
    to,
    requestTime(date, leg, regions, now),
  );
  if (!transit.ok) return { kind: "failed" };
  if (transit.summary || !rule.askWalk) {
    return decideLeg(transit.summary, null, rule);
  }
  // 도보 대체 조회에는 시각을 주지 않는다. 실패하면 도보 정보 없음으로 보고 직선으로 둔다.
  const walk = await fetchWalk(from, to);
  return decideLeg(null, walk.ok ? walk.summary : null, rule);
}

// null 은 찾을 수 없음(id·날짜 형식이 틀림, 없는 여행, 남의 여행, 여행 기간 밖 날짜)이다. 셋을 구별하지 않는다.
// DB 조회가 실패하면 { ok: false }. Google 호출 실패는 구간마다 failed 로 담긴다.
export async function loadDayRoute(
  userId: string,
  tripId: string,
  date: string,
): Promise<DayRouteResult | null> {
  if (!isValidIsoDate(date)) return null;

  let placeRows: Awaited<ReturnType<typeof listPlaces>>;
  let baseRows: Awaited<ReturnType<typeof listTripBases>>;
  let itemRows: Awaited<ReturnType<typeof listScheduleItems>>;
  let tripRange: TripRange;
  try {
    const trip = await getTrip(userId, tripId);
    if (!trip || date < trip.startDate || date > trip.endDate) return null;
    tripRange = { startDate: trip.startDate, endDate: trip.endDate };
    [placeRows, baseRows, itemRows] = await Promise.all([
      listPlaces(userId, trip.id),
      listTripBases(userId, trip.id),
      listScheduleItems(userId, trip.id),
    ]);
  } catch {
    return { ok: false };
  }

  const placesById = new Map<string, RoutePlace>(
    placeRows.map((p) => [
      p.id,
      {
        id: p.id,
        label: p.label,
        googlePlaceId: p.googlePlaceId,
        lat: p.lat,
        lng: p.lng,
      },
    ]),
  );
  // 그날 장소가 이어진 일정만, #12 정렬(listScheduleItems 순서) 그대로. 지도 칸·일정 칸과 같은 함수다.
  const route = routesByDate(
    [date],
    itemRows,
    baseRows,
    tripRange,
    placesById,
    distanceMeters,
  ).get(date);
  if (!route) return { ok: false };

  // 구간에 나오는 장소마다 나라·시간대를 한 번씩, 병렬로 묻는다(이 요청 안에서만 쓴다).
  const askedLegs = route.legs.slice(0, MAX_LEGS_PER_DAY);
  const regionPlaces = new Map<string, RoutePlace>();
  for (const leg of askedLegs) {
    regionPlaces.set(leg.from.id, leg.from);
    regionPlaces.set(leg.to.id, leg.to);
  }
  const regions = new Map<string, Region | null>(
    await Promise.all(
      [...regionPlaces.values()].map(
        async (p) => [p.id, await fetchPlaceRegion(p.googlePlaceId)] as const,
      ),
    ),
  );

  // 구간은 병렬로 묻고, 이 요청 안에서 같은 구간(장소 쌍·시각)이 또 나오면 한 번만 묻는다.
  const now = new Date();
  const pending = new Map<string, Promise<LegResult>>();
  const results = await Promise.all(
    route.legs.map((leg, i) => {
      if (i >= MAX_LEGS_PER_DAY) return STRAIGHT_ONLY;
      const key = `${leg.from.id}>${leg.to.id}|${leg.timing.kind}|${leg.timing.time}`;
      let result = pending.get(key);
      if (!result) {
        result = resolveLeg(date, leg, regions, now);
        pending.set(key, result);
      }
      return result;
    }),
  );

  const legs: LegView[] = route.legs.map((leg, i) => ({
    fromId: leg.from.id,
    toId: leg.to.id,
    fromItemId: leg.fromItemId,
    toItemId: leg.toItemId,
    result: results[i],
    text: legText(results[i]),
    straightMeters: leg.straightMeters,
    distanceText: formatDistance(leg.straightMeters),
    directionsUrl: directionsUrl(leg.from, leg.to),
  }));

  const seen = new Set<Notice>();
  for (const result of results) {
    if (
      (result.kind === "walk" || result.kind === "straight") &&
      result.notice
    ) {
      seen.add(result.notice);
    }
  }
  const notices = NOTICE_ORDER.filter((n) => seen.has(n));

  return { ok: true, legs, notices };
}
