import "server-only";
import {
  and,
  eq,
  exists,
  getTableColumns,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  type Trip,
  tripMembers,
  tripRecordCompanions,
  trips,
  user,
} from "@/db/schema";
import { isUuid } from "@/lib/ids";
import type { TripInput } from "@/lib/trip-input";

// 이 사용자가 보고 고칠 수 있는 여행의 조건: 주인이거나 함께하는 사람(#15). 여행·일정·장소·기준점·예산의 모든 쿼리가 이것을 거친다.
// trips 를 별칭 없이 FROM 에 둔 쿼리 안에서만 쓴다(하위 쿼리가 바깥 trips.id 를 가리킨다).
export function accessibleTrips(userId: string): SQL {
  return or(
    eq(trips.userId, userId),
    exists(
      db
        .select({ one: sql`1` })
        .from(tripMembers)
        .where(
          and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)),
        ),
    ),
  ) as SQL;
}

// 보고 고칠 수 있는 여행: accessibleTrips 에서 떼어 낸 기록(detached_at)을 뺀다. 기록은 읽기 전용이다(#103).
// accessibleTrips 와 같은 제약: trips 를 별칭 없이 FROM 에 둔 쿼리에서만 쓴다.
export function editableTrips(userId: string): SQL {
  return and(accessibleTrips(userId), isNull(trips.detachedAt)) as SQL;
}

// 이 id 가 떼어 낸 기록인지(하위 쿼리라 어느 쿼리에서나 쓴다). 일정·장소 등 쓰기 쿼리가 기록을 거르는 데 쓴다.
export function isRecordTripSql(tripId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM trips r WHERE r.id = ${tripId}::uuid AND r.detached_at IS NOT NULL)`;
}

// 주인만 하는 일(여행 삭제, 초대 링크, 내보내기)의 조건.
export function ownedTrips(userId: string): SQL {
  return eq(trips.userId, userId);
}

// 여행 객체에는 초대 링크 해시를 싣지 않는다(초대 쿼리만 다룬다, #15).
const {
  inviteTokenHash: _inviteTokenHash,
  inviteTokenCreatedAt: _inviteTokenCreatedAt,
  ...tripColumns
} = getTableColumns(trips);

export type TripRow = Omit<Trip, "inviteTokenHash" | "inviteTokenCreatedAt">;

function isOwnerColumn(userId: string) {
  return sql<boolean>`${trips.userId} = ${userId}`;
}

export type TripListItem = TripRow & {
  isOwner: boolean;
  ownerName: string;
  // 기록이면 그 여행의 주인(was_owner)이었던 사람의 이름, 아니면 null.
  recordOwnerName: string | null;
};

// 내 여행과 공유받은 여행. 공유받은 여행 카드에 주인 이름을 보인다(이메일은 고르지 않는다).
export async function listTrips(userId: string): Promise<TripListItem[]> {
  const recordOwner = alias(user, "record_owner");
  return db
    .select({
      ...tripColumns,
      isOwner: isOwnerColumn(userId),
      ownerName: user.name,
      recordOwnerName: recordOwner.name,
    })
    .from(trips)
    .innerJoin(user, eq(user.id, trips.userId))
    .leftJoin(
      tripRecordCompanions,
      and(
        eq(tripRecordCompanions.tripId, trips.id),
        eq(tripRecordCompanions.wasOwner, true),
      ),
    )
    .leftJoin(recordOwner, eq(recordOwner.id, tripRecordCompanions.userId))
    .where(accessibleTrips(userId));
}

export type TripWithAccess = TripRow & { isOwner: boolean };

// 없거나 접근할 수 없거나 id 형식이 틀리면 모두 null. 일정·장소·예산도 여행 접근 확인에 이것을 쓴다.
// isOwner 는 화면이 버튼을 고르는 데만 쓴다. 권한 판단은 각 쿼리의 조건이 한다.
export async function getTrip(
  userId: string,
  tripId: string,
): Promise<TripWithAccess | null> {
  if (!isUuid(tripId)) return null;
  const [trip] = await db
    .select({ ...tripColumns, isOwner: isOwnerColumn(userId) })
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
// 기록 여행(#103)에서는 여행 정보가 사본이라 고치지 않는다(editableTrips, 0행 → false).
export async function updateTrip(
  userId: string,
  tripId: string,
  input: TripInput,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .update(trips)
    .set(input)
    .where(and(eq(trips.id, tripId), editableTrips(userId)))
    .returning({ id: trips.id });
  return rows.length > 0;
}

// 주인만 지운다. 함께하는 사람이 보내면 바뀐 행이 없어 false(찾을 수 없음).
export async function deleteTrip(
  userId: string,
  tripId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .delete(trips)
    .where(and(eq(trips.id, tripId), ownedTrips(userId)))
    .returning({ id: trips.id });
  return rows.length > 0;
}
