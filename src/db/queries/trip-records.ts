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

// 붙이기(설계 §5.4)의 통화 판정: 기록(별칭 recordAlias 의 trips 행)에 있는 userId 의 내 돈 행이 모두, 예상·실제 통화가
// 대상 여행의 지금 예산 통화나 현지 통화인가. 대상에 예산 설정이 없는데 금액 행이 있으면 false. 행이 없으면 true.
// 내 예산(trip_personal_budgets)의 통화는 보지 않는다(옮긴 뒤 "낡은 내 예산" 처리가 맡는다).
// recordAlias 는 코드에 적은 별칭만 받는다(SQL 에 그대로 들어간다).
export function currencyFitsSql(
  recordAlias: string,
  targetTripId: SQL,
  userId: string,
): SQL {
  if (!/^[a-z_][a-z0-9_]*$/.test(recordAlias)) {
    throw new Error("currencyFitsSql: 별칭 형식이 틀렸어요.");
  }
  const record = sql.raw(recordAlias);
  return sql`NOT EXISTS (
    SELECT 1 FROM budget_items cb
    LEFT JOIN trip_budgets ctb ON ctb.trip_id = ${targetTripId}
    WHERE cb.trip_id = ${record}.id
      AND cb.owner_user_id = ${userId}::text
      AND (
        (cb.estimate_currency IS NOT NULL
          AND cb.estimate_currency IS DISTINCT FROM ctb.currency
          AND cb.estimate_currency IS DISTINCT FROM ctb.local_currency)
        OR (cb.actual_currency IS NOT NULL
          AND cb.actual_currency IS DISTINCT FROM ctb.currency
          AND cb.actual_currency IS DISTINCT FROM ctb.local_currency)
      )
  )`;
}

// 붙이기(설계 §5.4): P(userId)가 여행 T 에 참여하는 문에서, P 가 T 에서 떼어 낸 기록 R 하나를 T 로 되돌리고 R 을 지운다.
// 앞에 joined(trip_id, user_id) CTE(참여 INSERT … RETURNING)가 있어야 한다. 참여가 0행이면 rec 이 비어 아무것도 바뀌지 않는다.
// 기록 id·여행 id 를 입력으로 받지 않는다. T 는 초대 해시로 넣은 joined 행, R 은 "P 가 주인이고 detached_from_trip_id = T" 로 찾는다(§5.9).
// 떼기(detachMembersCtes)의 거울이다. 같은 규칙: 한 행을 두 CTE 가 쓰지 않는다(schedule_items 는 back_items 만,
// budget_items 는 back_money 만, trip_personal_budgets 는 back_budget 만, trips 는 gone_record 만, trip_members 는 joined 만).
//
// CTE:
//  rec          P 의 기록 가운데 detached_from_trip_id = T 이고 통화가 맞는(currencyFitsSql) 것 중 detached_at 가장 최근 하나.
//               여럿이어도 한 번에 하나만 붙인다. 나머지는 기록으로 남는다(다음에 나갔다 들어오면 그다음 것이 붙는다).
//  item_src     R 의 P 나만 일정(떼어 낸 동안 만든 것 포함)과 옮길 장소: R 의 장소 사본과 google_place_id 가 같은 T 의 장소.
//               T 에 없으면 장소 id 를 비우고, 글자 장소(place)가 비었으면 그 장소 이름표를 넣는다(§5.4-1). 옛 순서(old_position)는
//               돌려줄 movedItems 의 차례에만 쓴다.
//  back_items   그 일정을 T 로(원래 id 그대로, position = NULL). 그날 순서는 joinTripAction 이 settleMovedItems 로 맞춘다.
//  money_src    R 의 P 내 돈마다 T 에서 이을 일정: P 나만 일정에 붙은 것 → 그대로(일정과 함께 간다). 사본 일정에 붙은 것 →
//               원래 일정(copied_from_id)이 아직 T 에 있고 T 에 그 일정·P 의 행이 없을 때만 원래 일정(budget_items_schedule_owner_idx
//               를 깨지 않음), 아니면 일정 밖 지출(제목·날짜는 사본 일정에서, deleteScheduleItem 과 같은 제목 규칙). 일정 밖 → 그대로.
//  back_money   그 행을 T 로.
//  back_budget  P 의 내 예산을 T 로. T 에 (T, P) 행이 이미 있으면 옮기지 않는다(R 과 함께 지워진다).
//  gone_record  R 을 지운다. 사본(모두 일정·장소·기준점·예산 설정·모임 지출)과 함께한 사람 행은 cascade 로 지워진다.
//               cascade 는 문 끝에 돌아 같은 문에서 T 로 옮긴 행은 지우지 않는다(deleteTrip 의 떼기와 같은 까닭, PGlite 로 확인).
//
// 동시성(§6). 읽기는 문 시작 스냅숏이다.
// - 참여는 새 멤버 행을 넣을 때만 붙인다(ON CONFLICT 로 0행이면 rec 이 비어 아무것도 안 함). 이미 멤버인 사람(옛 배포로 참여)은 붙지 않는다.
// - 이 문과 동시에 P 가 R 에 새 내 돈·나만 일정을 넣으면 스냅숏에 없어 옮기지 않고 R 과 함께 지워진다. 같은 사람이 초대 화면에서
//   [참여]를 누르는 동시에 다른 탭에서 기록을 고치는 경우뿐이라 받아들인다. 고치기(UPDATE)는 기다렸다가 고친 판을 옮긴다.
// - 동시에 남이 원래 일정 X 나 T 의 장소를 지우면 옮긴 행의 FK 검사가 실패해 문 전체가 오류로 끝난다(아무것도 바뀌지 않고 다시 누르면 된다).
// - 동시에 남이 T 의 예산 통화를 바꾸면 스냅숏의 통화로 판정해 맞지 않는 금액이 붙을 수 있다. upsertTripBudget 의 통화 잠금도
//   스냅숏 판정이라 지금 두 사람이 동시에 금액·통화를 쓰는 창과 같다. 받아들인다.
export function reattachRecordCtes(userId: string): SQL {
  return sql`
    rec AS (
      SELECT r.id, j.trip_id AS to_trip_id
      FROM joined j
      JOIN trips r ON r.user_id = ${userId}::text
        AND r.detached_from_trip_id = j.trip_id
        AND r.detached_at IS NOT NULL
      WHERE j.user_id = ${userId}::text
        AND ${currencyFitsSql("r", sql`j.trip_id`, userId)}
      ORDER BY r.detached_at DESC, r.id DESC
      LIMIT 1
    ),
    item_src AS (
      SELECT s.id, s.position AS old_position, tp.id AS to_place_id,
        CASE WHEN rp.id IS NOT NULL AND tp.id IS NULL THEN COALESCE(NULLIF(s.place, ''), rp.label) ELSE s.place END AS place
      FROM rec
      JOIN schedule_items s ON s.trip_id = rec.id AND s.for_user_id = ${userId}::text
      LEFT JOIN places rp ON rp.id = s.place_id
      LEFT JOIN places tp ON tp.trip_id = rec.to_trip_id AND tp.google_place_id = rp.google_place_id
    ),
    back_items AS (
      UPDATE schedule_items s
      SET trip_id = rec.to_trip_id, place_id = src.to_place_id, place = src.place, position = NULL, updated_at = now()
      FROM item_src src, rec
      WHERE s.id = src.id AND s.trip_id = rec.id AND s.for_user_id = ${userId}::text
      RETURNING s.id, s.date, s.time
    ),
    money_links AS (
      SELECT b.id, b.schedule_item_id AS old_link, b.title AS old_title, b.date AS old_date,
        CASE
          WHEN b.schedule_item_id IS NULL THEN NULL
          WHEN ri.for_user_id = ${userId}::text THEN b.schedule_item_id
          WHEN x.id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM budget_items tb
            WHERE tb.schedule_item_id = x.id AND tb.owner_user_id = ${userId}::text
          ) THEN x.id
        END AS new_link,
        LEFT(COALESCE(NULLIF(ri.title, ''), rp.label, NULLIF(ri.place, ''), '지운 일정'), ${EXTRA_TITLE_MAX}::integer) AS item_title,
        ri.date AS item_date
      FROM rec
      JOIN budget_items b ON b.trip_id = rec.id AND b.owner_user_id = ${userId}::text
      LEFT JOIN schedule_items ri ON ri.id = b.schedule_item_id AND ri.trip_id = rec.id
      LEFT JOIN places rp ON rp.id = ri.place_id
      LEFT JOIN schedule_items x ON x.id = ri.copied_from_id AND x.trip_id = rec.to_trip_id
    ),
    money_src AS (
      SELECT id, new_link AS schedule_item_id,
        CASE WHEN old_link IS NULL THEN old_title WHEN new_link IS NOT NULL THEN NULL ELSE item_title END AS title,
        CASE WHEN old_link IS NULL THEN old_date WHEN new_link IS NOT NULL THEN NULL ELSE item_date END AS date
      FROM money_links
    ),
    back_money AS (
      UPDATE budget_items b
      SET trip_id = rec.to_trip_id, schedule_item_id = ms.schedule_item_id, title = ms.title, date = ms.date, updated_at = now()
      FROM money_src ms, rec
      WHERE b.id = ms.id AND b.trip_id = rec.id AND b.owner_user_id = ${userId}::text
      RETURNING b.id
    ),
    back_budget AS (
      UPDATE trip_personal_budgets pb
      SET trip_id = rec.to_trip_id, updated_at = now()
      FROM rec
      WHERE pb.trip_id = rec.id AND pb.user_id = ${userId}::text
        AND NOT EXISTS (
          SELECT 1 FROM trip_personal_budgets tpb
          WHERE tpb.trip_id = rec.to_trip_id AND tpb.user_id = ${userId}::text
        )
      RETURNING pb.user_id
    ),
    gone_record AS (
      DELETE FROM trips r
      USING rec
      WHERE r.id = rec.id AND r.user_id = ${userId}::text AND r.detached_at IS NOT NULL
      RETURNING r.id
    )`;
}

// 초대 화면(설계 §5.4)용: 이 사람이 tripId 에서 떼어 낸 기록 가운데 참여하면 붙을 것이 있는지(reattach), 통화 때문에 붙지 않을
// 것이 있는지(blocked). 판정은 joinTrip 의 rec 과 같은 currencyFitsSql. 기록이 없거나 id 형식이 틀리면 둘 다 false.
// 이 사람 자신의 기록만 본다(r.user_id = userId). 화면 판정과 참여 사이에 통화가 바뀌면 참여 때의 판정이 정한다.
export async function getReattachPreview(
  userId: string,
  tripId: string,
): Promise<{ reattach: boolean; blocked: boolean }> {
  if (!isUuid(tripId)) return { reattach: false, blocked: false };
  const result = await db.execute<{
    reattach: boolean | null;
    blocked: boolean | null;
  }>(sql`
    SELECT bool_or(f.fits) AS reattach, bool_or(NOT f.fits) AS blocked
    FROM (
      SELECT ${currencyFitsSql("r", sql`${tripId}::uuid`, userId)} AS fits
      FROM trips r
      WHERE r.user_id = ${userId}::text
        AND r.detached_from_trip_id = ${tripId}::uuid
        AND r.detached_at IS NOT NULL
    ) f`);
  const row = result.rows[0];
  return { reattach: row?.reattach === true, blocked: row?.blocked === true };
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
