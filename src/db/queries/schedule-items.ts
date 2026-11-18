import "server-only";
import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { places, type ScheduleItem, scheduleItems, trips } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import type { ScheduleInput } from "@/lib/schedule-input";
import { accessibleTrips } from "./trips";

// 일정 쿼리. 여행 접근은 trips.ts 의 accessibleTrips 조건 하나로만 판단한다(공유 #15 가 그것만 바꾸도록).
// neon-http 는 대화형 트랜잭션이 없으므로, 소유권 확인은 읽기·쓰기 문 자체의 where 조건으로 한다.

// 이 사용자가 접근할 수 있는 여행 tripId 의 일정.
function inAccessibleTrip(userId: string, tripId: string): SQL {
  return and(
    eq(scheduleItems.tripId, tripId),
    inArray(
      scheduleItems.tripId,
      db.select({ id: trips.id }).from(trips).where(accessibleTrips(userId)),
    ),
  ) as SQL;
}

// 일정 id 와 여행 id 를 함께 묶는다. 내 여행 id 와 남의 일정 id 를 섞어 보내도 걸리지 않는다.
function itemCondition(userId: string, tripId: string, itemId: string): SQL {
  return and(
    eq(scheduleItems.id, itemId),
    inAccessibleTrip(userId, tripId),
  ) as SQL;
}

function validIds(...ids: string[]): boolean {
  return ids.every(isUuid);
}

// 한 화면 요청 안에서 지도 칸과 일정 칸이 같은 결과를 나눠 쓰도록 cache 로 감싼다(요청마다 새로 묻는다).
export const listScheduleItems = cache(
  async (userId: string, tripId: string): Promise<ScheduleItem[]> => {
    if (!validIds(tripId)) return [];
    return db
      .select()
      .from(scheduleItems)
      .where(inAccessibleTrip(userId, tripId))
      .orderBy(
        asc(scheduleItems.date),
        asc(scheduleItems.time), // Postgres 오름차순은 NULL 이 맨 뒤
        asc(scheduleItems.createdAt),
        asc(scheduleItems.id),
      );
  },
);

// 없거나 남의 것이거나 id 형식이 틀리면 null.
export async function getScheduleItem(
  userId: string,
  tripId: string,
  itemId: string,
): Promise<ScheduleItem | null> {
  if (!validIds(tripId, itemId)) return null;
  const [item] = await db
    .select()
    .from(scheduleItems)
    .where(itemCondition(userId, tripId, itemId))
    .limit(1);
  return item ?? null;
}

// 이 사용자가 접근할 수 있는 여행 tripId 의 장소 placeId. 일정에 장소를 이을 때 같은 문 안에서 쓴다.
// 장소 id 와 여행 id 를 함께 묶으므로 남의 여행 장소나 다른 여행의 내 장소는 걸리지 않는다.
function placeInAccessibleTrip(
  userId: string,
  tripId: string,
  placeId: string,
): SQL {
  return and(
    eq(places.id, placeId),
    eq(places.tripId, tripId),
    inArray(
      places.tripId,
      db.select({ id: trips.id }).from(trips).where(accessibleTrips(userId)),
    ),
  ) as SQL;
}

// 접근할 수 있는 여행일 때만 넣는다. 넣지 못했으면 null.
// 장소를 이으면(placeId) 한 문(insert … select from places)으로 넣고, place 글자는 그 장소의 이름표로 저장한다.
// 장소가 같은 여행·접근 가능한 것이 아니면 0행이라 null.
// 확인과 넣기 사이에 여행이 지워지면 FK 오류가 나고, 액션이 저장 실패로 처리한다.
export async function createScheduleItem(
  userId: string,
  tripId: string,
  input: ScheduleInput,
): Promise<string | null> {
  if (!validIds(tripId)) return null;
  if (input.placeId !== null) {
    if (!validIds(input.placeId)) return null;
    // insert … select 는 모든 열을 테이블 정의 순서대로 고른다. 기본값(id·done·시각)도 여기서 채우고,
    // 매개변수는 열 타입으로 바꿔 둔다.
    const [row] = await db
      .insert(scheduleItems)
      .select(
        db
          .select({
            id: sql<string>`gen_random_uuid()`.as("id"),
            tripId: places.tripId,
            date: sql<string>`${input.date}::date`.as("date"),
            time: sql<string | null>`${input.time}::time`.as("time"),
            title: sql<string>`${input.title}::text`.as("title"),
            place: places.label,
            placeId: places.id,
            memo: sql<string | null>`${input.memo}::text`.as("memo"),
            done: sql<boolean>`false`.as("done"),
            createdAt: sql<Date>`now()`.as("created_at"),
            updatedAt: sql<Date>`now()`.as("updated_at"),
          })
          .from(places)
          .where(placeInAccessibleTrip(userId, tripId, input.placeId)),
      )
      .returning({ id: scheduleItems.id });
    return row?.id ?? null;
  }
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .limit(1);
  if (!trip) return null;
  const [row] = await db
    .insert(scheduleItems)
    .values({ ...input, placeId: null, tripId: trip.id })
    .returning({ id: scheduleItems.id });
  return row.id;
}

// 바뀐 행이 없으면(없거나 남의 것이거나 id 형식이 틀림, 이을 장소가 조건에 안 맞음) false.
// 장소를 이으면 place 글자는 그 장소의 이름표로, 잇지 않으면 place_id 를 비우고 적은 글자를 그대로 둔다.
export async function updateScheduleItem(
  userId: string,
  tripId: string,
  itemId: string,
  input: ScheduleInput,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  if (input.placeId !== null) {
    if (!validIds(input.placeId)) return false;
    // 한 문(update … from places): 일정과 장소가 모두 같은 접근 가능한 여행일 때만 바뀐다.
    const rows = await db
      .update(scheduleItems)
      .set({ ...input, place: places.label, placeId: places.id })
      .from(places)
      .where(
        and(
          itemCondition(userId, tripId, itemId),
          placeInAccessibleTrip(userId, tripId, input.placeId),
        ),
      )
      .returning({ id: scheduleItems.id });
    return rows.length > 0;
  }
  const rows = await db
    .update(scheduleItems)
    .set({ ...input, placeId: null })
    .where(itemCondition(userId, tripId, itemId))
    .returning({ id: scheduleItems.id });
  return rows.length > 0;
}

export async function setScheduleItemDone(
  userId: string,
  tripId: string,
  itemId: string,
  done: boolean,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  const rows = await db
    .update(scheduleItems)
    .set({ done })
    .where(itemCondition(userId, tripId, itemId))
    .returning({ id: scheduleItems.id });
  return rows.length > 0;
}

export async function deleteScheduleItem(
  userId: string,
  tripId: string,
  itemId: string,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  const rows = await db
    .delete(scheduleItems)
    .where(itemCondition(userId, tripId, itemId))
    .returning({ id: scheduleItems.id });
  return rows.length > 0;
}
