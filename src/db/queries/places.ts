import "server-only";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { type Place, places, scheduleItems, trips } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import type { PlaceCategory, PlaceInput } from "@/lib/place-input";
import { accessibleTrips } from "./trips";

// 장소 쿼리. 여행 접근은 trips.ts 의 accessibleTrips 조건 하나로만 판단한다(schedule-items.ts 와 같은 방식).
// neon-http 는 대화형 트랜잭션이 없으므로, 소유권 확인은 읽기·쓰기 문 자체의 where 조건으로 한다.

type Coords = { lat: number; lng: number };

const DUPLICATE_CONSTRAINT = "places_trip_google_place_idx";

// 이 사용자가 접근할 수 있는 여행 tripId 의 id 목록(서브쿼리).
function accessibleTripIds(userId: string) {
  return db.select({ id: trips.id }).from(trips).where(accessibleTrips(userId));
}

// 이 사용자가 접근할 수 있는 여행 tripId 의 장소.
function placeInAccessibleTrip(userId: string, tripId: string): SQL {
  return and(
    eq(places.tripId, tripId),
    inArray(places.tripId, accessibleTripIds(userId)),
  ) as SQL;
}

// 장소 id 와 여행 id 를 함께 묶는다. 내 여행 id 와 남의 장소 id 를 섞어 보내도 걸리지 않는다.
function placeCondition(userId: string, tripId: string, placeId: string): SQL {
  return and(
    eq(places.id, placeId),
    placeInAccessibleTrip(userId, tripId),
  ) as SQL;
}

function validIds(...ids: string[]): boolean {
  return ids.every(isUuid);
}

// Postgres 유니크 위반(23505) 중 "같은 여행에 같은 Google 장소" 제약만 중복으로 본다.
// neon-http 오류가 그대로 오거나 Drizzle 이 감싸 cause 에 담아 온다.
function isDuplicatePlaceError(err: unknown): boolean {
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  return candidates.some((e) => {
    if (typeof e !== "object" || e === null) return false;
    const { code, constraint } = e as { code?: unknown; constraint?: unknown };
    return code === "23505" && constraint === DUPLICATE_CONSTRAINT;
  });
}

export async function listPlaces(
  userId: string,
  tripId: string,
): Promise<Place[]> {
  if (!validIds(tripId)) return [];
  return db
    .select()
    .from(places)
    .where(placeInAccessibleTrip(userId, tripId))
    .orderBy(asc(places.createdAt), asc(places.id));
}

// 접근할 수 있는 여행일 때만 넣는다. 좌표는 서버가 Google 에서 받은 값만 받는다.
// 확인과 넣기 사이에 여행이 지워지면 FK 오류가 나고, 액션이 저장 실패로 처리한다.
export async function createPlace(
  userId: string,
  tripId: string,
  input: PlaceInput,
  coords: Coords,
): Promise<
  { ok: true; id: string } | { ok: false; reason: "not_found" | "duplicate" }
> {
  if (!validIds(tripId)) return { ok: false, reason: "not_found" };
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .limit(1);
  if (!trip) return { ok: false, reason: "not_found" };
  try {
    const [row] = await db
      .insert(places)
      .values({
        tripId: trip.id,
        googlePlaceId: input.googlePlaceId,
        label: input.label,
        category: input.category,
        memo: input.memo,
        lat: coords.lat,
        lng: coords.lng,
        coordsFetchedAt: new Date(),
      })
      .returning({ id: places.id });
    return { ok: true, id: row.id };
  } catch (err) {
    if (isDuplicatePlaceError(err)) return { ok: false, reason: "duplicate" };
    throw err;
  }
}

// 바뀐 행이 없으면(없거나 남의 것이거나 id 형식이 틀림) false.
// 이름표가 바뀌면 같은 여행에서 이 장소에 이어진 일정의 place 글자도 새 이름표로 바꾼다(두 번째 문도 접근 조건).
export async function updatePlace(
  userId: string,
  tripId: string,
  placeId: string,
  input: { label: string; category: PlaceCategory; memo: string | null },
): Promise<boolean> {
  if (!validIds(tripId, placeId)) return false;
  const rows = await db
    .update(places)
    .set({ label: input.label, category: input.category, memo: input.memo })
    .where(placeCondition(userId, tripId, placeId))
    .returning({ id: places.id });
  if (rows.length === 0) return false;
  await db
    .update(scheduleItems)
    .set({ place: input.label })
    .where(
      and(
        eq(scheduleItems.placeId, placeId),
        eq(scheduleItems.tripId, tripId),
        inArray(scheduleItems.tripId, accessibleTripIds(userId)),
      ),
    );
  return true;
}

// 이어진 일정은 place_id 가 null 이 되고(place 글자는 남음), 기준점 행은 함께 지워진다(FK).
export async function deletePlace(
  userId: string,
  tripId: string,
  placeId: string,
): Promise<boolean> {
  if (!validIds(tripId, placeId)) return false;
  const rows = await db
    .delete(places)
    .where(placeCondition(userId, tripId, placeId))
    .returning({ id: places.id });
  return rows.length > 0;
}

// 서버 내부(30일 좌표 갱신)용. 호출자가 이미 listPlaces(userId, tripId) 로 받은 행에만 쓴다.
// coords 가 null 이면(갱신 실패) 좌표를 비운다. 받은 시각은 어느 쪽이든 fetchedAt 으로 둔다.
export async function setPlaceCoords(
  placeId: string,
  tripId: string,
  coords: Coords | null,
  fetchedAt: Date,
): Promise<void> {
  if (!validIds(placeId, tripId)) return;
  await db
    .update(places)
    .set({
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      coordsFetchedAt: fetchedAt,
    })
    .where(and(eq(places.id, placeId), eq(places.tripId, tripId)));
}
