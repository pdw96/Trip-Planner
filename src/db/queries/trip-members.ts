import "server-only";
import { and, asc, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { scheduleItems, tripMembers, trips, user } from "@/db/schema";
import { isUuid } from "@/lib/ids";
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

// 이 여행 일정의 "누구"(for_user_id)마다 이름(#90). 나간 사람 이름표("이름 (나감)")에 쓴다.
// 지금 사람은 listTripPeople 로도 알 수 있지만, 일정에 남은 값이면 나갔든 아니든 모두 돌려준다. 접근할 수 없으면 빈 Map.
export async function listScheduleForUserNames(
  userId: string,
  tripId: string,
): Promise<Map<string, string>> {
  if (!isUuid(tripId)) return new Map();
  const rows = await db
    .selectDistinct({ id: user.id, name: user.name })
    .from(scheduleItems)
    .innerJoin(user, eq(user.id, scheduleItems.forUserId))
    .where(
      and(
        eq(scheduleItems.tripId, tripId),
        inArray(
          scheduleItems.tripId,
          db
            .select({ id: trips.id })
            .from(trips)
            .where(accessibleTrips(userId)),
        ),
      ),
    );
  return new Map(rows.map((r) => [r.id, r.name]));
}

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
export async function setInviteTokenHash(
  userId: string,
  tripId: string,
  hash: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .update(trips)
    .set({ inviteTokenHash: hash, inviteTokenCreatedAt: sql`now()` })
    .where(and(eq(trips.id, tripId), ownedTrips(userId)))
    .returning({ id: trips.id });
  return rows.length > 0;
}

export async function clearInviteToken(
  userId: string,
  tripId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await db
    .update(trips)
    .set({ inviteTokenHash: null, inviteTokenCreatedAt: null })
    .where(and(eq(trips.id, tripId), ownedTrips(userId)))
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
    .where(eq(trips.inviteTokenHash, hash))
    .limit(1);
  return row ?? null;
}

// 링크 확인과 넣기를 한 문으로 한다. 주인·상한 초과·틀린 해시·이미 멤버면 null.
// 동시에 참여하면 상한을 조금 넘을 수 있다(설계 §5.1).
export async function joinTrip(
  userId: string,
  hash: string,
): Promise<string | null> {
  const result = await db.execute<{ trip_id: string }>(sql`
    INSERT INTO ${tripMembers} (trip_id, user_id)
    SELECT t.id, ${userId}::text FROM ${trips} t
    WHERE t.invite_token_hash = ${hash}::text
      AND t.user_id <> ${userId}::text
      AND (SELECT count(*) FROM ${tripMembers} m WHERE m.trip_id = t.id) < ${MAX_MEMBERS_PER_TRIP}
    ON CONFLICT DO NOTHING
    RETURNING trip_id
  `);
  return result.rows[0]?.trip_id ?? null;
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

// #89 §5.4: 멤버 행을 지운 문 안에서 그 사람의 그 여행 내 돈 행(budget_items.owner_user_id)과 내 예산
// (trip_personal_budgets)도 지운다. 멤버 행을 실제로 지웠을 때만(removed 가 비면 아무것도 지우지 않음).
// 그 사람이 적은 모임 행(owner_user_id IS NULL)은 남는다. 돌려주는 값은 멤버 행을 지웠는지뿐.
// 이 문과 동시에 그 사람이 내 돈 금액을 쓰면(쓰기 문의 접근 확인이 아직 멤버 행을 본 경우) 그 행이 남을 수 있다.
// 남아도 본인만 볼 수 있는 행이고 본인은 이제 접근할 수 없으므로 아무에게도 보이지 않는다(다시 참여하면 다시 보임).
function removeMemberAndPrivateRows(memberCondition: SQL) {
  return sql`
    WITH removed AS (
      DELETE FROM trip_members
      WHERE ${memberCondition}
      RETURNING trip_id, user_id
    ),
    gone_items AS (
      DELETE FROM budget_items
      WHERE owner_user_id IS NOT NULL
        AND (trip_id, owner_user_id) IN (SELECT trip_id, user_id FROM removed)
      RETURNING id
    ),
    gone_budgets AS (
      DELETE FROM trip_personal_budgets
      WHERE (trip_id, user_id) IN (SELECT trip_id, user_id FROM removed)
      RETURNING trip_id
    )
    SELECT trip_id FROM removed`;
}

// 주인만 내보낸다.
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
  const result = await db.execute<{ trip_id: string }>(
    removeMemberAndPrivateRows(sql`trip_members.trip_id = ${tripId}::uuid
        AND trip_members.user_id = ${memberUserId}::text
        AND trip_members.trip_id IN (${ownedTripIds})`),
  );
  return result.rows.length > 0;
}

// 본인 행만 지운다. 주인은 멤버 행이 없으므로 false.
export async function leaveTrip(
  userId: string,
  tripId: string,
): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const result = await db.execute<{ trip_id: string }>(
    removeMemberAndPrivateRows(sql`trip_members.trip_id = ${tripId}::uuid
        AND trip_members.user_id = ${userId}::text`),
  );
  return result.rows.length > 0;
}
