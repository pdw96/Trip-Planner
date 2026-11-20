# 일정 순서 끌어서 바꾸기 (#41) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하루 안에서 일정 줄을 손잡이로 끌어 순서를 바꾸고, 시각 있는 일정끼리는 늘 시각 순서를 지킨다.

**Architecture:** `schedule_items.position`(nullable integer)에 그날 순서를 저장하고, 순서에 영향을 주는 쓰기는 그날 전체를 0..n-1 로 한 문에 다시 쓴다. 규칙은 순수 모듈 `src/lib/schedule-order.ts` 하나에 두고 서버 검증과 브라우저 끌기 판정이 함께 쓴다. 화면은 `@dnd-kit` sortable + `useOptimistic`.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + neon-http, `@dnd-kit/core` 6.3, `@dnd-kit/sortable` 10, `@dnd-kit/utilities`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-schedule-reorder-design.md`

## Global Constraints

- 정렬: `date ASC, position ASC NULLS LAST, time ASC NULLS LAST, created_at ASC, id ASC` — `listScheduleItems` 와 `compareScheduleItems` 가 같아야 한다.
- 마이그레이션은 `npm run db:generate` 결과 그대로(손으로 고치지 않음), 예상 SQL `ALTER TABLE "schedule_items" ADD COLUMN "position" integer;`.
- 위험 경로(`src/db/schema.ts`, `drizzle/**`, `package.json`, `package-lock.json`)는 Task 2·4 에서 끝내고 PR 승인 뒤 다시 바꾸지 않는다.
- 모든 쿼리는 `inAccessibleTrip(userId, tripId)` 조건을 같은 문 안에 둔다. Server Action 순서: `getCurrentUser()` → 필드별 검증 → 범위 좁힌 쿼리 → `revalidatePath`.
- 순수 모듈은 다른 모듈을 import 하지 않는다.
- 문구(정확히): `"순서를 저장하지 못했어요. 다시 해 주세요."`, `"시각 순서대로만 옮길 수 있어요"`, 손잡이 `aria-label` `"{이름} 순서 옮기기"`. 문구 표시 4초(`ERROR_VISIBLE_MS`).
- reorder 입력: `orderedIds` 길이 1–200, 모두 uuid, 중복 없음.

## Review Focus

1. 같은 시각 두 일정(12:00, 12:00) — 서로 바꿀 수 있어야 한다 → Task 1 `keepsTimeOrder allows equal times`.
2. DB 의 `"HH:MM:SS"` 와 화면의 `"HH:MM"` 이 섞여 비교됨 — 같은 시각으로 봐야 한다 → Task 1 `orderWithItem treats HH:MM and HH:MM:SS as equal`.
3. 다른 창에서 그 사이 일정을 넣거나 지운 뒤 끌어 놓기 — 저장 거절, 서버 값으로 새로 고침 → Task 1 `isReorderOf rejects missing/extra/duplicate`, Task 5 브라우저 확인.
4. 손대지 않은 날(모두 NULL)에서 시각 지우기 — 그 자리 그대로(맨 뒤로 가지 않음) → Task 1 `orderWithItem keeps place when time removed` + Task 3 이 그 결과를 늘 쓴다.
5. 저장이 끝나기 전 이동 시간 줄 — 감춘다 → Task 4 Step 확인 항목, Task 5 브라우저 확인.

---

### Task 1: 순서 규칙 순수 모듈 + 정렬

**Files:**
- Create: `src/lib/schedule-order.ts`, `src/lib/schedule-order.test.mjs`
- Modify: `src/lib/schedule.ts` (`SortableItem`, `compareScheduleItems`), `src/lib/schedule.test.mjs`

**Interfaces:**
- Produces:
  - `type OrderItem = { id: string; time: string | null }` — time 은 `"HH:MM"` 또는 `"HH:MM:SS"`, 비교는 앞 5글자.
  - `keepsTimeOrder(items: OrderItem[]): boolean`
  - `insertByTime(order: OrderItem[], item: OrderItem): OrderItem[]` — 시각 없음 → 맨 뒤; 시각 있음 → 시각이 더 늦은 첫 일정 바로 앞, 없으면 맨 뒤. 새 배열.
  - `orderWithItem(before: OrderItem[], item: OrderItem): string[] | null` — `before` 는 쓰기 전 그날 순서. item 이 before 에 없으면 `insertByTime`. 있으면: 시각이 같으면(앞 5글자) null; 새 시각 null 이면 그 자리; 새 시각으로 바꿔 `keepsTimeOrder` 면 그 자리; 아니면 빼고 `insertByTime`. 결과는 id 목록.
  - `isReorderOf(ids: string[], current: string[]): boolean` — 중복 없음, 길이 같음, 같은 집합.
  - `SortableItem` 에 `position: number | null` 추가.

- [ ] **Step 1: 실패하는 시험 작성** (`schedule-order.test.mjs`, `./schedule-order.ts` import)

```js
const o = (id, time = null) => ({ id, time });
test("keepsTimeOrder allows untimed anywhere", () =>
  assert.equal(keepsTimeOrder([o("a"), o("b", "09:30"), o("c"), o("d", "18:00")]), true));
test("keepsTimeOrder rejects later above earlier", () =>
  assert.equal(keepsTimeOrder([o("a", "10:00"), o("b"), o("c", "09:00")]), false));
test("keepsTimeOrder allows equal times", () =>
  assert.equal(keepsTimeOrder([o("a", "12:00"), o("b", "12:00:00")]), true));
const day = [o("g", "09:30:00"), o("i"), o("b"), o("r", "18:00:00")];
test("insertByTime puts untimed last", () =>
  assert.deepEqual(insertByTime(day, o("n")).map((x) => x.id), ["g", "i", "b", "r", "n"]));
test("insertByTime puts timed right before next later item", () =>
  assert.deepEqual(insertByTime(day, o("n", "12:00")).map((x) => x.id), ["g", "i", "b", "n", "r"]));
test("insertByTime goes after equal times", () =>
  assert.deepEqual(insertByTime(day, o("n", "09:30")).map((x) => x.id), ["g", "i", "b", "n", "r"]));
test("insertByTime with no later item goes last", () =>
  assert.deepEqual(insertByTime(day, o("n", "20:00")).map((x) => x.id), ["g", "i", "b", "r", "n"]));
test("orderWithItem new item uses insertByTime", () =>
  assert.deepEqual(orderWithItem(day, o("n", "12:00")), ["g", "i", "b", "n", "r"]));
test("orderWithItem returns null when time unchanged", () =>
  assert.equal(orderWithItem(day, o("g", "09:30")), null));
test("orderWithItem treats HH:MM and HH:MM:SS as equal", () =>
  assert.equal(orderWithItem([o("a", "09:30:00")], o("a", "09:30")), null));
test("orderWithItem keeps place when time removed", () =>
  assert.deepEqual(orderWithItem(day, o("g", null)), ["g", "i", "b", "r"]));
test("orderWithItem keeps place when new time still fits", () =>
  assert.deepEqual(orderWithItem(day, o("b", "12:00")), ["g", "i", "b", "r"]));
test("orderWithItem reinserts when new time breaks order", () =>
  assert.deepEqual(orderWithItem(day, o("g", "19:00")), ["i", "b", "r", "g"]));
test("isReorderOf accepts permutation", () => assert.equal(isReorderOf(["b", "a"], ["a", "b"]), true));
test("isReorderOf rejects missing/extra/duplicate", () => {
  assert.equal(isReorderOf(["a"], ["a", "b"]), false);
  assert.equal(isReorderOf(["a", "b", "c"], ["a", "b"]), false);
  assert.equal(isReorderOf(["a", "a"], ["a", "b"]), false);
});
```

`schedule.test.mjs`: `item()` 헬퍼에 `position = null` 인자를 더하고 시험 추가:

```js
test("compareScheduleItems uses position before time", () =>
  assert.deepEqual(sorted([item("t", D, "09:00:00", at(0), 1), item("u", D, null, at(0), 0)]), ["u", "t"]));
test("compareScheduleItems puts null position last within a day", () =>
  assert.deepEqual(sorted([item("n", D, "08:00:00", at(0), null), item("p", D, null, at(0), 0)]), ["p", "n"]));
```

- [ ] **Step 2: 실패 확인** — `node --test 'src/lib/schedule-order.test.mjs' 'src/lib/schedule.test.mjs'` → 모듈 없음 / position 시험 FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces 대로. `compareScheduleItems` 는 날짜 다음에 position(둘 다 값이면 작은 쪽, 한쪽만 null 이면 null 이 뒤), 그 뒤 지금 규칙.
- [ ] **Step 4: 통과 확인** — `node --test 'src/**/*.test.mjs'` 전부 PASS.
- [ ] **Step 5: 커밋** — `feat: 일정 순서 규칙 순수 모듈 (#41)`

### Task 2: 스키마·마이그레이션·쿼리

**Files:**
- Modify: `src/db/schema.ts` (scheduleItems 에 `position: integer("position")` + 설계 §5.1 주석), `src/db/queries/schedule-items.ts`
- Create: `drizzle/0005_*.sql`, `drizzle/meta/0005_snapshot.json`, `_journal.json` 갱신(생성기 결과)

**Interfaces:**
- Consumes: `OrderItem` (Task 1)
- Produces:
  - `listDayOrder(userId: string, tripId: string, date: string): Promise<OrderItem[]>` — 그날 일정 id·time 을 전역 정렬로. id·날짜 형식이 틀리면 `[]`.
  - `writeDayOrder(userId: string, tripId: string, date: string, orderedIds: string[]): Promise<boolean>` — 한 문 `UPDATE … FROM (VALUES …)`, 범위 조건 + `date = $date`, 바뀐 행 수 === 길이면 true. 빈 목록·형식 오류면 false. `updated_at` 은 건드리지 않는다(`$onUpdate` 가 붙으므로 `db.execute(sql…)` 로 쓴다).

- [ ] **Step 1:** schema 에 열 추가 → `npm run db:generate` → 생성된 SQL 이 위 예상과 같은지 `cat drizzle/0005_*.sql` 로 확인.
- [ ] **Step 2:** `listScheduleItems` 정렬에 `sql\`${scheduleItems.position} asc nulls last\`` 를 date 다음에. `createScheduleItem` 장소 경로 `insert … select` 에 `position: sql<number | null>\`null::integer\`.as("position")` 를 테이블 정의 순서 자리에.
- [ ] **Step 3:** `listDayOrder`, `writeDayOrder` 구현.
- [ ] **Step 4:** `npm run lint && npm run typecheck` 통과. (DB 에 열이 없으므로 실행 확인은 Task 5.)
- [ ] **Step 5: 커밋** — `feat: schedule_items.position 열과 하루 순서 쿼리 (#41)`

### Task 3: Server Action

**Files:**
- Modify: `src/app/trips/schedule-actions.ts`, `src/app/trips/messages.ts`

**Interfaces:**
- Consumes: `listDayOrder`, `writeDayOrder` (Task 2), `orderWithItem`, `isReorderOf`, `keepsTimeOrder` (Task 1)
- Produces:
  - `reorderScheduleItemsAction(tripId: string, date: string, orderedIds: string[]): Promise<{ ok: boolean }>`
  - `messages.ts`: `ORDER_SAVE_FAILED = "순서를 저장하지 못했어요. 다시 해 주세요."`, `ORDER_TIME_RULE = "시각 순서대로만 옮길 수 있어요"`

- [ ] **Step 1:** `reorderScheduleItemsAction` — 설계 §5.4 순서. `date` 는 `isValidIsoDate`(trip-input), `orderedIds` 는 배열·문자열·1–200·uuid·중복 없음. `listDayOrder` → `isReorderOf` && `keepsTimeOrder` → `writeDayOrder`. 성공 시만 `revalidatePath`. 모든 실패·예외 `{ ok: false }`.
- [ ] **Step 2:** 넣기·고치기 뒤 자리. 내부 도우미 `settleDayOrder(userId, tripId, date, before: OrderItem[] | null, item: OrderItem): Promise<void>` — before 가 null 이거나 `orderWithItem` 이 null 이면 아무것도 안 함; `writeDayOrder` 실패·예외는 `console.warn("[schedule-order] …")`(id 없이 한 줄)만.
  - create: 검증 뒤 쓰기 **전** `listDayOrder(…, parsed.value.date)`(예외면 null). 콜백에서 새 id 를 지역 변수에 담고, 성공(`written`) 뒤 `settleDayOrder(…, { id: newId, time: parsed.value.time })`.
  - update: 검증 뒤 쓰기 전 `listDayOrder(…, parsed.value.date)`, 성공 뒤 `settleDayOrder(…, { id: itemId, time: parsed.value.time })`. (날짜를 옮기면 before 에 item 이 없어 insertByTime, 같은 날이면 고치기 전 자리 기준.)
  - `revalidatePath` 는 settle 뒤에 한 번.
- [ ] **Step 3:** `npm run lint && npm run typecheck` 통과.
- [ ] **Step 4: 커밋** — `feat: 일정 순서 저장 Server Action, 넣기·고치기 뒤 자리 (#41)`

### Task 4: 끌기 화면 (의존성 포함)

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3`)
- Modify: `src/app/trips/[id]/schedule-day-items.tsx`, `src/app/trips/[id]/schedule-editor.tsx` (`ScheduleItemRow` 손잡이), `src/app/trips/[id]/schedule-section.tsx` (기간 밖 묶음도 `ScheduleDayItems` 로)

**Interfaces:**
- Consumes: `reorderScheduleItemsAction`, `ORDER_SAVE_FAILED`, `ORDER_TIME_RULE` (Task 3), `keepsTimeOrder` (Task 1)
- Produces: `ScheduleDayItems` props 에 `date: string` 추가, `travel: DayTravel | null` 은 그대로(기간 밖은 null). `ScheduleItemRow` 에 `sortable: boolean` prop.

- [ ] **Step 1:** 의존성 설치, `package.json` 에 세 줄만 늘었는지 `git diff package.json`.
- [ ] **Step 2:** `ScheduleDayItems` — `DndContext`(고정 `id`, `PointerSensor` 짧은 거리 + `KeyboardSensor`/`sortableKeyboardCoordinates`, 한국어 `accessibility.announcements`·`screenReaderInstructions`) + `SortableContext`(verticalListSortingStrategy). 순서는 `useOptimistic(items)`. `onDragEnd`: `arrayMove` 결과가 `keepsTimeOrder`(RowItem 의 `""` → null) 아니면 되돌리고 `ORDER_TIME_RULE` 4초; 맞으면 전환 안에서 낙관 순서 → `reorderScheduleItemsAction`(reject 도 실패), 실패면 `ORDER_SAVE_FAILED` 4초 + `router.refresh()`.
- [ ] **Step 3:** 이동 줄은 끄는 중(`onDragStart`~`End/Cancel`)과 낙관 순서 ≠ props 순서일 때 감춘다. `<Fragment key={item.id}>` 유지.
- [ ] **Step 4:** `ScheduleItemRow` — `useSortable({ id, disabled: !sortable })`, `li` 에 ref·transform, 맨 왼쪽 손잡이 버튼 ⠿(`touch-action: none`, 약 44px 높이, `aria-label={\`${name} 순서 옮기기\`}`, listeners·attributes 는 손잡이에만). `sortable` 은 그날 일정 2개 이상일 때. 입력칸으로 열린 줄은 손잡이 없음.
- [ ] **Step 5:** 기간 밖 묶음을 `ScheduleDayItems`(travel null, dateOptions = 그 날짜 + dayOptions)로.
- [ ] **Step 6:** `npm run lint && npm run typecheck && npm run build`, `node --test 'src/**/*.test.mjs'` 통과.
- [ ] **Step 7: 커밋** — `feat: 일정 줄 손잡이로 끌어 순서 바꾸기 (#41)`

### Task 5: PR · 마이그레이션 · 브라우저 확인 · 리뷰

- [ ] **Step 1:** push, PR #47 본문을 "사람 확인 필요"(위험 경로·이유), SQL 전문, 비파괴 판정, `Closes #41` 로 바꾼다. 사람에게 `human-approved` 요청.
- [ ] **Step 2:** 라벨 뒤 `npm run db:migrate` (실행 직전 사람 확인). Neon MCP 로 `position` 열 확인.
- [ ] **Step 3:** 테스트 계정 A·B(SQL 전문 보이고 확인) + `npm run dev` + Playwright: 마우스 끌기·시각 순서 거절·키보드(Space/↑↓/Space)·390px 터치 너비·새 일정 자리(시각 있음/없음)·시각 지우기·날짜 옮기기·기간 밖 끌기·실패 되돌리기(`page.route` 로 `next-action` 요청 실패)·A 가 B 의 일정 id 섞어 보냄 → 실패, B 행 그대로·이동 줄이 새 순서로 다시 뜸·지도 N일차 순서. 끝나면 테스트 행 삭제.
- [ ] **Step 4:** `/code-review`, `/security-review`. 막는 지적 0건까지(위험 경로 밖에서 고침).
- [ ] **Step 5:** draft 해제, 자동 머지(squash). 배포 확인 뒤 `docs/status.md` 갱신 PR.
