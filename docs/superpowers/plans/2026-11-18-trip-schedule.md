# 여행별 날짜 일정표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행 자세히 보기(`/trips/[id]`) 아래에 날짜별 일정(시각·제목·장소·메모·완료)을 보이고, 그 자리에서 추가·고치기·완료·삭제한다.

**Architecture:** 새 테이블 `schedule_items` 하나. 날짜 칸은 여행 기간에서 순수 함수로 만들고, 기간 밖 일정은 날짜 비교로 따로 묶는다. 접근 확인은 `trips.ts` 의 `accessibleTrips(userId)` 하나를 일정 쿼리의 한 SQL 문 조건에 넣는다. 화면은 Server Component 가 그리고, 입력칸·완료 체크만 Client Component.

**Tech Stack:** Next.js 16 App Router(`cacheComponents`), React 19(`useActionState`, `useOptimistic`), Drizzle ORM + neon-http, Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-trip-schedule-design.md`

## Global Constraints

- CLAUDE.md '규칙'·'구현 규칙' 전부. 현재 사용자는 `getCurrentUser()` 로만, 비로그인은 `redirect("/")`, 남의 것과 없는 것은 `notFound()`, uuid 형식이 틀린 id 는 쿼리 전에 걸러 "찾을 수 없음".
- Server Action 순서: `getCurrentUser()` → 필드별 입력 검증(`FormData` 통째로 넘기지 않음) → `userId` 로 범위를 좁힌 쿼리 → `revalidatePath`.
- `src/lib/*.ts` 순수 모듈은 다른 모듈을 import 하지 않는다. 날짜는 `"YYYY-MM-DD"` 문자열, 계산은 UTC.
- 글자 수는 코드 포인트 기준(`[...value].length`). 제목 1–100자, 장소 ≤200자, 메모 ≤2000자.
- 사용자 문구는 한국어. 저장 실패 문구: `"저장하지 못했어요. 잠시 후 다시 시도해 주세요."`
- 새 의존성 없음(`package.json` 안 건드림). `drizzle/` 생성물은 손으로 고치지 않는다.
- 구현 전 읽기: `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`.
- 커밋 전 `npm run lint` · `npm run typecheck` 통과.

## Review Focus

1. 해를 넘기는 여행(2026-12-30 – 2027-01-02): 1–4일차가 끊김 없이 이어지고 요일이 맞아야 한다 → Task 2 `tripDays` 시험.
2. DB 의 `time` 이 `"09:30:00"` 으로 돌아온다: 화면 표시와 고치기 입력칸 초기값은 `"09:30"` 이고, 그대로 저장해도 검증을 통과해야 한다 → Task 2 `displayTime` 시험.
3. 기간 밖 일정을 날짜 그대로 두고 메모만 고치기는 되고, 다른 기간 밖 날짜로 옮기기는 안 된다 → Task 1 시험.
4. 내 여행 id + 남의 일정 id 조합으로 고치기·완료·삭제 → 찾을 수 없음, 남의 일정 그대로 → Task 4 조건 + Task 7 브라우저 확인.
5. 하루짜리 여행(시작=끝), 공백만 있는 제목, `"24:00"`·`"9:30"` 같은 시각 → Task 1·2 시험.

---

### Task 1: 일정 입력 검증 (순수)

**Files:**
- Create: `src/lib/schedule-input.ts`
- Test: `src/lib/schedule-input.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type ScheduleFields = { date: string; time: string; title: string; place: string; memo: string };
  export type ScheduleInput = { date: string; time: string | null; title: string; place: string | null; memo: string | null };
  export type ScheduleFieldErrors = Partial<Record<keyof ScheduleFields, string>>;
  export type ScheduleInputResult = { ok: true; value: ScheduleInput } | { ok: false; errors: ScheduleFieldErrors };
  // savedAt: 저장 성공 때마다 새 값(Date.now()). 클라이언트가 바뀐 것을 보고 입력칸을 비우거나 접는다.
  export type ScheduleFormState = { values: ScheduleFields; errors: ScheduleFieldErrors; formError: string | null; savedAt: number | null };
  export const EMPTY_SCHEDULE_FIELDS: ScheduleFields; // 모두 ""
  export type AllowedDates = { startDate: string; endDate: string; currentDate?: string };
  export function parseScheduleInput(raw: ScheduleFields, allowed: AllowedDates): ScheduleInputResult;
  ```

- [ ] **Step 1: 실패하는 시험 작성** — `trip-input.test.mjs` 와 같은 꼴(`node:test`, `node:assert/strict`, `./schedule-input.ts` import). `range = { startDate: "2026-12-03", endDate: "2026-12-05" }`, `valid = { date: "2026-12-04", time: "09:30", title: "박물관", place: "", memo: "" }`.
  - `accepts valid input`: → `{ ok: true, value: { date: "2026-12-04", time: "09:30", title: "박물관", place: null, memo: null } }`
  - `trims and nulls optional fields`: time `""` → `null`, place `"  역  "` → `"역"`, memo `"   "` → `null`, title `" a "` → `"a"`
  - `requires title`: title `"   "` → `errors.title === "제목을 입력해 주세요."`
  - `limits lengths`: title 101자 → `"100자 이하로 입력해 주세요."`; title 이모지 100개 → ok; place 201자 → `"200자 이하로 입력해 주세요."`; memo 2001자 → `"2000자 이하로 입력해 주세요."`
  - `validates time`: `"24:00"`, `"9:30"`, `"12:60"`, `"09:30:00"`, `"ab"` → `errors.time === "시각을 올바르게 입력해 주세요."`; `"00:00"`, `"23:59"` → ok
  - `validates date in trip range`: `"2026-12-02"`, `"2026-12-06"` → `errors.date === "여행 기간 안의 날짜를 골라 주세요."`; `"2026-12-03"`, `"2026-12-05"` → ok; `"2026-02-30"`, `""` → `errors.date === "날짜를 올바르게 입력해 주세요."`
  - `allows keeping an out-of-range current date`: allowed `{ ...range, currentDate: "2026-12-07" }` → date `"2026-12-07"` ok, date `"2026-12-08"` → 기간 오류
  - `collects multiple errors`: title `""` + time `"25:00"` → errors 에 `title`, `time` 둘 다

- [ ] **Step 2: 실패 확인** — Run: `node --test src/lib/schedule-input.test.mjs` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/lib/schedule-input.ts`. 맨 위 주석에 "node --test 로 시험하므로 다른 모듈을 import 하지 않는다". 날짜 형식 검사는 `trip-input.ts` 의 `isValidIsoDate` 와 같은 방식으로 이 파일 안에 둔다. 시각 정규식 `/^([01]\d|2[0-3]):[0-5]\d$/`. 날짜 규칙: 형식 오류가 먼저, 그다음 `startDate ≤ date ≤ endDate` 또는 `date === currentDate`.

- [ ] **Step 4: 통과 확인** — Run: `node --test src/lib/schedule-input.test.mjs` / Expected: PASS

- [ ] **Step 5: 커밋** — `git add src/lib/schedule-input.*` → `feat: 일정 입력 검증 (#12)`

### Task 2: 날짜 칸·묶기·표시 (순수)

**Files:**
- Create: `src/lib/schedule.ts`
- Test: `src/lib/schedule.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type SortableItem = { id: string; date: string; time: string | null; createdAt: Date };
  export type TripDay = { date: string; dayNumber: number; label: string }; // label "1일차 · 12월 3일 (수)"
  export function tripDays(startDate: string, endDate: string): TripDay[];
  export function dateLabel(date: string, withYear: boolean): string;        // "12월 6일 (토)" / "2027년 1월 1일 (금)"
  export function compareScheduleItems(a: SortableItem, b: SortableItem): number;
  export function groupSchedule<T extends SortableItem>(items: T[], startDate: string, endDate: string): {
    days: { day: TripDay; items: T[] }[];
    outside: { date: string; label: string; items: T[] }[];
  };
  export function displayTime(time: string | null): string;                  // "09:30:00" → "09:30", null → ""
  export function mapsSearchUrl(place: string): string;
  ```

- [ ] **Step 1: 실패하는 시험 작성**
  - `tripDays builds every day`: `tripDays("2026-12-03","2026-12-05")` → labels `["1일차 · 12월 3일 (목)", "2일차 · 12월 4일 (금)", "3일차 · 12월 5일 (토)"]`, dayNumber 1..3, date 각각
  - `tripDays single day`: `("2026-12-03","2026-12-03")` → 길이 1
  - `tripDays across year end`: `("2026-12-30","2027-01-02")` → dates `["2026-12-30","2026-12-31","2027-01-01","2027-01-02"]`, 마지막 label `"4일차 · 1월 2일 (토)"`
  - `dateLabel`: `("2026-12-06", false)` → `"12월 6일 (일)"`, `("2027-01-01", true)` → `"2027년 1월 1일 (금)"`
  - `compareScheduleItems orders by date, time (null last), createdAt, id`: 같은 날 `["15:00:00", null, "09:30:00"]` → `09:30, 15:00, null`; 둘 다 null 이면 createdAt 순; createdAt 같으면 id 사전순; 날짜가 다르면 날짜 우선
  - `groupSchedule`: 범위 12/3–12/5, 일정 날짜 12/4·12/2·12/6·12/6 → days 3개(12/3 비어 있음, 12/4 하나), outside 는 `[12/2, 12/6(2개)]` 날짜순, outside label 은 `dateLabel(date, date의 연도 !== startDate 의 연도)`
  - `displayTime`: `"09:30:00"` → `"09:30"`, `"09:30"` → `"09:30"`, `null` → `""`
  - `mapsSearchUrl`: `"오사카 성"` → `"https://www.google.com/maps/search/?api=1&query=%EC%98%A4%EC%82%AC%EC%B9%B4%20%EC%84%B1"` (`encodeURIComponent`)

- [ ] **Step 2: 실패 확인** — Run: `node --test src/lib/schedule.test.mjs` / Expected: FAIL

- [ ] **Step 3: 구현** — 요일·UTC 날짜 계산은 `calendar.ts` 의 `toUtc`/`WEEKDAYS` 와 같은 방식으로 이 파일 안에(순수 모듈 규칙). 하루씩 더할 때 `Date.UTC(y, m-1, d+1)`. `groupSchedule` 은 각 묶음 안을 `compareScheduleItems` 로 정렬한다.

- [ ] **Step 4: 통과 확인** — Run: `node --test 'src/**/*.test.mjs'` / Expected: 전부 PASS

- [ ] **Step 5: 커밋** — `feat: 일정 날짜 칸·묶기·표시 함수 (#12)`

### Task 3: 테이블과 마이그레이션 (위험 경로)

**Files:**
- Modify: `src/db/schema.ts` (끝에 `// --- 일정 ---` 절)
- Create: `drizzle/0002_*.sql`, `drizzle/meta/*` (생성물)

**Interfaces:**
- Produces: `export const scheduleItems` (pgTable `"schedule_items"`), `export type ScheduleItem = typeof scheduleItems.$inferSelect`.

- [ ] **Step 1: 스키마 추가** — 설계 §5.4 표 그대로: `id` uuid PK `defaultRandom()`; `tripId` `trip_id` uuid notNull `.references(() => trips.id, { onDelete: "cascade" })`; `date` `date` notNull; `time` `time("time")` null; `title` text notNull; `place`·`memo` text null; `done` boolean notNull default false; `createdAt`/`updatedAt` 은 `trips` 와 같은 정의. 인덱스 `index("schedule_items_trip_id_date_idx").on(t.tripId, t.date)`. 날짜 범위 check 제약은 걸지 않는다(주석으로 이유).

- [ ] **Step 2: 마이그레이션 생성** — Run: `npm run db:generate` / Expected: `drizzle/0002_<이름>.sql` 생성. 내용이 `CREATE TABLE "schedule_items"`, FK `ON DELETE cascade`, `CREATE INDEX` 뿐인지 확인(DROP·ALTER TYPE·기존 테이블 NOT NULL 추가 없음 → 비파괴). **적용(`db:migrate`)은 하지 않는다.**

- [ ] **Step 3: 확인** — Run: `npm run typecheck && npm run lint` / Expected: 통과

- [ ] **Step 4: 커밋** — `feat: schedule_items 테이블과 마이그레이션 (#12)`

### Task 4: 일정 쿼리

**Files:**
- Modify: `src/db/queries/trips.ts` (`accessibleTrips` 를 `export`, 주석에 "일정 쿼리도 이 조건을 쓴다")
- Create: `src/db/queries/schedule-items.ts`

**Interfaces:**
- Consumes: `accessibleTrips(userId): SQL`, `scheduleItems`, `ScheduleItem`, `ScheduleInput`(Task 1), `isUuid`
- Produces:
  ```ts
  export async function listScheduleItems(userId: string, tripId: string): Promise<ScheduleItem[]>;
  export async function getScheduleItem(userId: string, tripId: string, itemId: string): Promise<ScheduleItem | null>;
  export async function createScheduleItem(userId: string, tripId: string, input: ScheduleInput): Promise<string | null>; // 접근 불가면 null
  export async function updateScheduleItem(userId: string, tripId: string, itemId: string, input: ScheduleInput): Promise<boolean>;
  export async function setScheduleItemDone(userId: string, tripId: string, itemId: string, done: boolean): Promise<boolean>;
  export async function deleteScheduleItem(userId: string, tripId: string, itemId: string): Promise<boolean>;
  ```

- [ ] **Step 1: 구현** — `import "server-only"`. 내부 함수 두 개로 조건을 모은다:
  - `inAccessibleTrip(userId, tripId)`: `and(eq(scheduleItems.tripId, tripId), inArray(scheduleItems.tripId, db.select({ id: trips.id }).from(trips).where(accessibleTrips(userId))))`
  - `itemCondition(userId, tripId, itemId)`: 위 + `eq(scheduleItems.id, itemId)`
  - 모든 함수는 `tripId`(와 `itemId`)가 `isUuid` 가 아니면 쿼리 없이 `[]`/`null`/`false`.
  - 목록 정렬: `asc(date), asc(time)`(Postgres 기본 NULLS LAST), `asc(createdAt), asc(id)`.
  - `createScheduleItem`: `db.insert(scheduleItems).select(...)` 로 `trips` 에서 `id = tripId and accessibleTrips(userId)` 인 행이 있을 때만 넣는 한 문(insert … select). 반환 `returning({ id })` 가 비면 `null`.
  - 고치기·완료·삭제는 `where(itemCondition(...))` 한 문, `returning({ id })` 길이로 boolean.

- [ ] **Step 2: 확인** — Run: `npm run typecheck && npm run lint` / Expected: 통과. (DB 시험은 Task 7 브라우저 확인에서)

- [ ] **Step 3: 커밋** — `feat: 일정 쿼리, 여행 접근 조건 공유 (#12)`

### Task 5: Server Action

**Files:**
- Create: `src/app/trips/schedule-actions.ts`

**Interfaces:**
- Consumes: Task 1, Task 4, `getTrip`, `getCurrentUser`
- Produces:
  ```ts
  export async function createScheduleItemAction(tripId: string, date: string, prev: ScheduleFormState, formData: FormData): Promise<ScheduleFormState>;
  export async function updateScheduleItemAction(tripId: string, itemId: string, prev: ScheduleFormState, formData: FormData): Promise<ScheduleFormState>;
  export async function setScheduleItemDoneAction(tripId: string, itemId: string, done: boolean): Promise<{ ok: boolean }>;
  export async function deleteScheduleItemAction(tripId: string, itemId: string): Promise<void>;
  ```

- [ ] **Step 1: 구현** — `"use server"`. `actions.ts` 의 `readTripFields` 처럼 `readScheduleFields(formData, date)` 로 `time`·`title`·`place`·`memo`(+ 고치기는 `date`) 만 문자열로 꺼낸다.
  - 추가: 사용자 → 필드(날짜는 bind `date`) → `getTrip` 없으면 `notFound()` → `parseScheduleInput(values, trip)` 실패면 `{ values, errors, formError: null, savedAt: prev.savedAt }` → `createScheduleItem` (throw → `formError` 저장 실패 문구, `null` → `notFound()`) → `revalidatePath(\`/trips/${tripId}\`)` → `{ values: { ...EMPTY_SCHEDULE_FIELDS, date }, errors: {}, formError: null, savedAt: Date.now() }`.
  - 고치기: 사용자 → 필드 → `getTrip` → `getScheduleItem` (둘 중 없으면 `notFound()`) → `parseScheduleInput(values, { ...trip, currentDate: item.date })` → `updateScheduleItem` (false → `notFound()`) → revalidate → `{ values, errors: {}, formError: null, savedAt: Date.now() }`.
  - 완료: 사용자 → `typeof done !== "boolean"` 이면 `{ ok: false }` → `setScheduleItemDone` try/catch, false 나 오류면 `{ ok: false }`(대상 없음·저장 실패 같은 반응, 설계 §5.4) → 성공 시 revalidate, `{ ok: true }`.
  - 삭제: 사용자 → `deleteScheduleItem` false → `notFound()` → revalidate.

- [ ] **Step 2: 확인** — Run: `npm run typecheck && npm run lint` / Expected: 통과

- [ ] **Step 3: 커밋** — `feat: 일정 Server Action (#12)`

### Task 6: 일정 화면

**Files:**
- Create: `src/app/trips/[id]/schedule-section.tsx` (Server Component)
- Create: `src/app/trips/[id]/schedule-editor.tsx` (`"use client"`: 열림 상태 Provider, `AddScheduleItem`, `ScheduleItemRow`)
- Create: `src/app/trips/[id]/schedule-item-form.tsx` (`"use client"`: 추가·고치기 공용 양식)
- Modify: `src/app/trips/[id]/page.tsx` (자리 표시 주석을 `<ScheduleSection …/>` 로)

**Interfaces:**
- Consumes: Task 2 함수, Task 4 `listScheduleItems`·`ScheduleItem`, Task 5 액션, `todayInSeoul`, `styles.ts`
- Produces:
  ```ts
  // schedule-section.tsx
  export async function ScheduleSection(props: { userId: string; trip: Trip; today: string }): Promise<JSX.Element>;
  // schedule-editor.tsx
  export function ScheduleEditorProvider(props: { children: React.ReactNode }): JSX.Element;
  export function AddScheduleItem(props: { tripId: string; date: string }): JSX.Element;
  export type DateOption = { value: string; label: string };
  export function ScheduleItemRow(props: { tripId: string; item: RowItem; dateOptions: DateOption[] }): JSX.Element;
  export type RowItem = { id: string; date: string; time: string; title: string; place: string | null; memo: string | null; done: boolean }; // time 은 displayTime 결과
  // schedule-item-form.tsx
  export function ScheduleItemForm(props: {
    action: (prev: ScheduleFormState, formData: FormData) => Promise<ScheduleFormState>;
    initialValues: ScheduleFields;
    dateOptions?: DateOption[];        // 있으면 날짜 select(고치기)
    mode: "add" | "edit";
    onClose: () => void;
    onDelete?: () => void;             // 고치기에서만 "삭제" 버튼
  }): JSX.Element;
  ```

- [ ] **Step 1: `ScheduleSection`** — `listScheduleItems` → `groupSchedule(items, trip.startDate, trip.endDate)`. 제목 "일정". 오늘이 기간 안이면 위에 `<a href="#day-${today}">오늘 일정으로 ↓</a>`, 그날 제목에 "오늘" 표시. 각 날 `<section id={\`day-${date}\`}>`, 제목 `day.label`, 일정 없으면 "아직 일정이 없어요", 끝에 `<AddScheduleItem>`. outside 가 있으면 "여행 기간 밖 일정" 칸(제목 `group.label`). 날짜 옵션: `tripDays` 각각 `{ value: date, label: day.label }`, 기간 밖 일정에는 맨 앞에 `{ value: item.date, label: dateLabel(item.date, true) }` 를 더한다. 전체를 `<ScheduleEditorProvider>` 로 감싼다. `page.tsx` 의 `TripDetail` 에서 `getTrip` 뒤 `<ScheduleSection userId={user.id} trip={trip} today={todayInSeoul()} />` (같은 Suspense 안).

- [ ] **Step 2: 열림 상태와 행** — Provider 는 `openKey: string | null` 을 context 로 준다(`"add:<date>"`, `"edit:<id>"`). 화면을 떠날 때 닫히도록 `trip-form.tsx` 처럼 `useLayoutEffect` cleanup 에서 `openKey` 를 `null` 로. 
  - `AddScheduleItem`: 닫혀 있으면 "+ 일정 추가" 버튼, 열리면 `ScheduleItemForm`(mode add, `createScheduleItemAction.bind(null, tripId, date)`).
  - `ScheduleItemRow`: 시각·제목·장소(`<a href={mapsSearchUrl(place)} target="_blank" rel="noopener noreferrer">📍 {place}</a>`)·메모(`whitespace-pre-wrap`)·체크 상자. 완료면 흐리게+취소선. 체크는 `useOptimistic(item.done)` + `startTransition` 에서 `setScheduleItemDoneAction`; `{ ok: false }` 면 "저장하지 못했어요. 잠시 후 다시 시도해 주세요." 를 줄 옆에 보인다(낙관값은 전환이 끝나면 서버 값으로 돌아감). 제목/"고치기"를 누르면 `edit:<id>` 로 열고 `ScheduleItemForm`(mode edit, `updateScheduleItemAction.bind(null, tripId, item.id)`, `initialValues` 의 time 은 이미 `HH:MM`). `onDelete`: `window.confirm("이 일정을 삭제할까요?")` 뒤 `deleteScheduleItemAction`.

- [ ] **Step 3: 양식** — `useActionState(action, { values: initialValues, errors: {}, formError: null, savedAt: null })`. 칸: (고치기면) 날짜 `<select name="date">`, 시각 `<input type="time" name="time">`, 제목, 장소, 메모 `<textarea>`. 칸별 오류는 `trip-form.tsx` 의 `Field` 와 같은 aria 방식(id 는 양식마다 고유하게 `useId`). `state.savedAt` 이 바뀌면: add 는 `key` 를 바꿔 빈 양식으로 다시 그리고 제목 칸에 초점, edit 는 `onClose()`. 버튼: 저장(pending 이면 "저장하는 중…"), add 는 "닫기" / edit 는 "취소"·"삭제"(`dangerButtonClass`).

- [ ] **Step 4: 확인** — Run: `npm run lint && npm run typecheck && npm run build` / Expected: 통과. (테이블이 아직 없으므로 화면 확인은 Task 7)

- [ ] **Step 5: 커밋** — `feat: 여행 자세히 보기에 날짜별 일정표 (#12)`

### Task 7: PR, 마이그레이션 적용, 브라우저 확인

- [ ] **Step 1: 리뷰** — `/code-review`, `/security-review`(소유권 쿼리). 막는 지적은 고치고 다시.
- [ ] **Step 2: draft PR** — 맨 위 "사람 확인 필요: `src/db/schema.ts`, `drizzle/**` 변경(위험 경로)". `drizzle/0002_*.sql` 전문, 판정 "비파괴(새 테이블·FK·인덱스만)". "프리뷰에서는 일정 화면을 확인할 수 없음". 장소 링크 여는 방식은 브라우저 확인 때 사용자 판단(설계 §5.1 미정). `Closes #12`. `subscribe_pr_activity`. 자동 머지는 켜지 않는다.
- [ ] **Step 3: 적용** — `human-approved` 가 붙으면 사용자에게 확인받고 `npm run db:migrate`. 뒤에 `schedule_items` 가 생겼는지 읽기 전용으로 확인.
- [ ] **Step 4: 브라우저 확인** — `docs/status.md` '알아 둘 것'의 테스트 계정 방식(SQL 전문을 보이고 넣기·지우기 각각 확인). 설계 §5.7 의 목록 전부, 특히 Review Focus 4(내 여행 id + B 의 일정 id 로 완료·고치기·삭제 → 실패, B 일정 그대로)와 390px 폭. 장소 링크를 사용자에게 보여 여는 방식을 정한다(바꾸면 고치고 다시 확인).
- [ ] **Step 5: 마무리** — 테스트 행 삭제·0개 확인 → draft 해제·자동 머지(squash) → 배포 확인 → `docs/status.md` 갱신(끝난 것 표에 #12, 다음 할 일에서 #12 제거, #13 이 일정과 장소를 잇는다는 메모).
