import "server-only";
import { and, asc, eq, exists, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { places, tripBases, trips } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { accessibleTrips, editableTrips } from "./trips";

// 기준 숙소 쿼리. 여행 접근은 trips.ts 의 accessibleTrips 조건 하나로만 판단한다(schedule-items.ts 와 같은 방식).
// neon-http 는 대화형 트랜잭션이 없으므로, 소유권 확인은 읽기·쓰기 문 자체의 where 조건으로 한다.

function validIds(...ids: string[]): boolean {
  return ids.every(isUuid);
}

export async function listTripBases(
  userId: string,
  tripId: string,
): Promise<{ startDate: string; placeId: string | null }[]> {
  if (!validIds(tripId)) return [];
  return db
    .select({ startDate: tripBases.startDate, placeId: tripBases.placeId })
    .from(tripBases)
    .where(
      and(
        eq(tripBases.tripId, tripId),
        inArray(
          tripBases.tripId,
          db
            .select({ id: trips.id })
            .from(trips)
            .where(accessibleTrips(userId)),
        ),
      ),
    )
    .orderBy(asc(tripBases.startDate));
}

// startDate 부터의 기준점을 placeId 로 둔다(null = 이날부터 기준점 없음). 날짜의 여행 기간 검사는 액션이 한다.
// 한 문으로: 접근할 수 있는 여행이고, placeId 가 있으면 그 장소가 같은 여행의 것일 때만 넣거나 바꾼다.
// 내 여행 id 에 남의 여행 장소 id 를 섞어 보내면 select 가 0행이라 아무것도 바뀌지 않는다.
// 넣거나 바뀐 행이 없으면(없거나 남의 것이거나 id 형식이 틀림) false.
// 기록 여행(#103)에서는 기준점이 사본이라 정하지 않는다(editableTrips, 0행 → false).
export async function setTripBase(
  userId: string,
  tripId: string,
  startDate: string,
  placeId: string | null,
): Promise<boolean> {
  if (!validIds(tripId)) return false;
  if (placeId !== null && !validIds(placeId)) return false;
  const conditions: SQL[] = [eq(trips.id, tripId), editableTrips(userId)];
  if (placeId !== null) {
    conditions.push(
      exists(
        db
          .select({ id: places.id })
          .from(places)
          .where(and(eq(places.id, placeId), eq(places.tripId, tripId))),
      ),
    );
  }
  // insert … select 는 모든 열을 테이블 정의 순서대로 고른다. 매개변수는 열 타입으로 바꿔 둔다.
  const rows = await db
    .insert(tripBases)
    .select(
      db
        .select({
          tripId: trips.id,
          startDate: sql<string>`${startDate}::date`.as("start_date"),
          placeId: sql<string | null>`${placeId}::uuid`.as("place_id"),
          createdAt: sql<Date>`now()`.as("created_at"),
          updatedAt: sql<Date>`now()`.as("updated_at"),
        })
        .from(trips)
        .where(and(...conditions)),
    )
    .onConflictDoUpdate({
      target: [tripBases.tripId, tripBases.startDate],
      set: { placeId: sql`excluded.place_id`, updatedAt: sql`now()` },
    })
    .returning({ tripId: tripBases.tripId });
  return rows.length > 0;
}
