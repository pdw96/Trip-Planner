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
import { detachMembersCtes } from "./trip-records";

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
  // 함께하는 사람(멤버)이 한 명이라도 있는 여행인지. 탭 화면(#122)이 함께 탭과 내 여행을 가른다.
  hasMembers: boolean;
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
      hasMembers: sql<boolean>`EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = ${trips.id})`,
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
// 같은 문에서 그때의 멤버마다 떼어 낸 기록을 만든다(#103 §5.3, trip-records.ts 의 detachMembersCtes). 주인 몫은 떼지 않는다.
// 멤버 떼기는 여행 삭제(gone)와 같은 자격(주인)을 조건으로 건다. 기록 여행에는 멤버가 없어 지우기만 일어난다.
//
// 한 문으로 묶어도 옮긴 행이 여행 삭제의 cascade 로 지워지지 않는 까닭(deleteScheduleItem 주석과 같은 이치):
// - 옮기기(moved_mine·moved_money·moved_budget)는 행의 trip_id 를 R 로 바꾸고, gone 은 trips 행 하나만 지운다(같은 행을 두 번 쓰지 않음).
// - ON DELETE CASCADE·SET NULL 은 RI 트리거(AFTER ROW)로, 모든 CTE 가 끝난 뒤 문 끝에서 돈다. 그 트리거의
//   `DELETE FROM … WHERE trip_id = $1` 은 새 스냅숏으로 돌아 이미 trip_id 가 R 로 바뀐 행을 보지 않는다. 사본이 가리키는
//   장소도 R 의 사본이라 T 장소 삭제의 SET NULL·cascade 에 걸리지 않는다.
// - 기록은 detached_from_trip_id = NULL 로 넣는다(sourceDeleted, 원래 여행이 없어지므로 다시 붙을 곳이 없다). T 를 넣으면
//   그 FK 검사가 T 삭제의 SET NULL 보다 먼저 돌 때(CTE 실행 순서에 달림) FK 오류가 나므로 처음부터 넣지 않는다.
//   그 밖에 새로 넣거나 FK 칸을 바꾼 행은 모두 R 이나 R 의 사본을 가리킨다(kept_on_mine 은 T 행의 일정 연결을 NULL 로 바꿀
//   뿐). T 를 가리키는 새 FK 값이 없으므로 FK 검사가 T 삭제와 얽히지 않고, 이 문은 CTE 실행 순서에 기대지 않는다
//   (PGlite 하네스 "task5: 순서 무관 여행 지우기": 바깥 SELECT 가 records 를 먼저 읽어도 같은 결과).
export async function deleteTrip(
  userId: string,
  tripId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const result = await db.execute<{ id: string }>(sql`
    WITH ${detachMembersCtes(
      tripId,
      sql`trip_members.trip_id IN (SELECT id FROM trips WHERE ${ownedTrips(userId)})`,
      { sourceDeleted: true },
    )},
    gone AS (
      DELETE FROM trips WHERE id = ${tripId}::uuid AND ${ownedTrips(userId)}
      RETURNING id
    )
    SELECT id FROM gone`);
  return result.rows.length > 0;
}
