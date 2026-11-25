import "server-only";
import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import {
  places,
  type ScheduleItem,
  scheduleItems,
  tripMembers,
  trips,
  user,
} from "@/db/schema";
import { EXTRA_TITLE_MAX } from "@/lib/budget-input";
import { isUuid } from "@/lib/ids";
import type { GooglePlacePick, ScheduleInput } from "@/lib/schedule-input";
import type { OrderItem } from "@/lib/schedule-order";
import { accessibleTrips, editableTrips, isRecordTripSql } from "./trips";

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

// 쓰기용 짝(#103): 고치기·지우기·끝냄 대상 일정. 기록 여행(#103)에서는 내 나만 일정(for_user_id = 나)만 쓴다.
// 모두 일정 사본과 남의 일정은 0행. tripId 는 validIds 를 거친 값이다(isRecordTripSql 의 전제).
function writableItemCondition(
  userId: string,
  tripId: string,
  itemId: string,
): SQL {
  return and(
    itemCondition(userId, tripId, itemId),
    sql`(NOT ${isRecordTripSql(tripId)} OR ${scheduleItems.forUserId} = ${userId}::text)`,
  ) as SQL;
}

function validIds(...ids: string[]): boolean {
  return ids.every(isUuid);
}

// "누구"(for_user_id, #90)로 쓸 수 있는 값인지. 쓰는 문의 where 에 넣어 사람 확인과 쓰기를 한 문으로 한다
// (neon-http 는 트랜잭션이 없다). null(모두)이면 보통 여행에서는 참. 값이면 그 여행의 주인이거나 함께하는 사람이어야 하고,
// 고치기(itemId 있음)에서는 그 일정의 지금 값과 같아도 된다(나간 사람 값을 그대로 저장, 설계 §5.6).
// 기록 여행(#103)에서는 새 값이 언제나 쓰는 사람 본인이어야 한다(모두·남은 0행).
// 하위 질의의 표 이름은 바깥 문과 같아도 안쪽 표를 가리킨다.
function forUserAllowed(
  userId: string,
  tripId: string,
  forUserId: string | null,
  itemId: string | null,
): SQL {
  const notRecord = sql`NOT ${isRecordTripSql(tripId)}`;
  if (forUserId === null) return notRecord;
  const recordOk = sql`(${notRecord} OR ${forUserId}::text = ${userId}::text)`;
  const isOwner = sql`exists (select 1 from ${trips} where ${trips.id} = ${tripId}::uuid and ${trips.userId} = ${forUserId}::text)`;
  const isMember = sql`exists (select 1 from ${tripMembers} where ${tripMembers.tripId} = ${tripId}::uuid and ${tripMembers.userId} = ${forUserId}::text)`;
  if (itemId === null)
    return sql`(${recordOk} and (${isOwner} or ${isMember}))`;
  const keepsCurrent = sql`exists (select 1 from ${scheduleItems} where ${scheduleItems.id} = ${itemId}::uuid and ${scheduleItems.tripId} = ${tripId}::uuid and ${scheduleItems.forUserId} = ${forUserId}::text)`;
  return sql`(${recordOk} and (${isOwner} or ${isMember} or ${keepsCurrent}))`;
}

// 입력 중 일정 열에 쓰는 값만. Google 장소(google)는 Google 장소 경로의 쿼리가 따로 쓴다.
function columnsOf({ google: _google, ...columns }: ScheduleInput) {
  return columns;
}

// 일정 순서(#41). 그날 순서(position)가 있으면 그것, 없으면 시각 순(NULL 이 맨 뒤) → 만든 순서 → id.
// src/lib/schedule.ts 의 compareScheduleItems 와 같아야 한다.
const itemOrder = [
  asc(scheduleItems.date),
  sql`${scheduleItems.position} asc nulls last`,
  asc(scheduleItems.time), // Postgres 오름차순은 NULL 이 맨 뒤
  asc(scheduleItems.createdAt),
  asc(scheduleItems.id),
];

function validDate(date: string): boolean {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

// 한 화면 요청 안에서 지도 칸과 일정 칸이 같은 결과를 나눠 쓰도록 cache 로 감싼다(요청마다 새로 묻는다).
export const listScheduleItems = cache(
  async (userId: string, tripId: string): Promise<ScheduleItem[]> => {
    if (!validIds(tripId)) return [];
    return db
      .select()
      .from(scheduleItems)
      .where(inAccessibleTrip(userId, tripId))
      .orderBy(...itemOrder);
  },
);

// 그날 일정의 지금 순서(id·시각). 순서 저장 검증과 넣기·고치기 뒤 자리 계산에 쓴다.
export async function listDayOrder(
  userId: string,
  tripId: string,
  date: string,
): Promise<OrderItem[]> {
  if (!validIds(tripId) || !validDate(date)) return [];
  return db
    .select({ id: scheduleItems.id, time: scheduleItems.time })
    .from(scheduleItems)
    .where(and(inAccessibleTrip(userId, tripId), eq(scheduleItems.date, date)))
    .orderBy(...itemOrder);
}

// 그날 순서를 0, 1, 2, … 로 한 문에 다시 쓴다. 목록의 모든 일정이 이 사용자가 접근할 수 있는 여행 tripId 의
// 그날 일정일 때만 true(바뀐 행 수가 목록 길이와 같음). 순서는 일정 내용 변경이 아니므로 updated_at 은 두고,
// 그래서 $onUpdate 가 붙는 query builder 대신 SQL 로 쓴다.
export async function writeDayOrder(
  userId: string,
  tripId: string,
  date: string,
  orderedIds: string[],
): Promise<boolean> {
  if (
    orderedIds.length === 0 ||
    !validIds(tripId, ...orderedIds) ||
    !validDate(date)
  ) {
    return false;
  }
  const values = sql.join(
    orderedIds.map((id, i) => sql`(${id}::uuid, ${i}::integer)`),
    sql`, `,
  );
  const result = await db.execute<{ id: string }>(sql`
    UPDATE ${scheduleItems} SET position = v.pos
    FROM (VALUES ${values}) AS v(id, pos)
    WHERE ${scheduleItems.id} = v.id
      AND ${scheduleItems.date} = ${date}::date
      AND ${inAccessibleTrip(userId, tripId)}
    RETURNING ${scheduleItems.id}`);
  return result.rows.length === orderedIds.length;
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

// insert … select 로 넣을 한 행. 모든 열을 테이블 정의 순서대로 고른다(drizzle 이 순서를 확인한다).
// 기본값(id·done·시각)도 여기서 채우고, 매개변수는 열 타입으로 바꿔 둔다. 여행·장소 쪽 세 열만 부르는 쪽이 정한다.
function insertedRow(
  input: ScheduleInput,
  from: {
    tripId: typeof places.tripId | typeof trips.id;
    place: typeof places.label | SQL.Aliased<string | null>;
    placeId: typeof places.id | SQL.Aliased<string | null>;
  },
) {
  return {
    id: sql<string>`gen_random_uuid()`.as("id"),
    tripId: from.tripId,
    date: sql<string>`${input.date}::date`.as("date"),
    time: sql<string | null>`${input.time}::time`.as("time"),
    title: sql<string | null>`${input.title}::text`.as("title"),
    place: from.place,
    placeId: from.placeId,
    memo: sql<string | null>`${input.memo}::text`.as("memo"),
    done: sql<boolean>`false`.as("done"),
    // 자리는 액션이 넣은 뒤 그날 순서를 다시 쓰며 정한다(#41).
    position: sql<number | null>`null::integer`.as("position"),
    forUserId: sql<string | null>`${input.forUserId}::text`.as("for_user_id"),
    // 사본 표시(#103)는 떼기만 쓴다. 새 일정은 비운다.
    copiedFromId: sql<string | null>`null::uuid`.as("copied_from_id"),
    createdAt: sql<Date>`now()`.as("created_at"),
    updatedAt: sql<Date>`now()`.as("updated_at"),
  };
}

// 접근할 수 있는 여행이고 "누구"가 쓸 수 있는 값일 때만 넣는다(forUserAllowed). 넣지 못했으면 null.
// 두 분기 모두 한 문(insert … select)이다. 장소를 이으면(placeId) places 에서 고르고 place 글자는 그 장소의 이름표로
// 저장한다(장소가 같은 여행·접근 가능한 것이 아니면 0행). 잇지 않으면 trips 에서 고르고 적은 글자를 그대로 둔다.
// 기록 여행(#103)에서는 내 나만 일정(forUserId = 나)만 넣는다(forUserAllowed). 기록에 이미 있는 장소는 고를 수 있다.
export async function createScheduleItem(
  userId: string,
  tripId: string,
  input: ScheduleInput,
): Promise<string | null> {
  if (!validIds(tripId)) return null;
  const allowed = forUserAllowed(userId, tripId, input.forUserId, null);
  if (input.placeId !== null) {
    if (!validIds(input.placeId)) return null;
    const [row] = await db
      .insert(scheduleItems)
      .select(
        db
          .select(
            insertedRow(input, {
              tripId: places.tripId,
              place: places.label,
              placeId: places.id,
            }),
          )
          .from(places)
          .where(
            and(placeInAccessibleTrip(userId, tripId, input.placeId), allowed),
          ),
      )
      .returning({ id: scheduleItems.id });
    return row?.id ?? null;
  }
  const [row] = await db
    .insert(scheduleItems)
    .select(
      db
        .select(
          insertedRow(input, {
            tripId: trips.id,
            place: sql<string | null>`${input.place}::text`.as("place"),
            placeId: sql<string | null>`null::uuid`.as("place_id"),
          }),
        )
        .from(trips)
        .where(and(eq(trips.id, tripId), accessibleTrips(userId), allowed)),
    )
    .returning({ id: scheduleItems.id });
  return row?.id ?? null;
}

// --- Google 장소 경로 (#35) ---
// 일정 양식에서 고른 Google 장소를 '가 볼 곳'에 넣고 그 장소로 일정을 잇는다. 둘을 데이터를 바꾸는 CTE 한 문으로 묶어
// 함께 되거나 함께 안 되게 한다(장소만 남지 않게). 같은 여행에 같은 Google 장소가 이미 있으면 그 장소로 잇는다.
// 한 문 안의 CTE 들은 같은 스냅숏을 보므로, 새로 넣은 행은 new_place 로, 이미 있던 행은 places 조회로 고른다.

type Coords = { lat: number; lng: number };
type GoogleScheduleInput = ScheduleInput & { google: GooglePlacePick };

// t(여행 하나 또는 없음)에서 장소를 넣거나 이미 있는 것을 골라 chosen(id, label) 한 행으로.
function chosenPlaceCtes(
  tripRows: SQL,
  google: GooglePlacePick,
  coords: Coords,
) {
  return sql`t AS (${tripRows}),
    new_place AS (
      INSERT INTO places (trip_id, google_place_id, label, category, memo, lat, lng, coords_fetched_at)
      SELECT t.id, ${google.googlePlaceId}::text, ${google.label}::text, ${google.category}::text, NULL,
        ${coords.lat}::double precision, ${coords.lng}::double precision, now()
      FROM t
      ON CONFLICT (trip_id, google_place_id) DO NOTHING
      RETURNING id, label
    ),
    chosen AS (
      SELECT id, label FROM new_place
      UNION ALL
      SELECT p.id, p.label FROM places p JOIN t ON p.trip_id = t.id
      WHERE p.google_place_id = ${google.googlePlaceId}::text
      LIMIT 1
    )`;
}

// 장소 넣기(같은 Google 장소가 이미 있으면 그것) + 일정 넣기. 접근할 수 없는 여행이거나 "누구"가 쓸 수 없는 값이면
// (forUserAllowed 를 t 에 넣음) 아무것도 넣지 않고 null.
// 좌표는 서버가 Google 에서 받은 값만 받는다.
// 기록 여행(#103)에서는 장소를 새로 만들지 않으므로 이 경로 전체를 막는다(editableTrips, 설계 §5.5).
export async function createScheduleItemWithNewPlace(
  userId: string,
  tripId: string,
  input: GoogleScheduleInput,
  coords: Coords,
): Promise<string | null> {
  if (!validIds(tripId)) return null;
  const tripRows = db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.id, tripId),
        editableTrips(userId),
        forUserAllowed(userId, tripId, input.forUserId, null),
      ),
    )
    .getSQL();
  const result = await db.execute<{ id: string }>(sql`
    WITH ${chosenPlaceCtes(tripRows, input.google, coords)}
    INSERT INTO schedule_items (trip_id, date, time, title, place, place_id, memo, for_user_id)
    SELECT ${tripId}::uuid, ${input.date}::date, ${input.time}::time, ${input.title}::text,
      chosen.label, chosen.id, ${input.memo}::text, ${input.forUserId}::text
    FROM chosen
    RETURNING id`);
  return result.rows[0]?.id ?? null;
}

// 장소 넣기(같은 것이 있으면 그것) + 일정 고치기. t 에 "이 일정이 이 여행에 있음"과 "누구" 조건(forUserAllowed)을
// 넣어, 둘 중 하나라도 안 맞으면 장소도 들어가지 않는다. 바뀐 행이 없으면 false.
// 기록 여행(#103)에서는 장소를 새로 만들지 않으므로 이 경로 전체를 막는다(editableTrips, 설계 §5.5).
export async function updateScheduleItemWithNewPlace(
  userId: string,
  tripId: string,
  itemId: string,
  input: GoogleScheduleInput,
  coords: Coords,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  const tripRows = db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.id, tripId),
        editableTrips(userId),
        sql`exists (select 1 from ${scheduleItems} where ${scheduleItems.id} = ${itemId}::uuid and ${scheduleItems.tripId} = ${trips.id})`,
        forUserAllowed(userId, tripId, input.forUserId, itemId),
      ),
    )
    .getSQL();
  const result = await db.execute<{ id: string }>(sql`
    WITH ${chosenPlaceCtes(tripRows, input.google, coords)}
    UPDATE schedule_items SET
      date = ${input.date}::date,
      time = ${input.time}::time,
      title = ${input.title}::text,
      memo = ${input.memo}::text,
      for_user_id = ${input.forUserId}::text,
      place = chosen.label,
      place_id = chosen.id,
      updated_at = now()
    FROM chosen
    WHERE schedule_items.id = ${itemId}::uuid AND schedule_items.trip_id = ${tripId}::uuid
    RETURNING schedule_items.id`);
  return result.rows.length > 0;
}

// 바뀐 행이 없으면(없거나 남의 것이거나 id 형식이 틀림, 이을 장소나 "누구"가 조건에 안 맞음) false.
// 장소를 이으면 place 글자는 그 장소의 이름표로, 잇지 않으면 place_id 를 비우고 적은 글자를 그대로 둔다.
// 기록 여행(#103)에서는 내 나만 일정만, 그대로 내 것으로 고친다(writableItemCondition + forUserAllowed).
export async function updateScheduleItem(
  userId: string,
  tripId: string,
  itemId: string,
  input: ScheduleInput,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  const allowed = forUserAllowed(userId, tripId, input.forUserId, itemId);
  if (input.placeId !== null) {
    if (!validIds(input.placeId)) return false;
    // 한 문(update … from places): 일정과 장소가 모두 같은 접근 가능한 여행일 때만 바뀐다.
    const rows = await db
      .update(scheduleItems)
      .set({ ...columnsOf(input), place: places.label, placeId: places.id })
      .from(places)
      .where(
        and(
          writableItemCondition(userId, tripId, itemId),
          placeInAccessibleTrip(userId, tripId, input.placeId),
          allowed,
        ),
      )
      .returning({ id: scheduleItems.id });
    return rows.length > 0;
  }
  const rows = await db
    .update(scheduleItems)
    .set({ ...columnsOf(input), placeId: null })
    .where(and(writableItemCondition(userId, tripId, itemId), allowed))
    .returning({ id: scheduleItems.id });
  return rows.length > 0;
}

// 기록 여행(#103)에서는 내 나만 일정만 끝냄을 표시한다(writableItemCondition, 모두 일정 사본은 0행 → false).
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
    .where(writableItemCondition(userId, tripId, itemId))
    .returning({ id: scheduleItems.id });
  return rows.length > 0;
}

// #89 §5.4: 일정을 지우면 그 일정의 내 돈 행(누구 것이든)은 일정 밖 항목으로 남기고(제목 = 일정 제목 → 장소 이름표 →
// 적은 장소 글자 → "지운 일정", 날짜 = 일정 날짜), 모임 행은 지금처럼 FK cascade 로 함께 지운다.
// 남의 내 돈 행을 옮기는 것은 지우는 사람이 볼 수 없어도 하는 시스템 동작이라, 돌려주는 값은 지운 일정 id(d)뿐이다.
// 옮기기는 s(접근 조건을 통과한 일정)가 있을 때만 일어난다. 접근할 수 없는 일정이면 s 가 비어 아무것도 바뀌지 않는다.
//
// 한 문으로 묶어도 옮긴 행이 cascade 로 지워지지 않는 까닭:
// - CTE 들은 같은 스냅숏을 보지만, d 는 schedule_items 만 지우고 budget_items 는 moved 만 건드린다(같은 행을 두 번 쓰지 않음).
// - ON DELETE CASCADE 는 RI 트리거(AFTER ROW)로, 모든 CTE 가 끝난 뒤 문 끝에서 돈다. 그 트리거의
//   `DELETE FROM budget_items WHERE schedule_item_id = $1` 은 명령 카운터를 올린 뒤의 새 스냅숏으로 돌아
//   moved 가 이미 schedule_item_id 를 NULL 로 바꾼 행을 보므로 걸리지 않는다. 남은 모임 행만 지운다.
// - 다른 연결이 이 문 도중에 같은 일정에 내 돈 금액을 넣고 커밋하면(일정 행 KEY SHARE 잠금을 기다린 뒤) 그 행은
//   moved 의 스냅숏에 없어 옮겨지지 않고 cascade 로 지워진다. 창은 이 문 하나 길이로 좁고, 받아들인다.
// 이 동작은 마이그레이션 적용 뒤 실제 DB 에서 확인한다(구현 계획 Task 9 Step 4). 어긋나면 moved 를 먼저 따로 실행한다.
// 제목은 일정 밖 항목 이름 상한(EXTRA_TITLE_MAX)에 맞춰 자른다(LEFT 와 입력 검증 모두 글자(코드 포인트) 수).
// 기록 여행(#103)에서는 내 나만 일정만 지운다(s 에 writableItemCondition, 모두 일정 사본이면 s 가 비어 아무것도 안 바뀜).
export async function deleteScheduleItem(
  userId: string,
  tripId: string,
  itemId: string,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  const result = await db.execute<{ id: string }>(sql`
    WITH s AS (
      SELECT ${scheduleItems.id} AS id, ${scheduleItems.date} AS date,
        LEFT(COALESCE(NULLIF(${scheduleItems.title}, ''), p.label, NULLIF(${scheduleItems.place}, ''), '지운 일정'), ${EXTRA_TITLE_MAX}::integer) AS title
      FROM ${scheduleItems}
      LEFT JOIN ${places} p ON p.id = ${scheduleItems.placeId}
      WHERE ${writableItemCondition(userId, tripId, itemId)}
    ),
    moved AS (
      UPDATE budget_items
      SET schedule_item_id = NULL, title = s.title, date = s.date, updated_at = now()
      FROM s
      WHERE budget_items.schedule_item_id = s.id AND budget_items.owner_user_id IS NOT NULL
      RETURNING budget_items.id
    ),
    d AS (
      DELETE FROM schedule_items WHERE id IN (SELECT id FROM s) RETURNING id
    )
    SELECT id FROM d`);
  return result.rows.length > 0;
}

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
