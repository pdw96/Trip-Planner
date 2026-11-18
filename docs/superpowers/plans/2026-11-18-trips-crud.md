# 여행 CRUD 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 자기 여행을 목록으로 보고, 만들고, 자세히 보고, 고치고, 지울 수 있게 한다 (#11).

**Architecture:** 페이지는 Server Component, 세션·`params` 를 읽는 부분은 `<Suspense>` 안. 입력 양식과 삭제 버튼만 Client Component. 데이터 변경은 `src/app/trips/actions.ts` 의 Server Action, DB 접근은 `src/db/queries/trips.ts` 한 곳이며 접근 조건은 그 안의 함수 하나에서 만든다. 검증·날짜·id 검사는 import 없는 순수 TS 모듈로 두고 `node:test` 로 시험한다.

**Tech Stack:** Next.js 16.4 (App Router, `cacheComponents`), React 19.3 (`useActionState`), Drizzle ORM 0.45 (neon-http), Better Auth 1.7, Tailwind 4, Node 22 (`node --test`, 내장 TS 타입 제거).

**Spec:** `docs/superpowers/specs/2026-11-18-trips-crud-design.md`

## Global Constraints

- CLAUDE.md '규칙'·'구현 규칙'·'작업 흐름' 전부. 커밋 전 `npm run lint` · `npm run typecheck` 통과.
- 위험 경로를 건드리지 않는다: `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`, `.github/**`, `src/lib/auth.ts`, `src/lib/session.ts`, `src/db/schema.ts`, `src/db/index.ts` 등 (CLAUDE.md 목록). 새 의존성 없음.
- 현재 사용자는 `getCurrentUser()` (`@/lib/session`, 반환 `CurrentUser | null`, `id: string`)로만 읽는다. 비로그인은 `redirect("/")`.
- 남의 것·없는 것·형식이 틀린 id 는 똑같이 `notFound()`.
- "오늘"은 `Asia/Seoul` 날짜.
- 한도: 여행 이름·여행지 1–100자, 메모 2000자 이하 (앞뒤 공백 제거 뒤, 글자 수는 코드 포인트 기준).
- 사용자에게 보이는 문구는 한국어. 스타일은 `src/app/page.tsx`·`src/app/auth-buttons.tsx` 의 Tailwind 스타일(둥근 버튼, zinc 계열)을 따른다.
- 순수 모듈(`src/lib/ids.ts`, `src/lib/trip-input.ts`, `src/lib/trip-dates.ts`)은 다른 모듈을 import 하지 않는다. `node --test` 가 별칭(`@/`)과 확장자 없는 import 를 풀지 못하기 때문이다.
- 단위 시험 실행: `node --test 'src/**/*.test.mjs'`. CI 는 이 시험을 돌리지 않는다(`.github/**` 는 위험 경로). PR 본문에 적는다.
- 구현 전에 `node_modules/next/dist/docs/01-app/` 의 `02-guides/forms.md`, `01-getting-started/07-mutating-data.md`, `02-guides/authentication-with-cache-components.md`, `03-api-reference/04-functions/not-found.md` 를 읽는다.

## Review Focus

1. **남의 여행 id 를 고친 요청.** 자세히 보기·고치기 화면뿐 아니라 고치기·삭제 action 에 B 의 id 를 넣어도 A 는 "찾을 수 없음"을 보고 B 의 행은 그대로여야 한다. → Task 7 Step 4.
2. **한국 자정 경계.** UTC 15:00–23:59 사이에는 서울이 다음 날이다. 오늘 끝나는 여행은 "다가오는 여행"에 남아야 한다. → Task 2 시험 `todayInSeoul crosses midnight in Seoul`, `splitTrips keeps trips ending today upcoming`.
3. **공백만 넣은 칸.** 필수 칸은 "입력해 주세요" 오류, 메모는 `null`. → Task 1 시험 `whitespace-only fields`.
4. **달력에 없는 날짜.** `2026-02-30`, `2026-13-01`, `2026-2-3` 은 거부. → Task 1 시험 `rejects impossible dates`.
5. **오류 뒤 입력 유지.** 검증 실패 시 메모까지 포함한 모든 칸의 값이 남아야 한다. → Task 7 Step 3.

---

### Task 1: id 검사와 입력 검증

**Files:**
- Create: `src/lib/ids.ts`, `src/lib/trip-input.ts`
- Test: `src/lib/ids.test.mjs`, `src/lib/trip-input.test.mjs`

**Interfaces:**
- Produces:
  - `isUuid(value: string): boolean` (`src/lib/ids.ts`) — 8-4-4-4-12 16진수, 대소문자 무관.
  - `src/lib/trip-input.ts`:
    ```ts
    export type TripFields = { title: string; destination: string; startDate: string; endDate: string; notes: string };
    export type TripInput = { title: string; destination: string; startDate: string; endDate: string; notes: string | null };
    export type TripFieldErrors = Partial<Record<keyof TripFields, string>>;
    export type TripInputResult = { ok: true; value: TripInput } | { ok: false; errors: TripFieldErrors };
    export type TripFormState = { values: TripFields; errors: TripFieldErrors; formError: string | null };
    export const EMPTY_TRIP_FIELDS: TripFields; // 모든 값 ""
    export function parseTripInput(raw: TripFields): TripInputResult;
    export function isValidIsoDate(value: string): boolean;
    ```

- [ ] **Step 1: 실패하는 시험 작성** (`node:test` + `node:assert/strict`, `import { ... } from "./ids.ts"` / `"./trip-input.ts"`)

  `ids.test.mjs`:
  - `isUuid("3f2b8c1e-9a4d-4e2b-8f1a-0c9d8e7f6a5b") === true`, 대문자도 `true`
  - `""`, `"abc"`, `"3f2b8c1e9a4d4e2b8f1a0c9d8e7f6a5b"`, 끝에 문자 하나 더 붙인 것 → `false`

  `trip-input.test.mjs` (`valid = { title: "겨울 휴가", destination: "오사카", startDate: "2026-12-20", endDate: "2026-12-23", notes: "" }`):
  - `accepts valid input`: `{ ok: true, value: { ...valid, notes: null } }`
  - `trims values`: `"  겨울 휴가 "` → `"겨울 휴가"`, notes `" 메모 "` → `"메모"`
  - `whitespace-only fields`: title `"   "` → `errors.title === "여행 이름을 입력해 주세요."`, destination `" "` → `"여행지를 입력해 주세요."`, notes `"  "` → ok, `notes: null`
  - `length limits`: title 100자 ok, 101자 → `"100자 이하로 입력해 주세요."`; destination 동일; notes 2000자 ok, 2001자 → `"2000자 이하로 입력해 주세요."`; `"😀".repeat(100)` title ok (코드 포인트 기준)
  - `missing dates`: startDate `""` → `"시작 날짜를 입력해 주세요."`, endDate `""` → `"끝 날짜를 입력해 주세요."`
  - `rejects impossible dates`: `"2026-02-30"`, `"2026-13-01"`, `"2026-2-3"`, `"2026/12/20"` → `"날짜를 올바르게 입력해 주세요."`; `isValidIsoDate("2028-02-29") === true`, `isValidIsoDate("2027-02-29") === false`
  - `end before start`: start `"2026-12-23"`, end `"2026-12-20"` → `errors.endDate === "끝 날짜는 시작 날짜와 같거나 그 뒤여야 해요."`; 같은 날은 ok
  - `reports every field at once`: 모든 칸 `""` → `errors` 에 title·destination·startDate·endDate 네 키

- [ ] **Step 2: 실패 확인**

  Run: `node --test 'src/lib/*.test.mjs'`
  Expected: FAIL (모듈 없음)

- [ ] **Step 3: `src/lib/ids.ts`, `src/lib/trip-input.ts` 구현**

  날짜는 정규식 `^\d{4}-\d{2}-\d{2}$` 뒤 `Date.UTC` 로 만든 날짜를 다시 `YYYY-MM-DD` 로 돌려 같은지 비교한다. 날짜 비교는 `YYYY-MM-DD` 문자열 비교. 둘 중 하나라도 형식 오류면 순서 비교는 하지 않는다.

- [ ] **Step 4: 통과 확인**

  Run: `node --test 'src/lib/*.test.mjs'`
  Expected: PASS. 이어서 `npm run lint` · `npm run typecheck` 통과.

- [ ] **Step 5: 커밋** — `feat: 여행 입력 검증과 id 검사 (#11)`

---

### Task 2: 한국 날짜, 목록 나누기, 날짜 표시

**Files:**
- Create: `src/lib/trip-dates.ts`
- Test: `src/lib/trip-dates.test.mjs`

**Interfaces:**
- Produces (`src/lib/trip-dates.ts`):
  ```ts
  export function todayInSeoul(now?: Date): string; // "YYYY-MM-DD"
  export function splitTrips<T extends { startDate: string; endDate: string; createdAt: Date }>(
    trips: T[], today: string,
  ): { upcoming: T[]; past: T[] };
  export function formatShortRange(startDate: string, endDate: string, today: string): string;
  export function formatLongRange(startDate: string, endDate: string): string;
  ```

- [ ] **Step 1: 실패하는 시험 작성**
  - `todayInSeoul crosses midnight in Seoul`: `new Date("2026-11-17T14:59:00Z")` → `"2026-11-17"`, `new Date("2026-11-17T15:00:00Z")` → `"2026-11-18"`
  - `splitTrips keeps trips ending today upcoming`: today `"2026-11-18"`, endDate `"2026-11-18"` → upcoming; endDate `"2026-11-17"` → past
  - `splitTrips orders`: upcoming 은 startDate 오름차순, past 는 endDate 내림차순, 같으면 createdAt 오름차순. 입력 배열을 바꾸지 않는다.
  - `formatShortRange` (today `"2026-11-18"`): `("2026-12-20","2026-12-23")` → `"12/20 – 12/23"`; `("2027-01-05","2027-01-07")` → `"2027/1/5 – 1/7"`; `("2026-12-30","2027-01-02")` → `"12/30 – 2027/1/2"`; `("2025-10-03","2025-10-05")` → `"2025/10/3 – 10/5"`; 같은 날 `("2026-12-20","2026-12-20")` → `"12/20"`
  - `formatLongRange`: `("2026-12-20","2026-12-23")` → `"2026년 12월 20일 – 12월 23일"`; `("2026-12-30","2027-01-02")` → `"2026년 12월 30일 – 2027년 1월 2일"`; 같은 날 → `"2026년 12월 20일"`

  (구분자는 앞뒤 공백이 있는 en dash `" – "`.)

- [ ] **Step 2: 실패 확인** — `node --test 'src/lib/*.test.mjs'` FAIL

- [ ] **Step 3: 구현.** `todayInSeoul` 은 `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })`. 표시 함수는 문자열을 쪼개 만든다(`Date` 의 시간대 영향을 받지 않게). 짧은 표시의 연도 규칙: 시작은 연도 ≠ today 의 연도일 때, 끝은 연도 ≠ 시작 연도일 때 `YYYY/` 를 붙인다. 월·일은 앞의 0 을 뺀다.

- [ ] **Step 4: 통과 확인** — `node --test 'src/lib/*.test.mjs'` PASS, lint·typecheck 통과

- [ ] **Step 5: 커밋** — `feat: 한국 날짜 기준 여행 목록 나누기와 날짜 표시 (#11)`

---

### Task 3: 여행 쿼리

**Files:**
- Create: `src/db/queries/trips.ts`

**Interfaces:**
- Consumes: `isUuid` (Task 1), `TripInput` (Task 1), `db` (`@/db`), `trips`·`Trip` (`@/db/schema`)
- Produces (`import "server-only"`):
  ```ts
  export async function listTrips(userId: string): Promise<Trip[]>;
  export async function getTrip(userId: string, tripId: string): Promise<Trip | null>;
  export async function createTrip(userId: string, input: TripInput): Promise<string>; // 새 id
  export async function updateTrip(userId: string, tripId: string, input: TripInput): Promise<boolean>; // 바뀐 행이 없으면 false
  export async function deleteTrip(userId: string, tripId: string): Promise<boolean>;
  ```

- [ ] **Step 1: 구현.**
  - 파일 안에 `function accessibleTrips(userId: string): SQL` 하나를 두고 모든 `where` 가 이것을 쓴다(지금은 `eq(trips.userId, userId)`). 위에 "공유(#15)는 이 조건만 바꾼다" 주석 한 줄.
  - `getTrip`·`updateTrip`·`deleteTrip` 는 `isUuid(tripId)` 가 거짓이면 쿼리 없이 `null`/`false`.
  - 고치기·삭제는 `and(eq(trips.id, tripId), accessibleTrips(userId))` 를 `where` 에 넣고 `.returning({ id: trips.id })` 길이로 결과를 정한다.
  - `createTrip` 의 `userId` 는 인자로만 받는다. 정렬은 하지 않는다(Task 2 `splitTrips` 가 한다).
  - 이 모듈은 DB 가 필요해 단위 시험이 없다. Task 7 의 브라우저 확인이 시험이다.

- [ ] **Step 2: 확인** — `npm run lint` · `npm run typecheck` 통과

- [ ] **Step 3: 커밋** — `feat: 사용자 범위 여행 쿼리 (#11)`

---

### Task 4: 목록 화면, 로그인 뒤 이동, 로그아웃, 찾을 수 없음

**Files:**
- Create: `src/app/trips/page.tsx`, `src/app/not-found.tsx`
- Modify: `src/app/page.tsx` (`AuthStatus`), `src/app/auth-buttons.tsx` (`SignOutButton`)

**Interfaces:**
- Consumes: `listTrips` (Task 3), `splitTrips`·`todayInSeoul`·`formatShortRange` (Task 2), `getCurrentUser`
- Produces: 경로 `/trips`. 목록 항목은 `/trips/{id}` 로 가는 `Link`.

- [ ] **Step 1: `/trips` 구현.** 제목 "내 여행", "새 여행" 링크(`/trips/new`), `SignOutButton`. 세션·목록을 읽는 컴포넌트는 `<Suspense fallback="불러오는 중…">` 안. 비로그인 `redirect("/")`. "다가오는 여행"/"지난 여행" 칸, 각 항목은 여행 이름(굵게)과 `여행지 · 짧은 날짜`. 한 칸이 비면 그 칸을 감추고, 둘 다 비면 "아직 여행이 없어요. 첫 여행을 만들어 보세요." 와 "새 여행" 버튼.
- [ ] **Step 2: 홈.** `AuthStatus` 에서 로그인돼 있으면 `redirect("/trips")`.
- [ ] **Step 3: 로그아웃.** `SignOutButton` 이 로그아웃 뒤 `router.push("/")` 후 `router.refresh()`.
- [ ] **Step 4: `src/app/not-found.tsx`.** "찾을 수 없는 페이지예요." 와 "내 여행으로" 링크(`/trips`).
- [ ] **Step 5: 확인** — lint·typecheck 통과, `npm run dev` 로 `/` 와 `/trips`(비로그인 → `/` 로 이동), `/없는경로`(한국어 찾을 수 없음)를 Playwright 로 연다. dev 서버가 시크릿·Google 키 없이 뜨는지 이때 확인하고, 막히면 Task 7 전에 보고한다.
- [ ] **Step 6: 커밋** — `feat: 내 여행 목록과 로그인 뒤 이동 (#11)`

---

### Task 5: 만들기와 자세히 보기

**Files:**
- Create: `src/app/trips/actions.ts`, `src/app/trips/trip-form.tsx`, `src/app/trips/new/page.tsx`, `src/app/trips/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1 타입·`parseTripInput`·`EMPTY_TRIP_FIELDS`, Task 2 `formatLongRange`, Task 3 `createTrip`·`getTrip`
- Produces:
  ```ts
  // actions.ts ("use server")
  export async function createTripAction(prev: TripFormState, formData: FormData): Promise<TripFormState>;
  // trip-form.tsx ("use client")
  export function TripForm(props: {
    action: (prev: TripFormState, formData: FormData) => Promise<TripFormState>;
    initialValues: TripFields;
    submitLabel: string;   // "만들기" | "저장"
    cancelHref: string;    // "/trips" | `/trips/${id}`
  }): JSX.Element;
  ```

- [ ] **Step 1: `createTripAction`.** 순서: `getCurrentUser()` (없으면 `redirect("/")`) → `formData.get` 로 다섯 필드를 하나씩 문자열로 꺼내 `TripFields` 를 만든다(없으면 `""`) → `parseTripInput` 실패 시 `{ values, errors, formError: null }` 반환 → `try { id = await createTrip(user.id, value) } catch { return { values, errors: {}, formError: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." } }` → `revalidatePath("/trips")` → `redirect(\`/trips/${id}\`)` (try 밖).
- [ ] **Step 2: `TripForm`.** `useActionState(action, { values: initialValues, errors: {}, formError: null })`. 칸: 여행 이름(text), 여행지(text), 시작 날짜·끝 날짜(`type="date"`), 메모(textarea). 각 칸 `defaultValue={state.values.x}` 와 `key` 로 상태가 바뀔 때 값이 다시 채워지게 한다. 오류는 칸 아래 `role="alert"` 빨간 글씨, `aria-invalid`·`aria-describedby` 연결. `formError` 는 양식 위. 제출 중에는 버튼 비활성화. `required`·`maxLength` 같은 브라우저 검증 속성은 두지 않는다(서버 검증 문구가 보이게).
- [ ] **Step 3: `/trips/new`.** 제목 "새 여행", `TripForm` (`createTripAction`, `EMPTY_TRIP_FIELDS`, "만들기", `/trips`). 세션 확인은 Suspense 안, 비로그인 `redirect("/")`.
- [ ] **Step 4: `/trips/[id]`.** Suspense 안에서 `params` 와 세션을 읽고 `getTrip` 이 `null` 이면 `notFound()`. 이름, `여행지 · formatLongRange`, 메모(있을 때만, 줄바꿈 유지), "고치기" 링크(`/trips/{id}/edit`), "내 여행" 링크. 삭제 버튼 자리는 Task 6. 정보 아래에 일정·장소·예산이 붙을 빈 영역은 보이는 문구 없이 구조만 둔다.
- [ ] **Step 5: 확인** — lint·typecheck 통과, `npm run build` 성공(Suspense 경계 누락은 빌드 오류로 드러난다)
- [ ] **Step 6: 커밋** — `feat: 여행 만들기와 자세히 보기 (#11)`

---

### Task 6: 고치기와 삭제

**Files:**
- Modify: `src/app/trips/actions.ts`, `src/app/trips/[id]/page.tsx`
- Create: `src/app/trips/[id]/edit/page.tsx`, `src/app/trips/delete-trip-button.tsx`

**Interfaces:**
- Consumes: Task 3 `getTrip`·`updateTrip`·`deleteTrip`, Task 5 `TripForm`
- Produces:
  ```ts
  export async function updateTripAction(tripId: string, prev: TripFormState, formData: FormData): Promise<TripFormState>;
  export async function deleteTripAction(tripId: string): Promise<void>;
  // delete-trip-button.tsx ("use client")
  export function DeleteTripButton(props: { tripId: string }): JSX.Element;
  ```

- [ ] **Step 1: `updateTripAction`.** `createTripAction` 과 같은 순서. `tripId` 는 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다. `updateTrip` 이 `false` 면 `notFound()`. DB 오류는 `formError`. 성공 시 `revalidatePath("/trips")`, `revalidatePath(\`/trips/${tripId}\`)`, `redirect(\`/trips/${tripId}\`)`.
- [ ] **Step 2: `deleteTripAction`.** `getCurrentUser()` → `deleteTrip` 이 `false` 면 `notFound()` → `revalidatePath("/trips")` → `redirect("/trips")`.
- [ ] **Step 3: `/trips/[id]/edit`.** `getTrip` 이 `null` 이면 `notFound()`. 제목 "여행 고치기", `TripForm` (`updateTripAction.bind(null, trip.id)`, 기존 값(메모 `null` → `""`), "저장", `/trips/{id}`).
- [ ] **Step 4: `DeleteTripButton`.** 클릭 → `window.confirm("정말 삭제할까요?")` 가 참일 때만 transition 안에서 `deleteTripAction(tripId)`. 진행 중 비활성화. 자세히 보기의 "고치기" 옆에 둔다.
- [ ] **Step 5: 확인** — lint·typecheck 통과, `npm run build` 성공
- [ ] **Step 6: 커밋** — `feat: 여행 고치기와 삭제 (#11)`

---

### Task 7: 테스트 계정으로 브라우저 확인 (사람 확인 두 번)

**Files:** 커밋하는 파일 없음. 쿠키 계산 스크립트와 SQL 은 스크래치패드에 둔다.

- [ ] **Step 1: 준비.** `node_modules/better-auth` 에서 세션 쿠키 이름과 서명 방식, 시크릿이 없을 때 dev 에서 쓰는 기본값을 확인한다. 테스트 사용자 A·B: id `e2e-test-a-<yyyymmdd>`, `e2e-test-b-<yyyymmdd>`, 이메일 `…@example.invalid`, 이름 "테스트 A"/"테스트 B". 각자 `session` 한 행(만료 하루 뒤, 무작위 토큰). B 에게 여행 하나.
- [ ] **Step 2: 넣기 SQL 승인.** INSERT 전문을 사용자에게 보이고 확인을 받은 뒤 실행한다(`DATABASE_URL`, 프로덕션 `main`). 실제 사용자 행은 읽지도 고치지도 않는다.
- [ ] **Step 3: A 로 확인** (`npm run dev` + Playwright, A 의 쿠키):
  - `/` → `/trips` 로 이동, 빈 목록 안내
  - 만들기: 모든 칸 빈 채로 제출 → 네 칸 오류. 끝 날짜 < 시작 날짜 + 메모 입력 후 제출 → 끝 날짜 오류, **이름·여행지·날짜·메모 값이 남아 있음**
  - 올바르게 만들기 → 자세히 보기로 이동, 내용·긴 날짜 표시 확인. 지난 여행 하나도 만들어 두 칸 확인
  - 고치기 → 값이 채워져 있음, 바꿔서 저장 → 자세히 보기에 반영
  - 삭제 → 확인 창 취소 시 남아 있음, 확인 시 `/trips` 로 이동하고 목록에서 사라짐
  - 로그아웃 → `/`
  - 화면 너비 390px 에서 목록·양식이 가로로 넘치지 않음
- [ ] **Step 4: 소유권 확인** (A 의 쿠키): B 의 여행 `/trips/{B}` 와 `/trips/{B}/edit` → 한국어 찾을 수 없음. `/trips/abc` → 똑같이 찾을 수 없음. A 의 여행 고치기·삭제 요청을 Playwright 로 가로채(`page.route`) 실린 여행 id 를 B 의 것으로 바꿔 보낸다 → 찾을 수 없음. 그 뒤 SQL 로 B 의 여행이 그대로인지 확인한다. 비로그인으로 `/trips/new` → `/`.
- [ ] **Step 5: 정리 SQL 승인.** `DELETE FROM "user" WHERE id IN (A, B)` 전문을 보이고 확인을 받아 실행 → `user`·`session`·`trips` 에서 두 id 로 남은 행이 0 개인지 SELECT 로 확인. 확인 중 실패해도 정리는 반드시 한다.
- [ ] **Step 6: 스크린샷** (목록, 오류 상태 양식, 자세히 보기)을 PR 에 올릴 수 있게 저장한다.

---

### Task 8: 리뷰와 PR 마무리

- [ ] **Step 1:** `npm run lint`, `npm run typecheck`, `node --test 'src/**/*.test.mjs'`, `npm run build` 모두 통과
- [ ] **Step 2:** `/code-review` 와 `/security-review` (소유권 코드). CLAUDE.md '리뷰 종료 기준'대로 막는 지적이 0건일 때까지 반복
- [ ] **Step 3:** PR #16 본문 갱신: `Closes #11`, 바뀐 것, 확인한 것(Task 7 목록, 스크린샷), 단위 시험이 CI 에 없다는 점, "남은 지적". 위험 경로를 건드리지 않았으면 "사람 확인 필요"는 넣지 않는다
- [ ] **Step 4:** draft 해제, 자동 머지(squash) 켜기, CI·코멘트 처리
