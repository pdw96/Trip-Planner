# 사람별 일정과 내 동선 (#90) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정마다 "누구"(모두 / 한 사람)를 두고, 지도·이동 시간·N일차 동선을 보는 사람의 동선(모두 + 나만)으로 그린다.

**Architecture:** `schedule_items.for_user_id`(null = 모두) 칸 하나를 더한다(마이그레이션 0009). 동선은 순수 함수 `routeItemsFor` 로 거른 뒤 지금의 `routesByDate` 계산을 그대로 탄다. 쓰기는 "여행 사람이거나 이 일정의 지금 값"을 같은 SQL 문 조건으로 확인한다. 화면은 일정 양식에 "누구" 칸, 일정표에 이름표와 남의 일정 접힌 줄.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + neon-http, Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-per-person-schedule-design.md`

## Global Constraints

- 순수 모듈(`src/lib/*.ts`)은 다른 모듈을 import 하지 않는다. 시험은 `src/**/*.test.mjs`(`npm test`).
- 여행 접근은 `accessibleTrips(userId)`. 하위 쿼리는 하위 id·여행 id·접근 조건을 한 SQL 문에. neon-http 트랜잭션 없음.
- 마이그레이션은 `src/db/schema.ts` 를 고치고 `npm run db:generate`. `drizzle/` 아래 파일은 손으로 고치지 않는다. `npm run db:migrate` 는 사람이 `human-approved` 를 붙이고, 실행 직전 확인한 뒤에만.
- 사용자 문구는 한국어. 새 문구: 필드 오류 `"함께하는 사람을 다시 골라 주세요."`, 이름표 `"나"`, 나간 사람 `"<이름> (나감)"`, 양식 칸 이름 `"누구"`, 선택지 `"모두"`.
- 커밋 전 `npm run lint`·`npm run typecheck`·`npm test` 통과. 새 의존성 없음.
- `removeMemberAndPrivateRows`(`src/db/queries/trip-members.ts`)는 바꾸지 않는다(설계 §5.4).

## Review Focus

1. **낡은 양식(“누구” 칸이 생기기 전 탭, 또는 칸을 숨긴 혼자 여행)으로 고치기 저장** → 저장된 "누구" 값이 몰래 모두로 바뀌면 안 된다. `forUserId` 필드가 FormData 에 아예 없으면 지금 값을 유지(Task 4 시험 대상: `readForUser`).
2. **남의 여행 사용자 id·여행 사람 아닌 id 를 `forUserId` 로 재전송** → 저장 거절, DB 그대로(Task 3 조건 + Task 4 사전 확인, Task 7 재전송 확인).
3. **모든 일정이 모두인 지금 여행** → 동선·이동 시간·지도 결과가 이전과 같아야 한다(Task 1 시험 "모두뿐이면 이전과 같음").
4. **남의 "나만" 일정이 내 Google 구간 요청에 끼어듦** → `loadDayRoute` 도 viewerId 로 거른다(Task 5, `routesByDate` 인자를 필수로 만들어 빠뜨리면 타입 오류).
5. **나간 사람의 일정을 고치기에서 그대로 저장** → 통과해야 한다(이 일정의 지금 값과 같음, Task 3 조건 시험은 Task 7 DB 확인).

---

### Task 1: 동선 거르기 (순수)

**Files:**
- Modify: `src/lib/day-route.ts`
- Test: `src/lib/day-route.test.mjs`

**Interfaces:**
- Produces:
  - `ScheduleRow` 에 `forUserId?: string | null` (없거나 null = 모두).
  - `export function routeItemsFor<T extends { forUserId?: string | null }>(items: T[], viewerId: string): T[]` — `forUserId` 가 null/undefined 이거나 viewerId 인 것만, 순서 유지.
  - `routesByDate(dates, items, bases, trip, places, distance, viewerId: string)` — 마지막 인자 **필수**. 안에서 `routeItemsFor(items, viewerId)` 를 먼저 적용.

- [ ] **Step 1: 시험 쓰기** — 기존 `routesByDate` 시험 호출에 `"me"` 인자를 더하고, 새 시험:

```js
test("routeItemsFor: 모두 + 나만, 순서 유지", () => {
  const items = [
    { id: "a", forUserId: "me" },
    { id: "b", forUserId: "friend" },
    { id: "c", forUserId: null },
    { id: "d" },
  ];
  assert.deepEqual(routeItemsFor(items, "me").map((i) => i.id), ["a", "c", "d"]);
  assert.deepEqual(routeItemsFor(items, "friend").map((i) => i.id), ["b", "c", "d"]);
});

test("routesByDate: 첫날 각자 오는 길 → 합류, 사람마다 동선이 다름", () => {
  // B = 부산역, C = 동대구역, A = 서울역(모두). 첫날, 밤 숙소 없음.
  const items = [
    { id: "me1", date: "2026-12-03", placeId: "B", time: "08:00:00", forUserId: "me" },
    { id: "fr1", date: "2026-12-03", placeId: "C", time: "08:30:00", forUserId: "friend" },
    { id: "all", date: "2026-12-03", placeId: "A", time: "11:00:00", forUserId: null },
  ];
  const run = (viewer) =>
    routesByDate(["2026-12-03"], items, [], { startDate: "2026-12-03", endDate: "2026-12-03" }, places, dist, viewer).get("2026-12-03");
  assert.deepEqual(summary(run("me")), ["B>A arrival 11:00"]);
  assert.deepEqual(summary(run("friend")), ["C>A arrival 11:00"]);
  assert.deepEqual(run("me").stops.map((s) => s.place.id), ["B", "A"]);
});

test("routesByDate: 마지막 날 해산 → 각자", () => {
  const items = [
    { id: "all", date: "2026-12-05", placeId: "A", time: "15:00:00", forUserId: null },
    { id: "me2", date: "2026-12-05", placeId: "B", time: "18:00:00", forUserId: "me" },
    { id: "fr2", date: "2026-12-05", placeId: "C", time: "18:30:00", forUserId: "friend" },
  ];
  const r = routesByDate(["2026-12-05"], items, [], { startDate: "2026-12-03", endDate: "2026-12-05" }, places, dist, "friend").get("2026-12-05");
  assert.deepEqual(summary(r), ["A>C arrival 18:30"]);
});

test("routesByDate: 모두뿐이면 viewer 와 상관없이 같은 결과", () => {
  const items = [
    { id: "i1", date: "2026-12-03", placeId: "B", time: "09:30:00", forUserId: null },
    { id: "i2", date: "2026-12-03", placeId: "C", time: null, forUserId: null },
  ];
  const args = [["2026-12-03"], items, [{ startDate: "2026-12-03", placeId: "A" }], { startDate: "2026-12-03", endDate: "2026-12-05" }, places, dist];
  assert.deepEqual(daySignature(routesByDate(...args, "me").get("2026-12-03")), daySignature(routesByDate(...args, "x").get("2026-12-03")));
});
```

(`summary` 의 시각 형식은 파일의 기존 helper 를 따른다. 기존 시험의 기대값이 다르면 기존 helper 기준으로 맞춘다.)

- [ ] **Step 2: 실패 확인** — `npm test` → `routeItemsFor is not a function` 등으로 FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces 대로. 파일 머리 주석에 #90 한 줄.
- [ ] **Step 4: 통과 확인** — `npm test` PASS. (`npm run typecheck` 는 호출 세 곳이 인자 부족으로 실패한다 — Task 5 에서 고친다. 이 Task 는 Task 5 와 같은 커밋으로 묶어도 된다.)
- [ ] **Step 5: Commit** — `feat: 내 동선 거르기(routeItemsFor) (#90)`

### Task 2: "누구" 입력 검증과 금액 처음 쪽 (순수)

**Files:**
- Modify: `src/lib/schedule-input.ts`, `src/lib/budget-wallets.ts`
- Test: `src/lib/schedule-input.test.mjs`, `src/lib/budget-wallets.test.mjs`

**Interfaces:**
- Produces:
  - `ScheduleFields.forUserId: string` (빈 값 = 모두), `EMPTY_SCHEDULE_FIELDS.forUserId = ""`.
  - `ScheduleInput.forUserId: string | null`.
  - `export const FOR_USER_INVALID = "함께하는 사람을 다시 골라 주세요."`
  - `parseScheduleInput` 이 `forUserId` 를 trim → `""` 이면 null, 아니면 `/^[A-Za-z0-9_-]{1,100}$/` 에 맞을 때만 그 값, 틀리면 `errors.forUserId = FOR_USER_INVALID`.
  - `export function defaultSideFor(mode: BudgetMode, forUserId: string | null, viewerId: string): Side` — `mode === "both" && forUserId === viewerId` 이면 `"mine"`, 아니면 `defaultSide(mode)`.

- [ ] **Step 1: 시험 쓰기**

```js
// schedule-input.test.mjs
test("forUserId: 빈 값은 모두(null), 형식 맞으면 그 값", () => {
  const ok = parseScheduleInput({ ...base, forUserId: "  " }, allowed);
  assert.equal(ok.value.forUserId, null);
  const one = parseScheduleInput({ ...base, forUserId: "AbC_12-x" }, allowed);
  assert.equal(one.value.forUserId, "AbC_12-x");
});
test("forUserId: 공백·특수문자·100자 초과는 필드 오류", () => {
  for (const bad of ["a b", "a;drop", "x".repeat(101)]) {
    const r = parseScheduleInput({ ...base, forUserId: bad }, allowed);
    assert.equal(r.ok, false);
    assert.equal(r.errors.forUserId, FOR_USER_INVALID);
  }
});
// budget-wallets.test.mjs
test("defaultSideFor: 둘 다 + 내 일정만 내 돈", () => {
  assert.equal(defaultSideFor("both", "me", "me"), "mine");
  assert.equal(defaultSideFor("both", "friend", "me"), "shared");
  assert.equal(defaultSideFor("both", null, "me"), "shared");
  assert.equal(defaultSideFor("shared", "me", "me"), "shared");
  assert.equal(defaultSideFor("personal", null, "me"), "mine");
});
```

(`base`·`allowed` 는 파일의 기존 helper 이름을 따른다.)

- [ ] **Step 2: 실패 확인** — `npm test` FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces 대로.
- [ ] **Step 4: 통과 확인** — `npm test` PASS.
- [ ] **Step 5: Commit** — `feat: 일정 "누구" 입력 검증, 둘 다 여행 내 일정은 내 돈 먼저 (#90)`

### Task 3: 스키마·마이그레이션·쿼리

**Files:**
- Modify: `src/db/schema.ts` (scheduleItems 에 `forUserId`)
- Create (생성): `drizzle/0009_*.sql`, `drizzle/meta/*` (`npm run db:generate`)
- Modify: `src/db/queries/schedule-items.ts`, `src/db/queries/trip-members.ts`

**Interfaces:**
- Consumes: `ScheduleInput.forUserId` (Task 2).
- Produces:
  - `scheduleItems.forUserId: text("for_user_id").references(() => user.id, { onDelete: "cascade" })` — `position` 다음, `createdAt` 앞(열 순서는 `insert … select` 에 영향).
  - 일정 쓰기 함수 여섯 분기가 `input.forUserId` 를 쓰고, `forUserId !== null` 이면 조건 `forUserAllowed` 를 같은 문에 더한다:
    `function forUserAllowed(tripId: string, forUserId: string | null, itemId: string | null): SQL` → `forUserId IS NULL OR EXISTS(trips 주인 = forUserId, id = tripId) OR EXISTS(trip_members 그 여행·그 사용자) OR (itemId 가 있으면 EXISTS(schedule_items id = itemId AND for_user_id = forUserId))`.
  - `createScheduleItem` 장소 없는 분기: 여행 읽기 + `values()` 두 단계를 `insert … select … from trips where trips.id = tripId and accessibleTrips(userId) and forUserAllowed(...)` 한 문으로.
  - CTE 경로(`createScheduleItemWithNewPlace`, `updateScheduleItemWithNewPlace`)는 `tripRows` 조건에 `forUserAllowed` 를 더하고 INSERT/UPDATE 열에 `for_user_id`.
  - `trip-members.ts`: `listTripPeople` 을 React `cache` 로 감싼다(같은 요청에서 `MembersSection` 과 일정 칸이 함께 씀). 새 함수 `export async function listScheduleForUserNames(userId: string, tripId: string): Promise<Map<string, string>>` — 접근 가능한 여행의 일정에 나오는 `for_user_id` 별 `user.name`(나간 사람 이름표용).

- [ ] **Step 1: schema 고치고 생성** — `npm run db:generate`. 생성된 SQL 이 설계 §5.2 와 같은지 본다(`ADD COLUMN "for_user_id" text` + FK `ON DELETE cascade`). 다르면 멈추고 보고.
- [ ] **Step 2: 쿼리 구현** — 위 Interfaces 대로. `columnsOf` 는 `forUserId` 를 그대로 열로 넘긴다.
- [ ] **Step 3: 검사** — `npm run typecheck`·`npm run lint` PASS(Task 4·5 전이면 호출부 오류는 그 Task 에서). **`npm run db:migrate` 는 실행하지 않는다.**
- [ ] **Step 4: Commit** — `feat: schedule_items.for_user_id 와 쓰기 조건 (마이그레이션 0009) (#90)`

### Task 4: 일정 액션

**Files:**
- Modify: `src/app/trips/schedule-actions.ts`

**Interfaces:**
- Consumes: Task 2 `forUserId` 필드·`FOR_USER_INVALID`, Task 3 쿼리, `listTripPeople`.
- Produces: 양식이 보내는 hidden/라디오 필드 이름 `forUserId`. **필드가 FormData 에 없으면** 추가는 모두(null), 고치기는 지금 값 유지.

- [ ] **Step 1: 읽기** — `readScheduleFields` 에 `forUserId`. 고치기에서 `formData.has("forUserId")` 가 false 면 `values.forUserId = item.forUserId ?? ""` 로 채운 뒤 검증.
- [ ] **Step 2: 사전 확인** — 검증 통과 후 `forUserId !== null` 이면 `listTripPeople(user.id, tripId)` 의 userId 들(고치기는 + `item.forUserId`)에 있는지 확인. 없으면 `errors: { forUserId: FOR_USER_INVALID }` 로 돌려준다(쓰기 전).
- [ ] **Step 3: missed 처리** — 쓰기가 0행이고 장소 문제가 아니면, 같은 사전 확인을 다시 해 사람 문제면 `forUserId` 필드 오류, 아니면 지금처럼 `notFound()`.
- [ ] **Step 4: 검사** — `npm run typecheck`·`npm run lint` PASS.
- [ ] **Step 5: Commit** — `feat: 일정 저장에서 "누구" 받기 (#90)`

### Task 5: 동선 부르는 곳 세 군데

**Files:**
- Modify: `src/app/trips/[id]/map-section.tsx`, `src/app/trips/[id]/schedule-section.tsx`, `src/app/trips/day-route-loader.ts`

**Interfaces:**
- Consumes: Task 1 `routesByDate(..., viewerId)`, `routeItemsFor`.

- [ ] **Step 1** — 세 곳 모두 `routesByDate(..., userId)`.
- [ ] **Step 2** — `map-section.tsx` 의 `panelDays` 안 `dayItems`(→ `unlocatedCount`)는 `routeItemsFor(itemRows, userId)` 로 거른 행에서. `scheduleDays`([전체] 탭)는 그대로 모든 일정.
- [ ] **Step 3** — `npm run typecheck`·`npm run lint`·`npm test` PASS.
- [ ] **Step 4: Commit** — `feat: 지도·일정표·이동 시간을 내 동선으로 (#90)`

### Task 6: 화면 — "누구" 칸, 이름표, 접힌 줄, 금액 처음 쪽

**Files:**
- Modify: `src/app/trips/[id]/schedule-section.tsx`, `src/app/trips/[id]/schedule-editor.tsx`, `src/app/trips/[id]/schedule-item-form.tsx`, `src/app/trips/[id]/schedule-day-items.tsx`

**Interfaces:**
- Consumes: `listTripPeople`, `listScheduleForUserNames`, `defaultSideFor`.
- Produces:
  - `RowItem.who: { kind: "all" } | { kind: "me" } | { kind: "other"; userId: string; label: string }` — `label` 은 사람 이름, 나간 사람은 `"<이름> (나감)"`(이름을 모르면 `"나간 사람"`).
  - `ScheduleEditorProvider` props 에 `viewerId: string`, `people: { userId: string; label: string }[]`(보는 사람은 label `"나"`, 순서 모두 → 나 → 나머지 `listTripPeople` 순서).
  - `ScheduleItemForm` 에 `whoOptions?: { value: string; label: string }[]`(첫 값 `""`=모두). 없으면 칸을 그리지 않는다(FormData 에 `forUserId` 가 없음 → 고치기는 지금 값 유지).

- [ ] **Step 1: 데이터** — `ScheduleSection` 에서 사람 목록·나간 사람 이름을 읽어 `rowItem` 에 `who`, Provider 에 `viewerId`·`people`.
- [ ] **Step 2: 양식 칸** — 보이는 조건: 추가는 `people.length >= 2`, 고치기는 `people.length >= 2 || who.kind !== "all"`. 고치기에서 `who` 가 나간 사람이면 그 값을 선택지에 하나 더(label `"<이름> (나감)"`). 라디오 모양 버튼 줄, name `forUserId`, 많으면 줄바꿈.
- [ ] **Step 3: 금액 처음 쪽** — `AddScheduleItem`·고치기·`ActualEntry` 의 `defaultSide(budget.mode)` 를 `defaultSideFor(budget.mode, forUserId, viewerId)` 로. 양식에서 "누구"를 바꾸면 금액 칸을 아직 건드리지 않은 경우에만 `activeSide` 를 다시 맞춘다.
- [ ] **Step 4: 일정표** — 모두 일정은 그대로. `me` 는 줄 오른쪽 작은 이름표 `나`. `other` 는 처음에 접힌 한 줄(시각 · 제목 또는 장소 · 이름표, 누르면 펼쳐 보통 줄). 접힌 줄도 같은 sortable 항목이라 순서 저장은 그날 모든 id 를 그대로 보낸다. 역 동그라미 대신 흐린 표시로 동선 밖임을 보인다.
- [ ] **Step 5: 검사** — `npm run lint`·`npm run typecheck`·`npm test`·`npm run build` PASS.
- [ ] **Step 6: Commit** — `feat: 일정 양식 "누구" 칸과 남의 일정 접힌 줄 (#90)`

### Task 7: PR·마이그레이션·확인

- [ ] **Step 1** — `/code-review`, `/security-review`(일정 쓰기 조건). 막는 지적은 고친다.
- [ ] **Step 2** — draft PR: 맨 위 "사람 확인 필요"(마이그레이션·`src/db/schema.ts`·`drizzle/**`), `Closes #90`, 0009 SQL 전문과 "파괴적 아님(nullable 칸 + FK 추가)", #103 링크.
- [ ] **Step 3** — 사람이 `human-approved` → 실행 직전 확인 → `npm run db:migrate`. Neon MCP(읽기 전용)로 칸·FK 확인.
- [ ] **Step 4: 브라우저 확인** (로컬 dev + 임시 테스트 계정 둘, `run` 스킬·Playwright): 혼자 여행에서 칸 숨김 / 둘이면 칸 보임, 첫날 두 사람 화면의 지도 선·번호·이동 시간 줄이 다름, 접힌 줄 펼치기, 끌기, 둘 다 여행에서 내 일정 금액 처음 쪽 [내 돈], 390px.
- [ ] **Step 5: 보안·DB 확인** — B 쿠키로 남의 여행 사용자 id·여행 사람 아닌 id 를 `forUserId` 로 재전송 → 필드 오류·DB 그대로. 낡은 양식(필드 없음) 고치기 → 값 유지. 나가기 뒤 그 사람 일정·모임 행이 남고 "(나감)" 접힌 줄, 고치기 그대로 저장 통과. 테스트 계정·행 삭제.
- [ ] **Step 6** — draft 해제 → Codex 결과 뒤 자동 머지 → 배포 확인 → `docs/status.md` 갱신.
