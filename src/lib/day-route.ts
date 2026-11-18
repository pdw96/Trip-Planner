// 날의 기준점(숙소)과 하루 동선. 서버에서 쓰고 node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 거리는 호출하는 쪽이 넘긴다(geo.ts 의 distanceMeters).

export type RoutePlace = {
  id: string;
  label: string;
  googlePlaceId: string;
  lat: number | null;
  lng: number | null;
};

export type LatLng = { lat: number; lng: number };

export type BaseRow = { startDate: string; placeId: string | null };

export type DayStop = { placeId: string; time: string | null };

export type LegTiming =
  | { kind: "arrival"; time: string }
  | { kind: "departure"; time: string };

export type DayLeg = {
  from: RoutePlace;
  to: RoutePlace;
  fromIsBase: boolean;
  toIsBase: boolean;
  timing: LegTiming;
  straightMeters: number;
};

export type DayRoute = {
  base: RoutePlace | null;
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

type Point = {
  place: RoutePlace;
  coords: LatLng;
  isBase: boolean;
  // 이 점에 도착하는 구간에 쓰는 시각(합친 stop 중 처음 시각)과 떠나는 구간에 쓰는 시각(마지막 시각).
  arriveTime: string | null;
  departTime: string | null;
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
  baseId: string | null,
  places: Map<string, RoutePlace>,
  distance: (a: LatLng, b: LatLng) => number,
): DayRoute {
  const base = locate(baseId, places);
  const sequence: Point[] = [];
  if (base)
    sequence.push({
      ...base,
      isBase: true,
      arriveTime: null,
      departTime: null,
    });
  for (const stop of stops) {
    const found = locate(stop.placeId, places);
    if (found) {
      sequence.push({
        ...found,
        isBase: false,
        arriveTime: stop.time,
        departTime: stop.time,
      });
    }
  }
  if (base)
    sequence.push({
      ...base,
      isBase: true,
      arriveTime: null,
      departTime: null,
    });

  // 연달아 같은 장소는 한 점으로 합친다. 도착 시각은 처음 시각, 출발 시각은 마지막 시각을 남긴다(기준점은 시각이 없다).
  const points: Point[] = [];
  for (const point of sequence) {
    const last = points[points.length - 1];
    if (last && last.place.id === point.place.id) {
      last.isBase = last.isBase || point.isBase;
      last.arriveTime = last.arriveTime ?? point.arriveTime;
      last.departTime = point.departTime ?? last.departTime;
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
      timing,
      straightMeters: distance(from.coords, to.coords),
    });
  }

  return { base: base ? base.place : null, stops: numbered, legs };
}

// 좌표는 30일(30×24h)을 넘기면 다시 불러온다.
export function needsCoordsRefresh(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() > COORDS_MAX_AGE_MS;
}
