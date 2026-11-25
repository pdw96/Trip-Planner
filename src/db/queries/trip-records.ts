import "server-only";
import { and, asc, desc, eq, isNotNull, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { tripRecordCompanions, trips, user } from "@/db/schema";
import { EXTRA_TITLE_MAX } from "@/lib/budget-input";
import { isUuid } from "@/lib/ids";

// 떼어 낸 기록(#103) 쿼리. 설계: docs/superpowers/specs/2026-11-25-detached-trip-record-design.md
//
// 떼기(§5.3): 함께하는 사람 P 가 여행 T 에서 나가거나(leaveTrip), 내보내지거나(removeMember), 주인이 T 를 지우면
// (deleteTrip, 그때의 멤버마다) P 몫을 옮기고 모두의 것을 복사해 P 가 주인인 기록 여행 R 을 만든다.
// 멤버 행 지우기와 함께 데이터를 바꾸는 CTE 한 문이라 원자적이다(neon-http 에는 트랜잭션이 없다, §6).
// 모든 CTE 는 removed(실제로 지운 멤버 행) → records(그 행마다 새 R) 에 이어져, 자격 조건(memberCondition)이
// 맞지 않아 removed 가 비면 아무것도 바뀌지 않는다. 여행 지우기에서는 records 가 여러 행이라 모든 결합을 R(rec.id) 단위로 한다.
// 원래 여행 T 는 tripId 로 받고 removed 가 trip_members.trip_id = T 를 스스로 건다(memberCondition 은 그 위에 더하는 자격 조건).
// records 가 removed 와 user_id 로 다시 결합해 원래 여행을 찾으므로, 지운 행 안에서 user_id 가 고유해야 한다
// (여행 하나 안에서는 기본 키라 고유). tripId 는 isUuid 를 거친 값이다.
//
// CTE(설계 §5.3 번호):
//  1 records        R 을 만든다(T 의 제목·목적지·날짜·메모·나라, 초대 칸은 비움). new_records 가 넣고, records 가
//                   removed 와 user_id 로 결합해 원래 여행 id(from_trip_id)를 붙인다(INSERT … RETURNING 은 넣은 칸만 돌려준다).
//                   detached_from_trip_id 는 나가기·내보내기면 T, 여행 지우기(sourceDeleted)면 처음부터 NULL 이다.
//                   여행 지우기에서 T 를 넣으면 그 FK 검사(문 끝 AFTER INSERT 트리거)가 같은 문의 T 삭제 SET NULL 보다
//                   먼저 도는 경우(CTE 실행 순서에 달림, Postgres 는 순서를 정하지 않음) FK 오류로 문이 실패한다.
//                   NULL 이면 FK 검사가 없어 순서에 기대지 않는다. T 가 같은 문에서 지워지므로 어차피 마지막 값도 NULL 이다.
//  2 companions     T 의 주인(was_owner, R 마다 정확히 하나 — listTrips 가 이 행으로 결합한다)과 P 를 뺀 멤버.
//                   문 시작 스냅숏을 보므로 같은 문에서 지운 멤버도 보인다(여행 지우기에서 A·C 가 서로를 적는다).
//  3 new_places     T 의 장소 모두 복사(좌표·coords_fetched_at·created_at 포함). 장소 id 는 google_place_id 로 맞춘다(여행마다 고유).
//  4 new_bases      기준점 복사, 장소는 R 의 사본.
//  5 new_budget     예산 설정 복사.
//  6 new_items      모두 일정 복사(copied_from_id = 원래 id, 장소는 R 의 사본, position·done 도).
//  7 kept_on_mine   P 의 나만 일정에 붙은 남의 금액(모임 행, 나가지 않는 사람의 내 돈)을 T 의 일정 밖 지출로 바꾼다
//                   (deleteScheduleItem 의 moved 와 같은 제목·날짜 규칙). 반목표의 유일한 예외(§2). T 의 행만 쓴다(b.trip_id = T).
//    moved_mine     P 의 나만 일정을 R 로 옮긴다(원래 id 그대로, 장소는 R 의 사본).
//  8 moved_money    P 의 내 돈을 한 UPDATE 로 R 로 옮긴다. 모두 일정에 붙은 것 → 그 사본(copied_from_id 로),
//                   P 의 나만 일정에 붙은 것 → 그대로(일정과 함께 간다), 남의 나만 일정에 붙은 것 → 일정 밖(제목·날짜는 그 일정에서).
//  9 copied_shared_money  모임 지출 복사. 모두 일정에 붙은 것 → 사본 일정에, 나만 일정(누구 것이든)에 붙은 것 → 일정 밖,
//                   일정 밖 → 그대로. 나만 일정에 붙은 것을 잇지 않는 까닭: P 나만 일정에 붙은 원래 모임 행은 7 이 같은 문에서
//                   연결을 끊는데, 사본을 같은 일정(R 로 옮겨 감)에 이으면 부분 고유 색인 budget_items_schedule_shared_idx 가
//                   CTE 실행 순서에 따라(고유 검사는 행마다 즉시) 충돌할 수 있다.
// 10 moved_budget   P 의 내 예산을 R 로 옮긴다.
// 11(멤버 행 지우기)은 removed 가 맨 앞에서 한다. 남의 나만 일정과 남의 내 돈은 R 에 넣지 않는다(#89, §5.1).
//
// 한 행을 두 CTE 가 쓰지 않는다(같은 문에서 같은 행을 두 번 UPDATE 하면 하나만 적용되고 어느 쪽인지 정해지지 않는다).
// budget_items 는 "나가는 사람(records 의 누구든) 것"은 8 만, "나가는 사람 것이 아니고 P 나만 일정에 붙은 것"은 7 만 쓴다.
// 여행 지우기에서 A 나만 일정에 붙은 C 내 돈은 C 도 나가므로 7(A 쪽)이 아니라 8(C 쪽)이 C 의 R 로 옮긴다.
// 9 는 새 행만 넣고, schedule_items 는 moved_mine 만, trip_personal_budgets 는 10 만 쓴다.
//
// 동시성(§6). 읽기는 모두 문 시작 스냅숏이고, 옮기는 UPDATE 는 다른 연결이 먼저 바꾼 행이면 기다린 뒤 새 판에 다시 건다
// (READ COMMITTED 재검사). 옮기기는 trip_id·연결·제목·날짜만 쓰므로 그 사이 바뀐 금액은 그대로 따라간다.
// - 이 문과 동시에 P 가 내 돈을 새로 넣으면(쓰기 문의 접근 확인이 아직 멤버 행을 본 경우) 그 행은 스냅숏에 없어 T 에 남는다.
//   본인만 보는 행이고 본인은 이제 T 에 접근할 수 없어 아무에게도 보이지 않는다(다시 참여하면 다시 보임). 지금 나가기와 같은 창이다.
//   그 행이 P 나만 일정에 붙어 있었다면 R 로 간 일정을 가리키는 T 의 행이 된다. T·R 어느 화면에도 보이지 않는다.
// - 동시에 남(C)이 P 나만 일정에 내 돈을 새로 넣으면 그 행은 7 에 걸리지 않아 R 로 간 일정에 붙은 채 T 에 남는다.
//   C 만 보는 행이라 P 에게는 보이지 않는다(#89 유지). C 의 T 화면에서는 일정이 사라져 그 금액이 보이지 않을 수 있다.
//   창은 이 문 하나 길이로 좁고 남의 데이터가 사라지지는 않으므로 받아들인다.
// - 동시에 남이 P 나만 일정을 고치면 moved_mine 이 기다렸다가 고친 판을 옮긴다. 지우면 옮길 행이 없고 그 일정의 금액은
//   지운 쪽(deleteScheduleItem)이 처리한다.
// - 둘이 동시에 나가면 서로 상대를 멤버로 보고 함께한 사람에 적는다. 같은 행(예: A 나만 일정의 C 내 돈)을 A 의 7 과 C 의 8 이
//   차례로 쓰면 뒤의 문이 앞 문의 결과 위에 재검사로 다시 걸린다. 8 이 먼저면 7 은 연결이 이미 끊긴 행을 건너뛰고
//   (b.schedule_item_id 조건), 7 이 먼저면 8 이 그 위에 같은 제목·날짜로 C 의 R 로 옮긴다. 어느 쪽이든 금액은 사라지지 않는다.
//   두 문이 서로의 잠금을 기다리면 Postgres 가 교착을 알아채 한쪽을 오류로 끝낸다(아무것도 바뀌지 않고 다시 누르면 된다).
// - 동시에 참여(joinTrip)하는 사람은 스냅숏에 없어 함께한 사람에 빠질 수 있다. 받아들인다.
//
// 제목 규칙은 deleteScheduleItem 과 같다(일정 제목 → 장소 이름표 → 적은 장소 글자 → "지운 일정", EXTRA_TITLE_MAX 로 자름).
// INSERT … SELECT 는 칸을 모두 이름으로 적는다(칸 순서에 기대지 않음).
// sourceDeleted: 같은 문에서 원래 여행을 지우는가(deleteTrip 만 true).
export function detachMembersCtes(
  tripId: string,
  memberCondition: SQL,
  { sourceDeleted }: { sourceDeleted: boolean },
): SQL {
  const detachedFrom = sourceDeleted ? sql`NULL::uuid` : sql`t.id`;
  return sql`
    removed AS (
      DELETE FROM trip_members
      WHERE trip_members.trip_id = ${tripId}::uuid AND (${memberCondition})
      RETURNING trip_id, user_id
    ),
    new_records AS (
      INSERT INTO trips (user_id, title, destination, start_date, end_date, notes, country_code, detached_from_trip_id, detached_at)
      SELECT r.user_id, t.title, t.destination, t.start_date, t.end_date, t.notes, t.country_code, ${detachedFrom}, now()
      FROM removed r
      JOIN trips t ON t.id = r.trip_id
      RETURNING id, user_id
    ),
    records AS (
      SELECT nr.id, nr.user_id, r.trip_id AS from_trip_id
      FROM new_records nr
      JOIN removed r ON r.user_id = nr.user_id
    ),
    companions AS (
      INSERT INTO trip_record_companions (trip_id, user_id, was_owner)
      SELECT rec.id, t.user_id, true
      FROM records rec
      JOIN trips t ON t.id = rec.from_trip_id
      UNION ALL
      SELECT rec.id, m.user_id, false
      FROM records rec
      JOIN trips t ON t.id = rec.from_trip_id
      JOIN trip_members m ON m.trip_id = rec.from_trip_id
        AND m.user_id <> rec.user_id AND m.user_id <> t.user_id
      RETURNING trip_id
    ),
    new_places AS (
      INSERT INTO places (trip_id, google_place_id, label, lat, lng, coords_fetched_at, category, memo, created_at)
      SELECT rec.id, p.google_place_id, p.label, p.lat, p.lng, p.coords_fetched_at, p.category, p.memo, p.created_at
      FROM records rec
      JOIN places p ON p.trip_id = rec.from_trip_id
      RETURNING id, trip_id, google_place_id
    ),
    new_bases AS (
      INSERT INTO trip_bases (trip_id, start_date, place_id)
      SELECT rec.id, b.start_date, np.id
      FROM records rec
      JOIN trip_bases b ON b.trip_id = rec.from_trip_id
      LEFT JOIN places op ON op.id = b.place_id
      LEFT JOIN new_places np ON np.trip_id = rec.id AND np.google_place_id = op.google_place_id
      RETURNING trip_id
    ),
    new_budget AS (
      INSERT INTO trip_budgets (trip_id, currency, total_amount, mode, local_currency, planned_rate)
      SELECT rec.id, b.currency, b.total_amount, b.mode, b.local_currency, b.planned_rate
      FROM records rec
      JOIN trip_budgets b ON b.trip_id = rec.from_trip_id
      RETURNING trip_id
    ),
    new_items AS (
      INSERT INTO schedule_items (trip_id, date, time, title, place, place_id, memo, done, position, copied_from_id, created_at)
      SELECT rec.id, s.date, s.time, s.title, s.place, np.id, s.memo, s.done, s.position, s.id, s.created_at
      FROM records rec
      JOIN schedule_items s ON s.trip_id = rec.from_trip_id AND s.for_user_id IS NULL
      LEFT JOIN places op ON op.id = s.place_id
      LEFT JOIN new_places np ON np.trip_id = rec.id AND np.google_place_id = op.google_place_id
      RETURNING id, trip_id, copied_from_id
    ),
    item_info AS (
      SELECT rec.id AS record_id, rec.user_id AS leaver_id, s.id, s.for_user_id, s.date,
        LEFT(COALESCE(NULLIF(s.title, ''), p.label, NULLIF(s.place, ''), '지운 일정'), ${EXTRA_TITLE_MAX}::integer) AS title
      FROM records rec
      JOIN schedule_items s ON s.trip_id = rec.from_trip_id
      LEFT JOIN places p ON p.id = s.place_id
    ),
    kept_on_mine AS (
      UPDATE budget_items b
      SET schedule_item_id = NULL, title = ii.title, date = ii.date, updated_at = now()
      FROM item_info ii
      WHERE b.schedule_item_id = ii.id
        AND b.trip_id = ${tripId}::uuid
        AND ii.for_user_id = ii.leaver_id
        AND NOT EXISTS (
          SELECT 1 FROM records rec2
          WHERE rec2.from_trip_id = b.trip_id AND rec2.user_id = b.owner_user_id
        )
      RETURNING b.id
    ),
    moved_mine AS (
      UPDATE schedule_items s
      SET trip_id = rec.id,
        place_id = (
          SELECT np.id FROM places op
          JOIN new_places np ON np.trip_id = rec.id AND np.google_place_id = op.google_place_id
          WHERE op.id = s.place_id
        ),
        updated_at = now()
      FROM records rec
      WHERE s.trip_id = rec.from_trip_id AND s.for_user_id = rec.user_id
      RETURNING s.id
    ),
    money_moves AS (
      SELECT b.id, rec.id AS record_id,
        CASE
          WHEN ni.id IS NOT NULL THEN ni.id
          WHEN ii.for_user_id = rec.user_id THEN b.schedule_item_id
        END AS schedule_item_id,
        CASE
          WHEN b.schedule_item_id IS NULL THEN b.title
          WHEN ni.id IS NOT NULL OR ii.for_user_id = rec.user_id THEN NULL
          ELSE COALESCE(ii.title, '지운 일정')
        END AS title,
        CASE
          WHEN b.schedule_item_id IS NULL THEN b.date
          WHEN ni.id IS NOT NULL OR ii.for_user_id = rec.user_id THEN NULL
          ELSE ii.date
        END AS date
      FROM records rec
      JOIN budget_items b ON b.trip_id = rec.from_trip_id AND b.owner_user_id = rec.user_id
      LEFT JOIN new_items ni ON ni.trip_id = rec.id AND ni.copied_from_id = b.schedule_item_id
      LEFT JOIN item_info ii ON ii.record_id = rec.id AND ii.id = b.schedule_item_id
    ),
    moved_money AS (
      UPDATE budget_items b
      SET trip_id = mm.record_id, schedule_item_id = mm.schedule_item_id, title = mm.title, date = mm.date, updated_at = now()
      FROM money_moves mm
      WHERE b.id = mm.id
      RETURNING b.id
    ),
    copied_shared_money AS (
      INSERT INTO budget_items (trip_id, schedule_item_id, title, date, estimate_amount, estimate_currency,
        actual_amount, actual_currency, actual_paid_on, actual_rate, actual_rate_source, created_at)
      SELECT rec.id, ni.id,
        CASE
          WHEN b.schedule_item_id IS NULL THEN b.title
          WHEN ni.id IS NOT NULL THEN NULL
          ELSE COALESCE(ii.title, '지운 일정')
        END,
        CASE
          WHEN b.schedule_item_id IS NULL THEN b.date
          WHEN ni.id IS NOT NULL THEN NULL
          ELSE ii.date
        END,
        b.estimate_amount, b.estimate_currency, b.actual_amount, b.actual_currency,
        b.actual_paid_on, b.actual_rate, b.actual_rate_source, b.created_at
      FROM records rec
      JOIN budget_items b ON b.trip_id = rec.from_trip_id AND b.owner_user_id IS NULL
      LEFT JOIN new_items ni ON ni.trip_id = rec.id AND ni.copied_from_id = b.schedule_item_id
      LEFT JOIN item_info ii ON ii.record_id = rec.id AND ii.id = b.schedule_item_id
      RETURNING id
    ),
    moved_budget AS (
      UPDATE trip_personal_budgets pb
      SET trip_id = rec.id, updated_at = now()
      FROM records rec
      WHERE pb.trip_id = rec.from_trip_id AND pb.user_id = rec.user_id
      RETURNING pb.user_id
    )`;
}

// 기록 여행에 함께했던 사람의 이름. 기록의 주인만 읽는다. user id 는 돌려주지 않는다(브라우저로 나가지 않게, #103).
// 주인 조건은 trips.ts 의 ownedTrips 와 같은 것(trips.user_id = userId)을 여기 적는다. trips.ts 가 이 파일의
// detachMembersCtes 를 쓰므로 거꾸로 import 하면 순환이 된다.
export async function listRecordCompanions(
  userId: string,
  tripId: string,
): Promise<{ name: string; wasOwner: boolean }[]> {
  if (!isUuid(tripId)) return [];
  return db
    .select({ name: user.name, wasOwner: tripRecordCompanions.wasOwner })
    .from(tripRecordCompanions)
    .innerJoin(trips, eq(trips.id, tripRecordCompanions.tripId))
    .innerJoin(user, eq(user.id, tripRecordCompanions.userId))
    .where(
      and(
        eq(tripRecordCompanions.tripId, tripId),
        eq(trips.userId, userId),
        isNotNull(trips.detachedAt),
      ),
    )
    .orderBy(desc(tripRecordCompanions.wasOwner), asc(user.name));
}
