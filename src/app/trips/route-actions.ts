"use server";

import { redirect } from "next/navigation";
import { listPlaces } from "@/db/queries/places";
import { listScheduleItems } from "@/db/queries/schedule-items";
import { listTripBases } from "@/db/queries/trip-bases";
import { getTrip } from "@/db/queries/trips";
import {
  baseForDate,
  buildDayRoute,
  type DayLeg,
  type DayStop,
  type RoutePlace,
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
import { getCurrentUser } from "@/lib/session";
import { isValidIsoDate } from "@/lib/trip-input";

// tripId·date 는 인자로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위), 날짜 검사가 막는다.
// 인자는 tripId·date 뿐이다(§5.7): 구간은 서버가 이 사용자의 여행 장소로만 만들고,
// 클라이언트가 좌표나 장소 id 쌍을 보내 임의 구간을 묻게 하지 않는다(서버 키로 남의 좌표 조회 막기).
// 구간 결과·나라·시간대는 저장하지 않는다(§3.2, §5.3): DB 에도, 요청을 넘어서는 메모리에도 두지 않는다.

export type LegView = {
  fromId: string;
  toId: string;
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

export async function loadDayRouteAction(
  tripId: string,
  date: string,
): Promise<DayRouteResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (typeof date !== "string" || !isValidIsoDate(date)) return { ok: false };

  let placeRows: Awaited<ReturnType<typeof listPlaces>>;
  let baseRows: Awaited<ReturnType<typeof listTripBases>>;
  let itemRows: Awaited<ReturnType<typeof listScheduleItems>>;
  try {
    const trip = await getTrip(user.id, tripId);
    if (!trip || date < trip.startDate || date > trip.endDate) {
      return { ok: false };
    }
    [placeRows, baseRows, itemRows] = await Promise.all([
      listPlaces(user.id, trip.id),
      listTripBases(user.id, trip.id),
      listScheduleItems(user.id, trip.id),
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
  // 그날 장소가 이어진 일정만, #12 정렬(listScheduleItems 순서) 그대로. DB 의 time 은 "09:30:00" 으로 온다.
  const stops: DayStop[] = [];
  for (const item of itemRows) {
    if (item.date === date && item.placeId !== null) {
      stops.push({
        placeId: item.placeId,
        time: item.time === null ? null : item.time.slice(0, 5),
      });
    }
  }
  const route = buildDayRoute(
    stops,
    baseForDate(baseRows, date),
    placesById,
    distanceMeters,
  );

  // 구간에 나오는 장소마다 나라·시간대를 한 번씩, 병렬로 묻는다(이 요청 안에서만 쓴다).
  const regionPlaces = new Map<string, RoutePlace>();
  for (const leg of route.legs) {
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
    route.legs.map((leg) => {
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
