import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { cache } from "react";
import { db } from "@/db";
import { tripMembers, tripRecordCompanions, trips, user } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import type { CompanionRow } from "@/lib/trip-people";
import { detachMembersCtes, reattachRecordCtes } from "./trip-records";
import { accessibleTrips, ownedTrips } from "./trips";

// 함께하는 사람·초대 링크 쿼리(#15). 보기는 accessibleTrips, 링크·내보내기는 ownedTrips 를 같은 SQL 문 안에 넣는다.
// 이메일은 고르지 않는다(이름·사진만).

export const MAX_MEMBERS_PER_TRIP = 20;

export type TripPerson = {
  userId: string;
  name: string;
  image: string | null;
  isOwner: boolean;
};

// 접근할 수 없으면 null. 주인 먼저, 그다음 참여한 순서.
// 한 화면 요청 안에서 함께하는 사람 칸과 일정 칸(#90 "누구")이 같은 결과를 나눠 쓰도록 cache 로 감싼다.
export const listTripPeople = cache(async function listTripPeople(
  userId: string,
  tripId: string,
): Promise<TripPerson[] | null> {
  if (!isUuid(tripId)) return null;
  const [trip] = await db
    .select({
      ownerId: trips.userId,
      ownerName: user.name,
      ownerImage: user.image,
    })
    .from(trips)
    .innerJoin(user, eq(user.id, trips.userId))
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .limit(1);
  if (!trip) return null;
  const members = await db
    .select({ userId: user.id, name: user.name, image: user.image })
    .from(tripMembers)
    .innerJoin(user, eq(user.id, tripMembers.userId))
    .where(
      and(
        eq(tripMembers.tripId, tripId),
        inArray(
          tripMembers.tripId,
          db
            .select({ id: trips.id })
            .from(trips)
            .where(accessibleTrips(userId)),
        ),
      ),
    )
    .orderBy(asc(tripMembers.joinedAt), asc(tripMembers.userId));
  return [
    {
      userId: trip.ownerId,
      name: trip.ownerName,
      image: trip.ownerImage ?? null,
      isOwner: true,
    },
    ...members.map((m) => ({ ...m, image: m.image ?? null, isOwner: false })),
  ];
});

// 주인이고 링크가 켜져 있을 때만 만든 시각.
export async function getInviteCreatedAt(
  userId: string,
  tripId: string,
): Promise<Date | null> {
  if (!isUuid(tripId)) return null;
  const [row] = await db
    .select({ createdAt: trips.inviteTokenCreatedAt })
    .from(trips)
    .where(
      and(
        eq(trips.id, tripId),
        ownedTrips(userId),
        isNotNull(trips.inviteTokenHash),
      ),
    )
    .limit(1);
  return row?.createdAt ?? null;
}

// 새 링크로 바꾼다(옛 링크는 죽는다). 주인이 아니면 false.
// 기록 여행(#103)에서는 초대 링크를 만들지 않는다(detached_at IS NULL, 0행 → false).
export async function setInviteTokenHash(
  userId: string,
  tripId: string,
  hash: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .update(trips)
    .set({ inviteTokenHash: hash, inviteTokenCreatedAt: sql`now()` })
    .where(
      and(eq(trips.id, tripId), ownedTrips(userId), isNull(trips.detachedAt)),
    )
    .returning({ id: trips.id });
  return rows.length > 0;
}

// 기록 여행(#103)에서는 초대 링크 끄기도 쓰기로 보고 막는다(설계 §5.5, 0행 → false). 기록의 링크는 joinTrip 이 거른다.
export async function clearInviteToken(
  userId: string,
  tripId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .update(trips)
    .set({ inviteTokenHash: null, inviteTokenCreatedAt: null })
    .where(
      and(eq(trips.id, tripId), ownedTrips(userId), isNull(trips.detachedAt)),
    )
    .returning({ id: trips.id });
  return rows.length > 0;
}

export type InvitePreview = {
  tripId: string;
  title: string;
  startDate: string;
  endDate: string;
  ownerName: string;
  ownerId: string;
};

// 초대 화면에 보일 것만. 링크를 가진 사람이면 누구나 보는 정보다.
// 기록 여행(#103)은 찾지 않는다(옛 배포가 기록에 남긴 링크로 미리 보기가 뜨지 않게, joinTrip 과 같은 조건).
// CLAUDE.md '첫 인자 userId' 규칙의 예외: 아직 멤버가 아닌 사람이 비밀값(해시)으로 찾는 쿼리라 userId 로 범위를 좁힐 수 없다.
export async function findInvite(hash: string): Promise<InvitePreview | null> {
  const [row] = await db
    .select({
      tripId: trips.id,
      title: trips.title,
      startDate: trips.startDate,
      endDate: trips.endDate,
      ownerName: user.name,
      ownerId: trips.userId,
    })
    .from(trips)
    .innerJoin(user, eq(user.id, trips.userId))
    .where(and(eq(trips.inviteTokenHash, hash), isNull(trips.detachedAt)))
    .limit(1);
  return row ?? null;
}

export type JoinResult = {
  tripId: string;
  // 붙인 기록 R 의 id(같은 문에서 지웠다). 붙지 않았으면 null.
  reattachedRecordId: string | null;
  // R 에서 T 로 옮긴 나만 일정(날짜 "YYYY-MM-DD", 시각 "HH:MM:SS"). 부르는 쪽이 그날 순서를 맞춘다.
  movedItems: { id: string; date: string; time: string | null }[];
};

// 링크 확인과 넣기를 한 문으로 한다. 주인·상한 초과·틀린 해시·이미 멤버면 null.
// 동시에 참여하면 상한을 조금 넘을 수 있다(설계 §5.1).
// 기록 여행(#103)에는 참여하지 않는다(t.detached_at IS NULL, 링크가 남아 있어도 null).
// 같은 문에서 이 사람이 이 여행에서 떼어 낸 기록 하나를 붙인다(#103 §5.4, trip-records.ts 의 reattachRecordCtes).
// 행은 옮긴 일정마다 하나(없으면 일정 칸이 빈 한 행), 참여하지 못했으면 0행이다.
export async function joinTrip(
  userId: string,
  hash: string,
): Promise<JoinResult | null> {
  const result = await db.execute<{
    trip_id: string;
    reattached_record_id: string | null;
    item_id: string | null;
    item_date: string | null;
    item_time: string | null;
  }>(sql`
    WITH joined AS (
      INSERT INTO trip_members (trip_id, user_id)
      SELECT t.id, ${userId}::text FROM trips t
      WHERE t.invite_token_hash = ${hash}::text
        AND t.detached_at IS NULL
        AND t.user_id <> ${userId}::text
        AND (SELECT count(*) FROM trip_members m WHERE m.trip_id = t.id) < ${MAX_MEMBERS_PER_TRIP}
      ON CONFLICT DO NOTHING
      RETURNING trip_id, user_id
    ),
    ${reattachRecordCtes(userId)}
    SELECT j.trip_id, (SELECT id FROM gone_record) AS reattached_record_id,
      bi.id AS item_id, bi.date::text AS item_date, bi.time::text AS item_time
    FROM joined j
    LEFT JOIN back_items bi ON true
    LEFT JOIN item_src src ON src.id = bi.id
    ORDER BY bi.date, src.old_position NULLS LAST, bi.time NULLS LAST, bi.id`);
  const first = result.rows[0];
  if (!first) return null;
  return {
    tripId: first.trip_id,
    reattachedRecordId: first.reattached_record_id ?? null,
    movedItems: result.rows.flatMap((row) =>
      row.item_id !== null && row.item_date !== null
        ? [{ id: row.item_id, date: row.item_date, time: row.item_time }]
        : [],
    ),
  };
}

// [참여] 실패 사유를 가리는 데만 쓴다. 초대 해시로 찾은 여행에만 부른다(findInvite 와 같은 까닭으로 userId 를 받지 않는다).
export async function countTripMembers(tripId: string): Promise<number> {
  if (!isUuid(tripId)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  return row?.n ?? 0;
}

// 주인만 내보낸다. 내보낸 사람의 몫은 그 사람의 떼어 낸 기록으로 남는다(#103, trip-records.ts 의 detachMembersCtes).
// 돌려주는 값은 멤버 행을 지웠는지뿐. 자격(주인, 그 사람이 지금 멤버)이 맞지 않으면 아무것도 바뀌지 않고 false.
export async function removeMember(
  ownerId: string,
  tripId: string,
  memberUserId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const ownedTripIds = db
    .select({ id: trips.id })
    .from(trips)
    .where(ownedTrips(ownerId))
    .getSQL();
  const result = await db.execute<{ trip_id: string }>(sql`
    WITH ${detachMembersCtes(
      tripId,
      sql`trip_members.user_id = ${memberUserId}::text
        AND trip_members.trip_id IN (${ownedTripIds})`,
      { sourceDeleted: false },
    )}
    SELECT trip_id FROM removed`);
  return result.rows.length > 0;
}

// 본인 행만 지운다. 주인은 멤버 행이 없으므로 false. 나간 사람의 몫은 떼어 낸 기록으로 남는다(#103).
export async function leaveTrip(
  userId: string,
  tripId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const result = await db.execute<{ trip_id: string }>(sql`
    WITH ${detachMembersCtes(
      tripId,
      sql`trip_members.user_id = ${userId}::text`,
      { sourceDeleted: false },
    )}
    SELECT trip_id FROM removed`);
  return result.rows.length > 0;
}

// 접근할 수 있는 모든 여행의 "나를 뺀 함께한 사람"(#122 탭 화면). 세 출처를 한 문으로 모은다:
//   1) 기록 아닌 여행의 주인(내가 주인이 아닐 때), 2) 여행의 멤버, 3) 내 기록 여행의 동행(trip_record_companions).
// 여행 안 순서는 주인(기록이면 주인이었던 사람) → 참여 순 → 이름. 이메일은 고르지 않는다.
// user id 는 서버의 집계(countCompanions)와 같은 사람 가르기에만 쓰고 화면으로 넘기지 않는다(#103).
// 각 가지는 trips 를 별칭 없이 FROM 에 두고 접근 조건을 같은 문에 건다. 집합 연산의 정렬은 결과 칸 이름으로 한다
// (테이블 이름이 붙은 칸은 UNION 결과에 없다).
export async function listTripCompanions(
  userId: string,
): Promise<CompanionRow[]> {
  const noJoinedAt = sql<string | null>`NULL::timestamptz`.as("joined_at");
  const owners = db
    .select({
      tripId: sql<string>`${trips.id}`.as("trip_id"),
      userId: sql<string>`${user.id}`.as("user_id"),
      name: sql<string>`${user.name}`.as("name"),
      ord: sql<number>`0`.as("ord"),
      joinedAt: noJoinedAt,
    })
    .from(trips)
    .innerJoin(user, eq(user.id, trips.userId))
    .where(
      and(
        isNull(trips.detachedAt),
        ne(trips.userId, userId),
        accessibleTrips(userId),
      ),
    );
  const members = db
    .select({
      tripId: sql<string>`${trips.id}`.as("trip_id"),
      userId: sql<string>`${user.id}`.as("user_id"),
      name: sql<string>`${user.name}`.as("name"),
      ord: sql<number>`1`.as("ord"),
      joinedAt: sql<string | null>`${tripMembers.joinedAt}`.as("joined_at"),
    })
    .from(trips)
    .innerJoin(tripMembers, eq(tripMembers.tripId, trips.id))
    .innerJoin(user, eq(user.id, tripMembers.userId))
    .where(and(ne(tripMembers.userId, userId), accessibleTrips(userId)));
  const recordCompanions = db
    .select({
      tripId: sql<string>`${trips.id}`.as("trip_id"),
      userId: sql<string>`${user.id}`.as("user_id"),
      name: sql<string>`${user.name}`.as("name"),
      ord: sql<number>`CASE WHEN ${tripRecordCompanions.wasOwner} THEN 0 ELSE 1 END`.as(
        "ord",
      ),
      joinedAt: noJoinedAt,
    })
    .from(trips)
    .innerJoin(tripRecordCompanions, eq(tripRecordCompanions.tripId, trips.id))
    .innerJoin(user, eq(user.id, tripRecordCompanions.userId))
    .where(and(ownedTrips(userId), isNotNull(trips.detachedAt)));
  const rows = await unionAll(owners, members, recordCompanions).orderBy(
    sql`trip_id, ord, joined_at NULLS FIRST, name, user_id`,
  );
  return rows.map(({ tripId, userId: personId, name }) => ({
    tripId,
    userId: personId,
    name,
  }));
}
