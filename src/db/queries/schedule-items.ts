import "server-only";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { type ScheduleItem, scheduleItems, trips } from "@/db/schema";
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

export async function listScheduleItems(
  userId: string,
  tripId: string,
): Promise<ScheduleItem[]> {
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
}

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

// 접근할 수 있는 여행일 때만 넣는다. 넣지 못했으면 null.
// 확인과 넣기 사이에 여행이 지워지면 FK 오류가 나고, 액션이 저장 실패로 처리한다.
export async function createScheduleItem(
  userId: string,
  tripId: string,
  input: ScheduleInput,
): Promise<string | null> {
  if (!validIds(tripId)) return null;
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .limit(1);
  if (!trip) return null;
  // 장소 연결(placeId)은 이후 작업에서 컬럼과 함께 붙인다.
  const { placeId: _placeId, ...fields } = input;
  const [row] = await db
    .insert(scheduleItems)
    .values({ ...fields, tripId: trip.id })
    .returning({ id: scheduleItems.id });
  return row.id;
}

// 바뀐 행이 없으면(없거나 남의 것이거나 id 형식이 틀림) false.
export async function updateScheduleItem(
  userId: string,
  tripId: string,
  itemId: string,
  input: ScheduleInput,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  // 장소 연결(placeId)은 이후 작업에서 컬럼과 함께 붙인다.
  const { placeId: _placeId, ...fields } = input;
  const rows = await db
    .update(scheduleItems)
    .set(fields)
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
