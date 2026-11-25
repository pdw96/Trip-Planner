# 떼어 낸 기록 (#103) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 함께하는 여행에서 나가거나 내보내지거나 주인이 여행을 지우면 그 사람의 몫과 모두의 것 사본이 그 사람 계정의 "떼어 낸 기록"(기록 여행)으로 남고, 같은 여행에 다시 참여하면 원래 자리로 돌아간다.

**Architecture:** 기록 = `trips.detached_at IS NOT NULL` 인 여행(주인 = 나간 사람). 떼기는 지금 `removeMemberAndPrivateRows` 자리의 집합 단위 CTE 한 문(멤버 여럿을 한 번에 다룰 수 있어 여행 지우기에도 같은 SQL), 붙이기는 `joinTrip` 의 INSERT 에 CTE 를 이어 붙인 한 문. 기록 안 사본 보호는 쓰기 쿼리마다 SQL 조건으로 한다.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM 0.45(neon-http, `db.execute(sql\`…\`)`), Postgres, node:test, PGlite(scratchpad, 커밋 안 함), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-detached-trip-record-design.md`

## Global Constraints

- 위험 경로: `src/db/schema.ts`, `drizzle/**`. 마이그레이션 PR — 자동 머지 없음, `human-approved` 뒤 `npm run db:migrate`(실행 직전 사람 확인), `drizzle/` 아래 생성 파일은 손으로 고치지 않는다.
- 새 의존성 없음(PGlite 는 scratchpad 에만).
- 모든 쿼리 함수는 첫 인자 `userId`, uuid 형식이 틀린 id 는 쿼리 전에 걸러 `false`/`null`. 남의 것과 없는 것은 같게.
- 여러 테이블 변경은 데이터를 바꾸는 CTE **한 문**(설계 §6). 같은 문 안 CTE 는 서로 넣은 행을 못 보므로 `RETURNING` 을 이어 받는다. 한 행을 두 CTE 에서 쓰지 않는다.
- 함께한 사람의 계정 번호는 브라우저로 보내지 않는다(화면 데이터에는 이름과 `wasOwner` 만).
- 사용자에게 보이는 문구는 한국어. `src/lib/*.ts` 순수 모듈은 다른 모듈을 import 하지 않는다.
- 커밋 전 `npm run lint`·`npm run typecheck`·`npm test`.

## Review Focus

1. **기록 안에서 요청을 직접 보내 사본을 고치기** — 화면에 버튼이 없어도 모든 쓰기 함수가 0행이어야 한다. Task 4 의 PGlite 시나리오가 함수마다 한 번씩 부른다.
2. **주인이 여행을 지울 때 멤버 둘** — 둘 다 각자 기록을 받고, 여행 삭제 cascade 가 옮긴 행을 지우지 않아야 한다. Task 5 시나리오 C.
3. **다시 참여 시 같은 일정에 내 돈 행이 이미 있음**(옛 배포에서 다시 참여해 적은 경우 등) — 고유 색인 충돌로 참여 전체가 실패하면 안 된다. 일정 밖 지출로 바꾼다. Task 6 시나리오 E.
4. **기록이 여럿인 사람의 다시 참여** — 둘 다 같은 원래 일정으로 내 돈을 이으면 고유 색인 충돌. 붙이기는 붙을 수 있는 기록 중 **가장 최근 하나**만 붙이고 나머지는 남긴다(설계 §5.4 의 "모두 붙인다"를 이렇게 좁힘, PR 에 적는다). Task 6 시나리오 F.
5. **나간 사람의 나만 일정에 붙은 모임 지출·남의 내 돈** — T 에 일정 밖 지출로 남고 금액이 그대로여야 한다(남은 사람의 데이터 보존). Task 5 시나리오 B.

---

## File Structure

- `src/db/schema.ts` — `trips` 두 칸·제약·색인, `schedule_items.copied_from_id`, 새 표 `tripRecordCompanions`.
- `src/db/queries/trips.ts` — `editableTrips`, `isRecordTrip`, `getTrip`/`listTrips` 의 기록 칸, `deleteTrip` 이 떼기를 함께.
- `src/db/queries/trip-records.ts`(새) — 떼기 SQL(`detachMembersSql`), 붙이기 CTE(`reattachCtes`), 기록 읽기(`listRecordCompanions`, `getReattachPreview`).
- `src/db/queries/trip-members.ts` — `leaveTrip`·`removeMember` 가 떼기, `joinTrip` 이 붙이기, 초대 링크 기록 거르기.
- `src/db/queries/{schedule-items,places,trip-bases,budget}.ts` — 기록 쓰기 조건.
- `src/lib/trip-records.ts`(새, 순수) — 목록 나누기·이름표·함께한 사람 문구.
- `src/lib/schedule-order.ts` — `settleMovedItems`.
- 화면: `src/app/trips/page.tsx`, `src/app/trips/[id]/page.tsx` 와 섹션들, `member-buttons.tsx`, `delete-trip-button.tsx`, `src/app/invite/[token]/page.tsx`, `src/app/invite/actions.ts`, `src/app/trips/[id]/edit/page.tsx`.
- scratchpad(커밋 안 함): PGlite 검증 스크립트 `pglite-103.mjs`.

---

### Task 1: 스키마와 마이그레이션

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0011_*.sql`, `drizzle/meta/*`(생성)

**Interfaces:**
- Produces: `trips.detachedFromTripId: uuid | null`, `trips.detachedAt: timestamptz | null`, `scheduleItems.copiedFromId: uuid | null`, `tripRecordCompanions { tripId, userId, wasOwner }`, 타입 `TripRecordCompanion`.

- [ ] **Step 1: `src/db/schema.ts` 고치기** — 설계 §5.2 그대로.
  - `trips`: `detachedFromTripId: uuid("detached_from_trip_id").references((): AnyPgColumn => trips.id, { onDelete: "set null" })`, `detachedAt: timestamp("detached_at", { withTimezone: true })`. 제약 `check("trips_detached_check", sql\`${t.detachedFromTripId} IS NULL OR ${t.detachedAt} IS NOT NULL\`)`, 색인 `index("trips_detached_from_idx").on(t.userId, t.detachedFromTripId).where(sql\`${t.detachedFromTripId} IS NOT NULL\`)`(**고유 아님**). 칸 주석: "떼어 낸 기록(#103). detached_at 이 있으면 기록 여행(주인 = 나간 사람). 원래 여행이 지워지면 detached_from_trip_id 만 null."
  - `scheduleItems`: `copiedFromId: uuid("copied_from_id")`(FK 없음). 주석: "기록 안 모두 일정 사본의 원래 일정 id(#103). 다시 붙일 때 내 돈을 원래 일정에 잇는 데만 쓴다."
  - 새 표 `tripRecordCompanions = pgTable("trip_record_companions", { tripId: uuid FK trips cascade notNull, userId: text FK user cascade notNull, wasOwner: boolean("was_owner").notNull().default(false) }, (t) => [primaryKey({ columns: [t.tripId, t.userId] })])`. 주석: "기록 여행에 그때 함께한 사람(#103). 이름은 저장하지 않고 user.name 에서 읽는다. 탈퇴하면 행이 함께 지워진다."
- [ ] **Step 2: `npm run db:generate`** — 생성 SQL 이 ADD COLUMN 셋, ADD CONSTRAINT(FK·CHECK), CREATE INDEX, CREATE TABLE + FK 둘뿐인지(DROP·타입 변경·NOT NULL 추가 없음) 확인.
- [ ] **Step 3: PGlite 하네스 만들기** — scratchpad 에 `@electric-sql/pglite`(0.2.x)를 깔고 `pglite-103.mjs` 를 만든다(`docs/status.md` '마이그레이션 SQL 을 적용 전에 확인'): `drizzle/*.sql` 을 `meta/_journal.json` 순서로 `--> statement-breakpoint` 로 나눠 적용, `@/db` 를 PGlite drizzle(`drizzle-orm/pglite`)로 바꾼 require 훅, `server-only` 는 빈 모듈. 이후 Task 4–6 이 시나리오를 더한다.
- [ ] **Step 4: 마이그레이션 확인** — 하네스로 적용 성공, `detached_at` null 인 기존 모양 여행 insert 통과, `detached_from_trip_id` 만 있고 `detached_at` null 이면 CHECK 거절, 원래 여행 삭제 시 기록의 `detached_from_trip_id` 가 null 이 되는지.
- [ ] **Step 5: `npm run typecheck` 통과 후 커밋** — `feat: 떼어 낸 기록 스키마 (#103)`.

### Task 2: 순수 함수 — 목록 나누기, 이름표, 옮겨 온 일정 순서

**Files:**
- Create: `src/lib/trip-records.ts`, `src/lib/trip-records.test.mjs`
- Modify: `src/lib/schedule-order.ts`, `src/lib/schedule-order.test.mjs`

**Interfaces:**
- Produces:
  - `splitRecords<T extends { detachedAt: Date | string | null }>(trips: T[]): { active: T[]; records: T[] }` — records 는 `detachedAt` 내림차순(최근 먼저).
  - `recordBadge(ownerName: string | null, detachedAt: Date | string): string` — 날짜는 서울 기준 `M/D`.
  - `companionsLine(names: string[]): string | null` — 빈 배열이면 null.
  - `settleMovedItems(order: OrderItem[], movedIds: string[]): string[]`.

- [ ] **Step 1: 실패하는 시험 쓰기**

```js
test("splitRecords: 기록은 따로, 최근 먼저", () => {
  const a = { id: "a", detachedAt: null };
  const r1 = { id: "r1", detachedAt: "2026-11-20T03:00:00Z" };
  const r2 = { id: "r2", detachedAt: "2026-11-22T03:00:00Z" };
  assert.deepEqual(splitRecords([r1, a, r2]), { active: [a], records: [r2, r1] });
});
test("recordBadge", () => {
  assert.equal(recordBadge("민수", "2026-11-20T15:30:00Z"), "민수님 여행에서 · 11/21 떼어 냄"); // 서울 00:30
  assert.equal(recordBadge(null, "2026-11-20T03:00:00Z"), "함께한 여행에서 · 11/20 떼어 냄");
});
test("companionsLine", () => {
  assert.equal(companionsLine([]), null);
  assert.equal(companionsLine(["B"]), "B님과 함께");
  assert.equal(companionsLine(["B", "C"]), "B님, C님과 함께");
});
test("settleMovedItems: 옮겨 온 일정을 시각 순 자리에", () => {
  const order = [
    { id: "a", time: "09:00" }, { id: "b", time: null }, { id: "c", time: "18:00" },
    { id: "m1", time: "12:00:00" }, { id: "m2", time: null },
  ];
  assert.deepEqual(settleMovedItems(order, ["m1", "m2"]), ["a", "b", "m1", "c", "m2"]);
});
```

- [ ] **Step 2: `npm test` 로 실패 확인.**
- [ ] **Step 3: 구현** — `settleMovedItems` 는 `order` 에서 `movedIds` 를 뺀 나머지에 `movedIds` 순서대로 `insertByTime`. `recordBadge` 의 서울 날짜는 `Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })` 의 parts 로 만든다(같은 파일 안에서, import 없이).
- [ ] **Step 4: `npm test` 통과.**
- [ ] **Step 5: 커밋** — `feat: 떼어 낸 기록 목록·이름표·순서 함수 (#103)`.

### Task 3: 읽기 쿼리와 접근 조건 도우미

**Files:**
- Modify: `src/db/queries/trips.ts`
- Create: `src/db/queries/trip-records.ts`

**Interfaces:**
- Consumes: Task 1 스키마.
- Produces (`trips.ts`):
  - `editableTrips(userId: string): SQL` = `accessibleTrips(userId) AND trips.detached_at IS NULL`(trips 를 별칭 없이 FROM 에 둔 쿼리에서만, `accessibleTrips` 와 같은 제약).
  - `isRecordTripSql(tripId: string): SQL` = `EXISTS (SELECT 1 FROM trips r WHERE r.id = ${tripId}::uuid AND r.detached_at IS NOT NULL)`.
  - `TripRow` 에 `detachedAt`, `detachedFromTripId` 가 들어간다(칸 목록에서 빼지 않음). `TripListItem` 에 `recordOwnerName: string | null`(기록이면 `was_owner` 함께한 사람의 이름, 아니면 null).
- Produces (`trip-records.ts`):
  - `listRecordCompanions(userId: string, tripId: string): Promise<{ name: string; wasOwner: boolean }[]>` — 기록의 주인만 읽는다(`ownedTrips` + `detached_at IS NOT NULL`). 주인 먼저, 그다음 이름 순. **user id 를 돌려주지 않는다.**

- [ ] **Step 1: 구현** — `listTrips` 는 `LEFT JOIN trip_record_companions c ON c.trip_id = trips.id AND c.was_owner LEFT JOIN user o ON o.id = c.user_id` 로 `recordOwnerName`. 기존 `isOwner`·`ownerName` 은 그대로.
- [ ] **Step 2: `npm run typecheck` 통과**(`TripRow` 를 쓰는 곳이 깨지지 않는지).
- [ ] **Step 3: 커밋** — `feat: 기록 여행 읽기와 접근 조건 (#103)`.

### Task 4: 기록 여행 쓰기 조건 (보안)

**Files:**
- Modify: `src/db/queries/trips.ts`, `places.ts`, `trip-bases.ts`, `schedule-items.ts`, `budget.ts`, `trip-members.ts`
- Test: scratchpad `pglite-103.mjs` 시나리오 G

**Interfaces:**
- Consumes: `editableTrips`, `isRecordTripSql` (Task 3).
- Produces: 함수 시그니처는 바뀌지 않는다. 기록에서 막힌 쓰기는 지금처럼 0행(`false`/`null`/`"missing"`).

설계 §5.5 의 표를 함수마다 이렇게 적용한다.

| 함수 | 바꿀 조건 |
|---|---|
| `updateTrip` | `accessibleTrips` → `editableTrips` |
| `createPlace`, `updatePlace`, `deletePlace` | 여행 조건을 `editableTrips` 로(`placeInAccessibleTrip`·`placeCondition` 의 쓰기용 짝을 만든다. `listPlaces`·`countPlaces`·`findPlaceIdByGoogleId`·`setPlaceCoords` 는 그대로) |
| `setTripBase` | `editableTrips` |
| `upsertTripBudget` | `t` CTE 의 `accessibleTrips` → `editableTrips` |
| `setPersonalBudget` | 그대로(허용) |
| `createScheduleItem`, `updateScheduleItem` | `forUserAllowed` 에 `userId` 를 받아 `(NOT isRecordTripSql(tripId) OR forUserId = userId)` 를 더한다. 고치기·지우기·끝냄 대상 행에는 `(NOT isRecordTripSql(tripId) OR schedule_items.for_user_id = userId)` 를 더한다(`itemCondition` 의 쓰기용 짝 `writableItemCondition`). |
| `createScheduleItemWithNewPlace`, `updateScheduleItemWithNewPlace` | 여행 조건을 `editableTrips` 로(기록에서 새 장소 만들기 막음, 설계 §5.5) |
| `setScheduleItemDone`, `deleteScheduleItem` | `writableItemCondition` |
| `writeDayOrder`, `listDayOrder` | 그대로(순서 쓰기 허용) |
| `setScheduleItemAmounts`, `setScheduleItemActual`, `createExtraItem` | `${owner}::text IS NOT NULL OR NOT ${isRecordTripSql(tripId)}` 를 쓰기 문 조건에 더한다(기록에서 모임 쪽 쓰기 막음). 지우기 분기도 같게. |
| `updateExtraItem`, `deleteExtraItem` | `(b.owner_user_id IS NOT NULL OR NOT ${isRecordTripSql(tripId)})` |
| `setInviteTokenHash` | 조건에 `trips.detached_at IS NULL` |
| `joinTrip` | `t.detached_at IS NULL`(Task 6 에서 다시 고친다) |
| `deleteTrip`, `getTrip`, 읽기 함수 | 그대로 |

- [ ] **Step 1: 시나리오 G 쓰기(실패 확인용)** — 하네스에서 사용자 A·B, 원래 여행 T(주인 B), A 가 주인인 기록 R(`detached_at = now()`)에 모두 일정 S(사본), A 나만 일정 M, 장소 P, `trip_budgets`, 모임 지출 행 G, A 내 돈 행 Y 를 직접 넣는다. 앱 쿼리 함수를 A 로 부른다: `updateTrip`, `createPlace`, `updatePlace(P)`, `deletePlace(P)`, `setTripBase`, `upsertTripBudget`, `createScheduleItem({forUserId:null})`, `updateScheduleItem(S)`, `setScheduleItemDone(S)`, `deleteScheduleItem(S)`, `createScheduleItemWithNewPlace`, `setScheduleItemAmounts(S,"shared")`, `createExtraItem("shared")`, `updateExtraItem(G)`, `deleteExtraItem(G)`, `setInviteTokenHash(R)` 는 모두 0행이고 행이 그대로, `createScheduleItem({forUserId:A})`, `updateScheduleItem(M)`, `setScheduleItemDone(M)`, `setScheduleItemAmounts(S,"mine")`, `updateExtraItem(Y)`, `setPersonalBudget`, `writeDayOrder` 는 성공. 같은 함수를 보통 여행 T 에서 B 로 부르면 지금처럼 성공(회귀 없음).
- [ ] **Step 2: 하네스 실행 → 막아야 할 쓰기가 통과해 실패 확인.**
- [ ] **Step 3: 표대로 구현.** 각 함수 주석에 "기록 여행(#103)에서는 …" 한 줄.
- [ ] **Step 4: 하네스 시나리오 G 통과, `npm run typecheck`·`npm test` 통과.**
- [ ] **Step 5: 커밋** — `feat: 기록 여행의 사본 쓰기 막기 (#103)`.

### Task 5: 떼기 (나가기·내보내기·여행 지우기)

**Files:**
- Modify: `src/db/queries/trip-records.ts`, `src/db/queries/trip-members.ts`, `src/db/queries/trips.ts`
- Test: 하네스 시나리오 A·B·C

**Interfaces:**
- Consumes: Task 1 스키마.
- Produces:
  - `detachMembersCtes(memberCondition: SQL): SQL` — `removed AS (DELETE FROM trip_members WHERE ${memberCondition} RETURNING trip_id, user_id)` 로 시작하는 CTE 목록(앞에 `WITH` 를 붙이지 않음). 마지막 CTE 이름은 `removed`, `records`(새 기록 `id, user_id, from_trip_id`)를 뒤 문이 쓸 수 있다.
  - `leaveTrip`, `removeMember` 시그니처·반환 그대로(멤버 행을 지웠으면 true). `removeMemberAndPrivateRows` 는 지운다.
  - `deleteTrip` 시그니처 그대로. 같은 문에서 그 여행 멤버 모두를 떼고 여행을 지운다.

CTE 순서(설계 §5.3 번호). 모두 `removed`/`records` 에 이어져, 지운 멤버 행이 없으면 아무것도 바뀌지 않는다.
1. `records`: `INSERT INTO trips (user_id, title, destination, start_date, end_date, notes, country_code, detached_from_trip_id, detached_at) SELECT r.user_id, t.… , t.id, now() FROM removed r JOIN trips t ON t.id = r.trip_id RETURNING id, user_id, detached_from_trip_id AS from_trip_id`.
2. `companions`: `INSERT … SELECT rec.id, t.user_id, true FROM records rec JOIN trips t ON t.id = rec.from_trip_id UNION ALL SELECT rec.id, m.user_id, false FROM records rec JOIN trip_members m ON m.trip_id = rec.from_trip_id AND m.user_id <> rec.user_id`(스냅숏이라 같은 문에서 지운 멤버도 보인다 — 여행 지우기에서 서로를 적는다).
3. `new_places`: `INSERT INTO places (…) SELECT rec.id, p.google_place_id, p.label, p.lat, p.lng, p.coords_fetched_at, p.category, p.memo FROM records rec JOIN places p ON p.trip_id = rec.from_trip_id RETURNING id, trip_id, google_place_id`.
4. `new_bases`: 기준점 복사, 장소는 `old_place.google_place_id = new_places.google_place_id AND new_places.trip_id = rec.id` 로.
5. `new_budget`: `trip_budgets` 복사.
6. `new_items`: 모두 일정(`for_user_id IS NULL`) 복사, `copied_from_id = s.id`, `place_id` 는 4번처럼, `position`·`done` 복사. `RETURNING id, trip_id, copied_from_id`.
7. `kept_on_mine`: 나간 사람 나만 일정에 붙은 **남의** 금액(`owner_user_id IS NULL OR owner_user_id <> rec.user_id`)을 T 에 일정 밖 지출로(`deleteScheduleItem` 의 `moved` 와 같은 제목·날짜 규칙, `EXTRA_TITLE_MAX`). `moved_mine`: 그 나만 일정을 `trip_id = rec.id`, `place_id` = 사본 장소로 UPDATE.
8. `moved_money`: `owner_user_id = rec.user_id` 인 행을 한 UPDATE 로 `trip_id = rec.id`. `schedule_item_id` 는 CASE — 모두 일정이면 `new_items.id`(copied_from_id 로), 나간 사람 나만 일정이면 그대로, 남의 나만 일정이면 NULL + 제목·날짜 채우기.
9. `copied_shared_money`: 모임 지출(`owner_user_id IS NULL`) 복사. 모두 일정에 붙은 것은 사본 일정에, 나간 사람 나만 일정에 붙은 것은 그 일정(같은 id, 이제 기록에 있음)에, 남의 나만 일정에 붙은 것은 일정 밖 지출로. 일정 밖 지출은 그대로.
10. `moved_budget`: `trip_personal_budgets` 를 `trip_id = rec.id`.

`deleteTrip`: `WITH ${detachMembersCtes(sql\`trip_members.trip_id = ${tripId}::uuid AND trip_members.trip_id IN (SELECT id FROM trips WHERE ${ownedTrips(userId)})\`)}, gone AS (DELETE FROM trips WHERE id = ${tripId}::uuid AND ${ownedTrips(userId)} RETURNING id) SELECT id FROM gone`. 옮긴 행이 문 끝 cascade 에 걸리지 않는 까닭을 `deleteScheduleItem` 주석처럼 적는다.

- [ ] **Step 1: 하네스 시나리오 쓰기**
  - A(나가기): T(주인 B, 멤버 A·C)에 장소 2, 기준점 1, 예산 설정, 모두 일정 2(하나에 모임 지출과 A 내 돈), A 나만 일정 1(A 내 돈), C 나만 일정 1(A 내 돈 = "남의 나만 일정의 내 돈"), A 일정 밖 내 돈 1, A 내 예산. `leaveTrip(A, T)` 뒤: A 의 기록 R 1개(`detached_from_trip_id = T`), R 에 장소 2·기준점 1·예산 설정·모두 일정 사본 2(`copied_from_id` 맞음)·A 나만 일정(원래 id)·모임 지출 사본·A 내 돈 4행(모두 일정 사본에 1, 나만 일정에 1, 일정 밖 2 — 그중 하나는 C 일정에서 바뀐 것, 제목 = C 일정 제목)·A 내 예산, 함께한 사람 B(was_owner)·C. T 에는 A 나만 일정·A 내 돈·A 내 예산·A 멤버 행이 없고, 나머지는 행 수·값이 그대로.
  - B: A 나만 일정에 모임 지출과 C 내 돈이 붙은 경우 → `leaveTrip` 뒤 T 에 그 둘이 일정 밖 지출(제목 = 그 일정 제목, 날짜 = 일정 날짜)로 남고 금액 그대로, R 에 모임 지출 사본이 A 나만 일정에 붙어 있음.
  - C: 멤버 A·C 가 있는 T 를 B 가 `deleteTrip` → A·C 각자 기록 1개, 각 기록의 함께한 사람 = B(was_owner)+상대, T 없음, 기록의 `detached_from_trip_id` null, 옮긴 행이 지워지지 않음.
  - 자격: C 가 `removeMember(C, T, A)` → false, 아무것도 안 바뀜. B 가 남의 여행 id 로 `removeMember` → false.
- [ ] **Step 2: 하네스 실행 → 실패 확인.**
- [ ] **Step 3: 구현.** `trip-records.ts` 상단 주석에 설계 §5.3 번호와 "한 행을 두 CTE 가 쓰지 않음"의 분할(나간 사람 것 / 나간 사람 나만 일정의 남의 것)을 적는다. 동시성 창(설계 §6)을 `removeMemberAndPrivateRows` 주석 수준으로 적는다.
- [ ] **Step 4: 하네스 A·B·C·G 통과, typecheck·lint 통과.**
- [ ] **Step 5: 커밋** — `feat: 나가면 떼어 낸 기록으로 남기 (#103)`.

### Task 6: 붙이기 (다시 참여)

**Files:**
- Modify: `src/db/queries/trip-records.ts`, `src/db/queries/trip-members.ts`, `src/app/invite/actions.ts`, `src/db/queries/schedule-items.ts`
- Test: 하네스 시나리오 D·E·F

**Interfaces:**
- Consumes: `settleMovedItems` (Task 2), `listDayOrder`, `writeDayOrder`.
- Produces:
  - `joinTrip(userId: string, hash: string): Promise<{ tripId: string; reattachedRecordId: string | null; movedItems: { id: string; date: string; time: string | null }[] } | null>` — 실패면 null(지금과 같은 경우들). 부르는 곳은 `joinTripAction` 하나.
  - `currencyFitsSql(recordAlias: string, targetTripId: SQL, userId: string): SQL` — 기록의 그 사람 내 돈 행 통화가 모두 대상 여행의 예산·현지 통화 안인가(설계 §5.4). 대상에 예산 설정이 없는데 금액 행이 있으면 false.
  - `getReattachPreview(userId: string, tripId: string): Promise<{ reattach: boolean; blocked: boolean }>` (`trip-records.ts`) — 이 사람이 `tripId` 에서 떼어 낸 기록 가운데 붙을 수 있는 게 있는지(`reattach`), 통화 때문에 붙지 않는 게 있는지(`blocked`). `currencyFitsSql` 을 같이 쓴다. 기록이 없으면 둘 다 false. 초대 화면(Task 8)이 쓴다.

한 문 구성: `joined`(지금 INSERT, `RETURNING trip_id, user_id`) → `rec`(그 사람 기록 중 `detached_from_trip_id = joined.trip_id` 이고 `currencyFitsSql` 인 것 가운데 `detached_at` 가장 최근 **하나**, Review Focus 4) → `back_items`(기록의 `for_user_id = userId` 일정을 T 로, `place_id` = T 에서 같은 `google_place_id` 장소 또는 NULL, `position = NULL`, `RETURNING id, date, time`) → `back_money`(그 사람 내 돈을 T 로. 사본 일정에 붙은 것은 원래 일정이 T 에 있고 T 에 그 일정·그 사람 행이 없을 때만 원래 일정으로, 아니면 일정 밖 지출로(Review Focus 3). 나만 일정에 붙은 것은 그대로) → `back_budget`(내 예산, T 에 행이 없을 때만) → `gone_record`(`DELETE FROM trips WHERE id IN rec`) → `SELECT`. 기록 사본·함께한 사람은 cascade.

- [ ] **Step 1: 하네스 시나리오 쓰기**
  - D: 시나리오 A 뒤 A 가 기록에서 나만 일정 하나를 더 만들고 내 돈을 고친 다음, B 가 모두 일정 하나(A 내 돈이 붙었던 것)를 지우고 장소 하나를 지움. `joinTrip(A, hash)` → 멤버, 기록 없음, A 나만 일정 2개가 T 에 있고 지운 장소를 가리키던 일정은 `place_id` null·`place` 글자 남음, 지운 일정에 붙었던 A 내 돈은 일정 밖 지출(시안 7번), 남은 모두 일정의 A 내 돈은 원래 일정에, 고친 금액 그대로, 내 예산 돌아옴, `movedItems` 2개.
  - D2(통화): 시나리오 A 뒤 B 가 T 의 예산 통화를 바꿈 → `joinTrip` 성공, 기록 그대로, `reattachedRecordId` null, `getReattachPreview` = `{reattach:false, blocked:true}`.
  - E: 기록이 있는데 T 에 A 의 내 돈이 이미 같은 원래 일정에 있음(직접 넣음) → 참여 성공, 기록의 그 행은 일정 밖 지출로.
  - F: A 기록 둘(같은 T) → 참여 뒤 최근 하나만 붙고 하나는 남음.
  - 자격: 틀린 해시 → null, 아무것도 안 바뀜. 기록 여행의 해시(옛 배포에서 생긴 것)로 참여 → null.
- [ ] **Step 2: 하네스 실행 → 실패 확인.**
- [ ] **Step 3: 구현.** `joinTripAction` 은 성공 뒤 `movedItems` 의 날짜마다 `listDayOrder` → `settleMovedItems` → `writeDayOrder`(실패는 지금 `settleDayOrder` 처럼 경고만), `revalidatePath("/trips")`·`/trips/${tripId}`.
- [ ] **Step 4: 하네스 전 시나리오 통과, typecheck·lint·test 통과.**
- [ ] **Step 5: 커밋** — `feat: 다시 참여하면 떼어 낸 기록 붙이기 (#103)`.

### Task 7: 목록과 기록 화면

**Files:**
- Modify: `src/app/trips/page.tsx`, `src/app/trips/[id]/page.tsx`, `src/app/trips/[id]/edit/page.tsx`, `src/app/trips/delete-trip-button.tsx`
- Modify: `src/app/trips/[id]/members-section.tsx`, `map-section.tsx`(와 장소·기준점 칸), `schedule-section.tsx`·`schedule-editor.tsx`·`schedule-day-items.tsx`·`schedule-item-form.tsx`, `budget-section.tsx`·`budget-card.tsx`·`budget-dock.tsx`·`budget-forms.tsx`

**Interfaces:**
- Consumes: `splitRecords`, `recordBadge`, `companionsLine` (Task 2), `TripListItem.recordOwnerName`, `TripRow.detachedAt` (Task 3), `listRecordCompanions` (Task 3).
- Produces: 화면 섹션에 넘기는 `record: boolean` prop(`trip.detachedAt !== null`). 섹션 안에서 쓰는 이름은 자유.

- [ ] **Step 1: 목록** — `TripList` 가 `splitRecords` 로 나눈 뒤 active 를 지금처럼 `splitTrips`, records 를 "떼어 낸 기록" 칸(맨 아래)으로. 기록 줄은 이름표 `recordBadge(recordOwnerName, detachedAt)`(지금 "OO님의 여행" 이름표 자리), 미니 노선 `dim`, 남은 날 글자 없음.
- [ ] **Step 2: 기록 화면 머리** — 기록이면: "고치기" 링크 대신 아무것도 없음, 지우기 버튼 글자 "기록 지우기"·확인 문구 "이 기록을 지울까요? 지우면 되돌릴 수 없어요.", 제목 아래 안내 띠(`bg-warn-surface`): "떼어 낸 기록 · {owner}님의 여행에서 {M월 D일}에 떼어 냈어요. 함께 쓰던 일정, 장소, 모임 지출은 그날 모습 그대로 보기만 할 수 있어요."(owner 없으면 "함께한 여행에서"), 그 아래 `companionsLine`. `MembersSection` 은 그리지 않는다. `edit/page.tsx` 는 기록이면 `notFound()`.
- [ ] **Step 3: 장소·기준점** — 기록이면 장소 넣기 양식, 장소 고치기·지우기, 기준점 정하기를 그리지 않는다(지도와 목록 보기는 그대로).
- [ ] **Step 4: 일정** — 기록이면: "누구" 칸 없음(새 일정은 서버가 나로 정함 — 양식이 `forUserId` 에 본인 id 를 hidden 으로 보낸다), 모두 일정 줄의 고치기·지우기·끝냄 없음, 일정 양식의 Google 장소 검색 대신 이 기록의 장소 고르기와 글자 장소만, 끌어 옮기기는 그대로. 나만 일정은 지금처럼 고치고 지운다.
- [ ] **Step 5: 예산** — 기록이면: 예산 설정 양식·모임 예산 정하기 없음, 모임 지출의 고치기·지우기 없음, 새 지출과 일정 금액 칸은 내 돈 쪽만(`sides` = `mine`), 내 예산 정하기는 그대로.
- [ ] **Step 6: typecheck·lint 통과, 커밋** — `feat: 떼어 낸 기록 목록과 화면 (#103)`.

### Task 8: 확인 창과 초대 화면 문구

**Files:**
- Modify: `src/app/trips/[id]/member-buttons.tsx`, `src/app/trips/delete-trip-button.tsx`, `src/app/invite/[token]/page.tsx`

**Interfaces:**
- Consumes: `getReattachPreview` (Task 6).

- [ ] **Step 1: 문구 바꾸기** (설계 §5.6, 시안 2·6번)
  - 나가기: "이 여행에서 나갈까요? 이 여행의 기록은 내 여행 목록의 '떼어 낸 기록'으로 남아요. 내 일정, 내 돈, 내 예산은 그대로 고칠 수 있고, 함께 쓰던 일정과 모임 지출은 지금 모습 그대로 보기만 할 수 있어요. 다시 초대받아 들어오면 원래 자리로 돌아가요."
  - 내보내기: "{name}님을 내보낼까요? 링크가 켜져 있으면 다시 들어올 수 있어요. 막으려면 새 링크를 만드세요. {name}님의 일정과 지출은 {name}님 계정에 떼어 낸 기록으로 남아요."
  - 여행 지우기(보통 여행, 멤버가 있을 수 있음): "정말 삭제할까요? 함께하는 사람들에게는 각자 기록이 남아요." (멤버 수를 몰라도 되는 문구)
  - 초대 화면: `getReattachPreview` 가 `reattach` 면 "전에 이 여행에서 떼어 낸 기록이 있어요. 참여하면 내 일정과 내 돈이 원래 자리로 돌아가고, 떼어 낸 기록은 목록에서 없어져요.", `blocked` 만이면 "전에 이 여행에서 떼어 낸 기록이 있어요. 그 사이 예산 통화가 바뀌어 기록은 다시 붙지 않고 내 여행 목록에 따로 남아요.", 둘 다면 앞 문장 뒤에 "통화가 바뀐 기록은 따로 남아요."
- [ ] **Step 2: lint·typecheck 통과, 커밋** — `feat: 나가기·초대 문구에 떼어 낸 기록 안내 (#103)`.

### Task 9: 브라우저 확인, 리뷰, 문서

**Files:**
- Modify: `docs/status.md`, `CLAUDE.md` 는 건드리지 않음
- PR 본문(#123)

- [ ] **Step 1: 브라우저 확인** — `run` 스킬로 dev 서버, 임시 테스트 계정 둘(`docs/status.md` '로그인한 화면의 브라우저 확인', 넣기·지우기 SQL 전문을 보이고 사용자 확인). 주의: 이 확인은 **마이그레이션을 프로덕션에 적용한 뒤에만** 가능하다(세션 DB = 프로덕션). 그래서 순서는 Task 1–8 → PR 갱신·사람 승인·`db:migrate` → 이 단계. 시안 1–7번 흐름과 기록 안에서 모두 일정 줄에 고치기 버튼이 없음, `page.route` 로 사본 고치기 요청을 직접 보내 실패(`docs/status.md` '소유권 브라우저 확인'). 끝나면 테스트 계정과 생긴 기록 여행을 지운다.
- [ ] **Step 2: `/code-review`, `/security-review`** — 떼기·붙이기 SQL, Task 4 표, 참여 쿼리.
- [ ] **Step 3: PR 본문** — 맨 위 "사람 확인 필요"(마이그레이션·소유권 코드), 마이그레이션 SQL 전문, 파괴적 아님 판정, "옛 코드와 새 DB" 두 경우(설계 §5.2 판정 복사), 설계에서 좁힌 것(붙이기는 가장 최근 기록 하나, Review Focus 4), 남은 지적.
- [ ] **Step 4: `docs/status.md`** — '알아 둘 것' 쿼리 구조에 `editableTrips`·기록 쓰기 조건 한 줄, `trip-records.ts` 떼기·붙이기 위치 한 줄. '다음 할 일' 갱신은 머지·배포 확인 뒤. #120 에 "옛 '나간 사람' 이름표 코드(`listScheduleForUserNames`, '이름 (나감)')는 #103 뒤 새로 생기지 않음 — 정리 후보"를 PR 링크와 더한다(설계 §5.6).
- [ ] **Step 5: 커밋·push.**
