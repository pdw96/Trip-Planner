import "server-only";
import { and, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { type Trip, trips } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import type { TripInput } from "@/lib/trip-input";

// 이 사용자가 접근할 수 있는 여행의 조건. 여행·일정의 모든 쿼리가 이것을 거친다.
// 공유(#15)는 이 조건만 "내 여행이거나 초대받은 여행"으로 바꾼다.
export function accessibleTrips(userId: string): SQL {
  return eq(trips.userId, userId);
}

export async function listTrips(userId: string): Promise<Trip[]> {
  return db.select().from(trips).where(accessibleTrips(userId));
}

// 없거나 남의 것이거나 id 형식이 틀리면 모두 null. 일정·장소·예산도 여행 접근 확인에 이것을 쓴다.
export async function getTrip(
  userId: string,
  tripId: string,
): Promise<Trip | null> {
  if (!isUuid(tripId)) return null;
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .limit(1);
  return trip ?? null;
}

export async function createTrip(
  userId: string,
  input: TripInput,
): Promise<string> {
  const [row] = await db
    .insert(trips)
    .values({ ...input, userId })
    .returning({ id: trips.id });
  return row.id;
}

// 바뀐 행이 없으면(없거나 남의 것이거나 id 형식이 틀림) false.
export async function updateTrip(
  userId: string,
  tripId: string,
  input: TripInput,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .update(trips)
    .set(input)
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .returning({ id: trips.id });
  return rows.length > 0;
}

export async function deleteTrip(
  userId: string,
  tripId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .delete(trips)
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .returning({ id: trips.id });
  return rows.length > 0;
}
