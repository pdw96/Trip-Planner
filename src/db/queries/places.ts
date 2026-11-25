import "server-only";
import { and, asc, count, eq, inArray, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { type Place, places, scheduleItems, trips } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import type { PlaceCategory, PlaceInput } from "@/lib/place-input";
import { accessibleTrips, editableTrips } from "./trips";

// 장소 쿼리. 여행 접근은 trips.ts 의 accessibleTrips 조건 하나로만 판단한다(schedule-items.ts 와 같은 방식).
// neon-http 는 대화형 트랜잭션이 없으므로, 소유권 확인은 읽기·쓰기 문 자체의 where 조건으로 한다.

type Coords = { lat: number; lng: number };

const DUPLICATE_CONSTRAINT = "places_trip_google_place_idx";

// 한 여행에 넣을 수 있는 장소 수. 장소마다 Google 호출(넣기·30일 갱신·하루 동선의 Place Details)이 생기므로 상한을 둔다.
export const MAX_PLACES_PER_TRIP = 100;

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

// 쓰기용 짝: 기록 여행(#103)을 뺀 여행만. 기록의 장소는 사본이라 넣기·고치기·지우기를 막는다.
// 읽기(listPlaces 등)와 좌표 갱신(setPlaceCoords, 시스템 동작)은 위의 accessible 쪽을 그대로 쓴다.
function editableTripIds(userId: string) {
  return db.select({ id: trips.id }).from(trips).where(editableTrips(userId));
}

function editablePlaceCondition(
  userId: string,
  tripId: string,
  placeId: string,
): SQL {
  return and(
    eq(places.id, placeId),
    eq(places.tripId, tripId),
    inArray(places.tripId, editableTripIds(userId)),
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

// 한 화면 요청 안에서 지도 칸과 일정 칸이 같은 결과를 나눠 쓰도록 cache 로 감싼다(요청마다 새로 묻는다).
export const listPlaces = cache(
  async (userId: string, tripId: string): Promise<Place[]> => {
    if (!validIds(tripId)) return [];
    return db
      .select()
      .from(places)
      .where(placeInAccessibleTrip(userId, tripId))
      .orderBy(asc(places.createdAt), asc(places.id));
  },
);

// 이 사용자가 접근할 수 있는 여행 tripId 의 장소 수. 넣기 전에 상한을 확인하는 데 쓴다(Google 을 부르기 전에).
export async function countPlaces(
  userId: string,
  tripId: string,
): Promise<number> {
  if (!validIds(tripId)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(places)
    .where(placeInAccessibleTrip(userId, tripId));
  return row?.n ?? 0;
}

// 이 사용자가 접근할 수 있는 여행 tripId 에 같은 Google 장소가 있으면 그 장소 id. 없거나 id 형식이 틀리면 null.
// 일정 양식에서 고른 Google 장소가 이미 '가 볼 곳'에 있는지 볼 때 쓴다(#35, Google 을 부르기 전에).
export async function findPlaceIdByGoogleId(
  userId: string,
  tripId: string,
  googlePlaceId: string,
): Promise<string | null> {
  if (!validIds(tripId)) return null;
  const [row] = await db
    .select({ id: places.id })
    .from(places)
    .where(
      and(
        eq(places.googlePlaceId, googlePlaceId),
        placeInAccessibleTrip(userId, tripId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

// 접근할 수 있는 여행일 때만 넣는다. 좌표는 서버가 Google 에서 받은 값만 받는다.
// 확인과 넣기 사이에 여행이 지워지면 FK 오류가 나고, 액션이 저장 실패로 처리한다.
// 기록 여행(#103)에서는 장소를 넣지 않는다(editableTrips, "not_found").
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
    .where(and(eq(trips.id, tripId), editableTrips(userId)))
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
// 이름표가 바뀌면 같은 여행에서 이 장소에 이어진 일정의 place 글자도 새 이름표로 바꾼다.
// 둘을 한 문(데이터를 바꾸는 CTE)으로 묶어, 장소 행이 바뀐 경우에만 일정 글자도 바뀐다. 두 쪽 모두 접근 조건을 건다.
// 기록 여행(#103)에서는 장소가 사본이라 고치지 않는다(두 쪽 모두 editable 조건, 0행 → false).
export async function updatePlace(
  userId: string,
  tripId: string,
  placeId: string,
  input: { label: string; category: PlaceCategory; memo: string | null },
): Promise<boolean> {
  if (!validIds(tripId, placeId)) return false;
  const updatedPlace = db.$with("updated_place").as(
    db
      .update(places)
      .set({ label: input.label, category: input.category, memo: input.memo })
      .where(editablePlaceCondition(userId, tripId, placeId))
      .returning({ id: places.id }),
  );
  const updatedItems = db.$with("updated_items").as(
    db
      .update(scheduleItems)
      .set({ place: input.label })
      .where(
        and(
          inArray(
            scheduleItems.placeId,
            db.select({ id: updatedPlace.id }).from(updatedPlace),
          ),
          eq(scheduleItems.tripId, tripId),
          inArray(scheduleItems.tripId, editableTripIds(userId)),
        ),
      )
      .returning({ id: scheduleItems.id }),
  );
  const rows = await db
    .with(updatedPlace, updatedItems)
    .select({ id: updatedPlace.id })
    .from(updatedPlace);
  return rows.length > 0;
}

// 이어진 일정은 place_id 가 null 이 되고(place 글자는 남음), 기준점 행은 함께 지워진다(FK).
// 기록 여행(#103)에서는 장소가 사본이라 지우지 않는다(editablePlaceCondition, 0행 → false).
export async function deletePlace(
  userId: string,
  tripId: string,
  placeId: string,
): Promise<boolean> {
  if (!validIds(tripId, placeId)) return false;
  const rows = await db
    .delete(places)
    .where(editablePlaceCondition(userId, tripId, placeId))
    .returning({ id: places.id });
  return rows.length > 0;
}

// 30일 좌표 갱신용. 다른 쓰기와 같이 장소 id·여행 id·접근 가능한 여행을 한 조건으로 묶는다.
// coords 가 null 이면(갱신 실패) 좌표를 비운다. 받은 시각은 fetchedAt 으로 둔다(호출하는 쪽이 경우에 따라 정한다).
export async function setPlaceCoords(
  userId: string,
  tripId: string,
  placeId: string,
  coords: Coords | null,
  fetchedAt: Date,
): Promise<void> {
  if (!validIds(tripId, placeId)) return;
  await db
    .update(places)
    .set({
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      coordsFetchedAt: fetchedAt,
    })
    .where(placeCondition(userId, tripId, placeId));
}
