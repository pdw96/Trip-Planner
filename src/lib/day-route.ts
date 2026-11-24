// 그날 밤 숙소(기준점, #91)와 하루 동선. N일차 동선 = 전날 밤 숙소(시작점) → 그날 일정들 → 그날 밤 숙소(끝점).
// 여행은 N박 N+1일이라 첫날은 시작점이, 마지막 날은 끝점이 없다. 서버에서 쓰고 node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 거리는 호출하는 쪽이 넘긴다(geo.ts 의 distanceMeters).
// routesByDate: 지도 칸·일정 칸·loadDayRoute 가 같은 규칙으로 날짜별 뼈대를 만든다(#37).
// daySignature: 구간 결과 저장소의 키. 동선 모양·시각·일정 id 가 바뀌면 달라진다(#37).
// routeItemsFor: 사람별 일정(#90). 동선은 모두 것 + 보는 사람 것만으로 만든다. forUserId 가 없거나 null 이면 모두.

export type RoutePlace = {
  id: string;
  label: string;
  googlePlaceId: string;
  lat: number | null;
  lng: number | null;
};

export type LatLng = { lat: number; lng: number };

export type BaseRow = { startDate: string; placeId: string | null };

export type TripRange = { startDate: string; endDate: string };

// 그날 동선의 시작점·끝점으로 저장된 장소 id(좌표 여부와 무관).
export type DayBases = { start: string | null; end: string | null };

export type DayStop = { itemId: string; placeId: string; time: string | null };

// 일정 행에서 동선에 쓰는 값. time 은 DB 값("09:30:00") 또는 "09:30".
export type ScheduleRow = {
  id: string;
  date: string;
  placeId: string | null;
  time: string | null;
  // 이 일정의 주인. 없거나 null 이면 모두(#90).
  forUserId?: string | null;
};

export type LegTiming =
  | { kind: "arrival"; time: string }
  | { kind: "departure"; time: string };

export type DayLeg = {
  from: RoutePlace;
  to: RoutePlace;
  fromIsBase: boolean;
  toIsBase: boolean;
  // 이 구간의 출발·도착 일정(#37). 기준점과 합쳐진 점은 일정 id, 일정 없이 기준점만인 점은 null.
  fromItemId: string | null;
  toItemId: string | null;
  timing: LegTiming;
  straightMeters: number;
};

export type DayRoute = {
  // 동선에 들어간 시작점(전날 밤 숙소)·끝점(그날 밤 숙소). 좌표가 있을 때만.
  start: RoutePlace | null;
  end: RoutePlace | null;
  stops: { place: RoutePlace; number: number }[];
  legs: DayLeg[];
};

export const DEFAULT_DEPART = "10:00";

const COORDS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// startDate 가 date 이하인 행 중 가장 늦은 행의 placeId. 없으면 null.
export function baseForDate(rows: BaseRow[], date: string): string | null {
  let best: BaseRow | null = null;
  for (const row of rows) {
    if (
      row.startDate <= date &&
      (best === null || row.startDate > best.startDate)
    ) {
      best = row;
    }
  }
  return best ? best.placeId : null;
}

// "2026-12-01" → "2026-11-30". 날짜 문자열만 다룬다(UTC 로 계산해 시간대 영향 없음).
export function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// N일차 시작점 = 전날 밤 숙소(첫날은 없음), 끝점 = 그날 밤 숙소(마지막 날은 밤이 없어 없음).
export function basesForDay(
  rows: BaseRow[],
  date: string,
  trip: TripRange,
): DayBases {
  return {
    start: date > trip.startDate ? baseForDate(rows, previousDate(date)) : null,
    end: date < trip.endDate ? baseForDate(rows, date) : null,
  };
}

type Point = {
  place: RoutePlace;
  coords: LatLng;
  isBase: boolean;
  // 이 점에 도착하는 구간에 쓰는 시각(합친 stop 중 처음 시각)과 떠나는 구간에 쓰는 시각(마지막 시각).
  arriveTime: string | null;
  departTime: string | null;
  // 시각과 같은 규칙: 도착 구간은 합친 stop 중 처음 일정, 출발 구간은 마지막 일정.
  arriveItemId: string | null;
  departItemId: string | null;
};

type Located = { place: RoutePlace; coords: LatLng };

function locate(
  id: string | null,
  places: Map<string, RoutePlace>,
): Located | null {
  if (id === null) return null;
  const place = places.get(id);
  if (!place || place.lat === null || place.lng === null) return null;
  return { place, coords: { lat: place.lat, lng: place.lng } };
}

export function buildDayRoute(
  stops: DayStop[],
  bases: DayBases,
  places: Map<string, RoutePlace>,
  distance: (a: LatLng, b: LatLng) => number,
): DayRoute {
  const start = locate(bases.start, places);
  const end = locate(bases.end, places);
  const sequence: Point[] = [];
  if (start)
    sequence.push({
      ...start,
      isBase: true,
      arriveTime: null,
      departTime: null,
      arriveItemId: null,
      departItemId: null,
    });
  for (const stop of stops) {
    const found = locate(stop.placeId, places);
    if (found) {
      sequence.push({
        ...found,
        isBase: false,
        arriveTime: stop.time,
        departTime: stop.time,
        arriveItemId: stop.itemId,
        departItemId: stop.itemId,
      });
    }
  }
  if (end)
    sequence.push({
      ...end,
      isBase: true,
      arriveTime: null,
      departTime: null,
      arriveItemId: null,
      departItemId: null,
    });

  // 연달아 같은 장소는 한 점으로 합친다. 도착 시각은 처음 시각, 출발 시각은 마지막 시각을 남긴다(기준점은 시각이 없다).
  const points: Point[] = [];
  for (const point of sequence) {
    const last = points[points.length - 1];
    if (last && last.place.id === point.place.id) {
      last.isBase = last.isBase || point.isBase;
      last.arriveTime = last.arriveTime ?? point.arriveTime;
      last.departTime = point.departTime ?? last.departTime;
      last.arriveItemId = last.arriveItemId ?? point.arriveItemId;
      last.departItemId = point.departItemId ?? last.departItemId;
    } else {
      points.push({ ...point });
    }
  }

  const numbered: DayRoute["stops"] = [];
  for (const point of points) {
    if (!point.isBase) {
      numbered.push({ place: point.place, number: numbered.length + 1 });
    }
  }

  const legs: DayLeg[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i];
    const to = points[i + 1];
    let timing: LegTiming;
    if (to.arriveTime) {
      timing = { kind: "arrival", time: to.arriveTime };
    } else if (from.departTime) {
      timing = { kind: "departure", time: from.departTime };
    } else {
      timing = { kind: "departure", time: DEFAULT_DEPART };
    }
    legs.push({
      from: from.place,
      to: to.place,
      fromIsBase: from.isBase,
      toIsBase: to.isBase,
      fromItemId: from.departItemId,
      toItemId: to.arriveItemId,
      timing,
      straightMeters: distance(from.coords, to.coords),
    });
  }

  return {
    start: start ? start.place : null,
    end: end ? end.place : null,
    stops: numbered,
    legs,
  };
}

// 모두 것(forUserId 없음/null) + viewerId 것만, 순서 유지(#90).
// T 를 object 로 둔 것은 forUserId 열이 생기기 전 행(속성이 하나도 겹치지 않음)도 받기 위해서다.
export function routeItemsFor<T extends object>(
  items: T[],
  viewerId: string,
): T[] {
  return items.filter((item) => {
    const owner = (item as { forUserId?: string | null }).forUserId ?? null;
    return owner === null || owner === viewerId;
  });
}

// 날짜마다 그날 장소가 이어진 일정(items 순서 그대로, listScheduleItems 정렬)으로 뼈대를 만든다.
export function routesByDate(
  dates: string[],
  items: ScheduleRow[],
  bases: BaseRow[],
  trip: TripRange,
  places: Map<string, RoutePlace>,
  distance: (a: LatLng, b: LatLng) => number,
  viewerId: string,
): Map<string, DayRoute> {
  const stopsByDate = new Map<string, DayStop[]>(dates.map((d) => [d, []]));
  for (const item of routeItemsFor(items, viewerId)) {
    const stops = stopsByDate.get(item.date);
    if (!stops || item.placeId === null) continue;
    stops.push({
      itemId: item.id,
      placeId: item.placeId,
      time: item.time === null ? null : item.time.slice(0, 5),
    });
  }
  const routes = new Map<string, DayRoute>();
  for (const [date, stops] of stopsByDate) {
    routes.set(
      date,
      buildDayRoute(stops, basesForDay(bases, date, trip), places, distance),
    );
  }
  return routes;
}

export function daySignature(route: DayRoute): string {
  const legs = route.legs.map(
    (l) =>
      `${l.from.id}>${l.to.id}@${l.timing.kind} ${l.timing.time}#${l.fromItemId ?? "-"}>${l.toItemId ?? "-"}`,
  );
  return `${route.start?.id ?? "-"}>${route.end?.id ?? "-"}|${legs.join(",")}`;
}

// 좌표는 30일(30×24h)을 넘기면 다시 불러온다.
export function needsCoordsRefresh(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() > COORDS_MAX_AGE_MS;
}
