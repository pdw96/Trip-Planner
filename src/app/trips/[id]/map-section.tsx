import { listPlaces, setPlaceCoords } from "@/db/queries/places";
import { listScheduleItems } from "@/db/queries/schedule-items";
import { listTripBases } from "@/db/queries/trip-bases";
import type { TripRow as Trip } from "@/db/queries/trips";
import type { Place } from "@/db/schema";
import {
  baseForDate,
  basesForDay,
  daySignature,
  needsCoordsRefresh,
  type RoutePlace,
  routeItemsFor,
  routesByDate,
} from "@/lib/day-route";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { fetchPlaceCoords } from "@/lib/google-maps-server";
import { usesNaverMap } from "@/lib/leg-display";
import { tripDays } from "@/lib/schedule";
import { type PanelDay, type PanelPlace, toCategory } from "./map-types";
import { TripMapPanel } from "./trip-map-panel";

// 여행 자세히 보기의 지도·가 볼 곳. 장소·기준점·일정으로 날마다 동선의 뼈대를 미리 만들어 패널에 넘긴다.
// 구간 이동 정보(Google Routes)는 여기서 묻지 않는다. N일차 탭을 열 때 패널이 Route Handler(./day-route)로 묻는다(§5.3).
// 호출하는 쪽이 이미 getTrip 으로 이 사용자의 여행임을 확인했다. 쿼리들도 같은 접근 조건을 다시 건다.
// 좌표 30일 갱신(§3.2, §5.2) 때문에 Google 을 부를 수 있으므로, 페이지는 이 칸을 따로 <Suspense> 로 감싼다.
export async function MapSection({
  userId,
  trip,
}: {
  userId: string;
  trip: Trip;
}) {
  const [placeRows, baseRows, itemRows] = await Promise.all([
    listPlaces(userId, trip.id),
    listTripBases(userId, trip.id),
    listScheduleItems(userId, trip.id),
  ]);
  const placesNow = await refreshStaleCoords(userId, placeRows);

  const days = tripDays(trip.startDate, trip.endDate);
  const dayNumberOf = new Map(days.map((d) => [d.date, d.dayNumber]));

  // 장소별 "N일차 일정". 여행 기간 밖 일정은 셈하지 않는다.
  const scheduleDays = new Map<string, Set<number>>();
  for (const item of itemRows) {
    const dayNumber = dayNumberOf.get(item.date);
    if (item.placeId === null || dayNumber === undefined) continue;
    const set = scheduleDays.get(item.placeId) ?? new Set<number>();
    set.add(dayNumber);
    scheduleDays.set(item.placeId, set);
  }

  const places: PanelPlace[] = placesNow.map((p) => ({
    id: p.id,
    label: p.label,
    category: toCategory(p.category),
    memo: p.memo,
    googlePlaceId: p.googlePlaceId,
    lat: p.lat,
    lng: p.lng,
    scheduleDays: [...(scheduleDays.get(p.id) ?? [])].sort((a, b) => a - b),
  }));

  const routePlaces = new Map<string, RoutePlace>(
    placesNow.map((p) => [
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

  const tripRange = { startDate: trip.startDate, endDate: trip.endDate };
  // 동선 순서는 #12 정렬(listScheduleItems 순서) 그대로. day-route-loader·일정 칸과 같은 함수다.
  const routes = routesByDate(
    days.map((d) => d.date),
    itemRows,
    baseRows,
    tripRange,
    routePlaces,
    distanceMeters,
    userId,
  );
  const panelDays: PanelDay[] = days.map((day) => {
    // 내 동선에 드는 일정만(#90). [전체] 탭의 scheduleDays 는 모든 일정 그대로.
    const dayItems = routeItemsFor(itemRows, userId).filter(
      (item) => item.date === day.date && item.placeId !== null,
    );
    // 저장된 시작·끝 숙소(#91). 장소 목록에서 사라진 id 는 없음으로 본다.
    const bases = basesForDay(baseRows, day.date, tripRange);
    const known = (id: string | null) =>
      id !== null && routePlaces.has(id) ? id : null;
    const route = routes.get(day.date) ?? {
      start: null,
      end: null,
      stops: [],
      legs: [],
    };
    return {
      date: day.date,
      dayNumber: day.dayNumber,
      label: day.label,
      hasNight: day.date < trip.endDate,
      nightBaseId: known(bases.end),
      morningBaseId: known(bases.start),
      routeBaseIds: [
        ...new Set(
          [route.start?.id, route.end?.id].filter(
            (id): id is string => id !== undefined,
          ),
        ),
      ],
      signature: daySignature(route),
      stops: route.stops.map((s) => ({
        placeId: s.place.id,
        number: s.number,
      })),
      unlocatedCount: dayItems.filter((item) => {
        const place = routePlaces.get(item.placeId as string);
        return !place || place.lat === null || place.lng === null;
      }).length,
      legs: route.legs.map((leg) => ({
        fromId: leg.from.id,
        toId: leg.to.id,
        fromIsBase: leg.fromIsBase,
        toIsBase: leg.toIsBase,
        straightMeters: leg.straightMeters,
        distanceText: formatDistance(leg.straightMeters),
        timing: `${leg.timing.kind} ${leg.timing.time}`,
      })),
    };
  });

  // [전체] 보기의 기준점 후보: 여행에 쓰인 기준점들 + 숙소 종류 장소. 기본은 첫날 기준점(저장하지 않음, §5.5).
  const usedBaseIds = new Set(
    baseRows
      .map((row) => row.placeId)
      .filter((id): id is string => id !== null),
  );
  const overviewBaseIds = places
    .filter((p) => usedBaseIds.has(p.id) || p.category === "lodging")
    .map((p) => p.id);
  const firstDayBase = baseForDate(baseRows, trip.startDate);

  // 브라우저 키와 지도 ID 는 공개 값이다(웹사이트 제한). 서버 키(GOOGLE_MAPS_SERVER_KEY)는 넘기지 않는다.
  // 번호 핀(Advanced Marker)에 지도 ID 가 필요하므로 둘 다 있어야 지도를 띄운다.
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "";
  const maps = browserKey && mapId ? { browserKey, mapId } : null;

  return (
    <TripMapPanel
      tripId={trip.id}
      places={places}
      days={panelDays}
      overviewBaseIds={overviewBaseIds}
      defaultOverviewBaseId={
        firstDayBase !== null && overviewBaseIds.includes(firstDayBase)
          ? firstDayBase
          : null
      }
      maps={maps}
      naverMap={usesNaverMap(trip.countryCode)}
      record={trip.detachedAt !== null}
    />
  );
}

// coords_fetched_at 이 30일 지난 장소만 Google 에서 좌표를 다시 받아 덮어쓴다(병렬). 화면은 갱신된 값으로 그린다.
// 실패하면 어느 경우든 30일 지난 좌표는 지운다(§3.2). 받은 시각은 경우에 따라 다르게 둔다:
// - 장소가 Google 에서 사라짐(notFound): 지금 시각으로 둔다. 다시 물어도 같으므로 30일 동안 묻지 않는다.
// - 키 없음·한도·네트워크 같은 일시적 실패: 지금보다 29일 앞으로 둔다. 하루쯤 지나 다시 시도한다
//   (원래 시각을 두면 화면을 그릴 때마다 Google 을 다시 부른다).
const RETRY_AFTER_FAILURE_AGO_MS = 29 * 24 * 60 * 60 * 1000;

async function refreshStaleCoords(
  userId: string,
  rows: Place[],
): Promise<Place[]> {
  const now = new Date();
  return Promise.all(
    rows.map(async (place) => {
      if (!needsCoordsRefresh(place.coordsFetchedAt, now)) return place;
      const result = await fetchPlaceCoords(place.googlePlaceId);
      const coords = result.ok ? { lat: result.lat, lng: result.lng } : null;
      const fetchedAt =
        result.ok || result.notFound
          ? now
          : new Date(now.getTime() - RETRY_AFTER_FAILURE_AGO_MS);
      try {
        await setPlaceCoords(userId, place.tripId, place.id, coords, fetchedAt);
      } catch {
        // 저장에 실패해도 화면은 그린다. 오래된 좌표는 보이지 않고, 받은 시각이 그대로라 다음 방문에 다시 시도한다.
        console.error("[places] coords: 좌표 저장 실패");
        return { ...place, lat: null, lng: null };
      }
      return {
        ...place,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        coordsFetchedAt: fetchedAt,
      };
    }),
  );
}
