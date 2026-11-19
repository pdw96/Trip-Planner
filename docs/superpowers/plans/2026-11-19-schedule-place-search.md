# 일정 장소 칸 Google 검색·제목 선택 (#35) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정은 장소만 있으면 제목 없이 저장되고, 일정 양식의 장소 칸에서 Google 장소를 골라 저장하면 '가 볼 곳'에도 함께 들어간다.

**Architecture:** `schedule_items.title` 을 nullable 로 바꾸는 마이그레이션 하나. 입력 검증(`schedule-input.ts`)이 Google 장소 필드 셋을 받아 우선순위로 하나만 고른다. Server Action 이 같은 Google 장소가 이미 있으면 그 장소 id 경로로, 없으면 좌표를 받아 "장소 넣기 + 일정 넣기/고치기"를 데이터를 바꾸는 CTE 한 문으로 실행한다. 화면은 '가 볼 곳'의 자동완성 요소를 공통 컴포넌트로 뽑아 일정 장소 칸에서도 쓰고, 일정 칸에도 `APIProvider`(같은 설정, 스크립트는 전역 한 번)를 둔다.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM 0.45 + neon-http, `@vis.gl/react-google-maps` 1.10 (`PlaceAutocompleteElement`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-19-schedule-place-search-design.md`

## Global Constraints

- `CLAUDE.md` 의 구현 규칙: 쿼리는 `src/db/queries/*.ts`(`import "server-only"`, 첫 인자 `userId`), Server Action 순서 `getCurrentUser()` → 필드별 검증 → `userId` 범위 쿼리 → `revalidatePath`. 남의 것·없는 것은 `notFound()`.
- 여행 접근은 `accessibleTrips(userId)` 하나로만, 하위 id 와 여행 id 를 같은 SQL 문 안에서 묶는다.
- `src/lib/*.ts` 순수 모듈은 다른 모듈을 import 하지 않는다(`node --test 'src/**/*.test.mjs'`).
- Google 값 저장은 `google_place_id` 와 좌표뿐. 좌표는 서버가 `fetchPlaceCoords` 로만 받는다.
- 사용자 문구는 한국어. 새 문구:
  - 제목·장소 모두 없음: `제목이나 장소를 적어 주세요.`
  - 검색 요소 오류: `지금은 장소를 검색할 수 없어요. 직접 적거나 잠시 뒤 다시 해 주세요.`
  - 제목 칸 이름: `제목 (장소가 있으면 선택)`
  - 고른 Google 장소 표시: `📍 <이름> · 가 볼 곳에 새로 넣어요` / 이미 있으면 `📍 <이름> · 가 볼 곳에 있는 장소`, 지우기 버튼 `aria-label="고른 장소 지우기"`
  - 제목 없는 일정 줄의 링크: `📍 지도에서 보기`
- `drizzle/` 아래 생성 파일은 손으로 고치지 않는다. `npm run db:migrate` 는 사람 승인 뒤에만(이 계획에서 실행하지 않음).
- 커밋 전 `npm run lint`, `npm run typecheck` 통과.

## Review Focus

1. Google 장소를 고르고 저장하지 않고 닫기 → '가 볼 곳'에 아무것도 생기지 않는다(서버 호출 없음). Task 6 브라우저 확인.
2. 이미 '가 볼 곳'에 있는 장소를 Google 로 다시 고르기 → 장소가 하나로 남고 그 장소에 이어진다. 클라이언트가 `placeId` 로 바꿔 보내는 경로와, 서버가 Google 필드로 받아 기존 장소를 찾는 경로 둘 다. Task 5 단위(클라이언트 판정 함수), Task 6 브라우저(`page.route` 로 Google 필드 그대로 보내기).
3. 검증 오류로 돌아왔을 때(예: 시각 `25:00` + Google 장소) 고른 Google 장소가 그대로 보이고 다시 저장하면 들어간다. Task 6 브라우저.
4. 남의 여행 id·일정 id 로 Google 필드를 보내면 장소도 일정도 생기지 않고 Google 을 부르지 않는다. Task 6 브라우저 + DB 확인.
5. 제목 없는 일정을 고쳐 저장해도 제목이 null 로 남고(빈 글자로 바뀌지 않음), 줄·완료 체크 이름이 장소 이름으로 보인다. Task 2 단위 + Task 6 브라우저.

---

### Task 1: 제목 nullable 마이그레이션과 일정 줄 표시

**Files:**
- Modify: `src/db/schema.ts:179` (`title: text("title")` — `.notNull()` 제거)
- Create (생성): `drizzle/0004_*.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` 갱신
- Modify: `src/app/trips/[id]/schedule-editor.tsx` (`RowItem.title: string | null`, 줄 표시)
- Modify: `src/app/trips/[id]/schedule-section.tsx` (타입만 맞춤)

**Interfaces:**
- Produces: `ScheduleItem.title: string | null`, `RowItem.title: string | null`.

- [ ] **Step 1:** `schema.ts` 에서 `scheduleItems.title` 의 `.notNull()` 을 뺀다.
- [ ] **Step 2:** `npm run db:generate` 실행. 생성된 SQL 이 정확히 `ALTER TABLE "schedule_items" ALTER COLUMN "title" DROP NOT NULL;` 한 줄인지 확인(다른 문이 있으면 멈추고 보고).
- [ ] **Step 3:** `schedule-editor.tsx` 의 `ScheduleItemRow` 표시: `const name = item.title ?? item.place ?? ""`. 제목 버튼 글자는 `name`. `📍` 링크는 제목이 있으면 지금처럼 `📍 {item.place}`, 제목이 없으면 `📍 지도에서 보기`. 완료 체크 `aria-label={`${name} 완료`}`. 고치기 `initialValues.title` 은 `item.title ?? ""`.
- [ ] **Step 4:** `npm run typecheck` → 통과. `npm run lint` → 통과.
- [ ] **Step 5: Commit** — `git commit -m "feat: 일정 제목을 비울 수 있게 (마이그레이션 0004) (#35)"`

### Task 2: 입력 검증 — 제목 선택, Google 장소 필드

**Files:**
- Modify: `src/lib/schedule-input.ts`
- Test: `src/lib/schedule-input.test.mjs`

**Interfaces:**
- Produces (모두 `schedule-input.ts` 에서 export):
  ```ts
  export type ScheduleFields = {
    date: string; time: string; title: string; place: string; placeId: string; memo: string;
    googlePlaceId: string; googleLabel: string; googleCategory: string; // 빈 값 = Google 장소 안 고름
  };
  export type GooglePlacePick = { googlePlaceId: string; label: string; category: SchedulePlaceCategory };
  export type ScheduleInput = {
    date: string; time: string | null; title: string | null;
    place: string | null; placeId: string | null; memo: string | null;
    google: GooglePlacePick | null; // 있으면 placeId·place 는 null
  };
  export const SCHEDULE_PLACE_CATEGORIES: readonly ["lodging","sight","food","cafe","etc"];
  export type SchedulePlaceCategory = (typeof SCHEDULE_PLACE_CATEGORIES)[number];
  export const TITLE_OR_PLACE_REQUIRED = "제목이나 장소를 적어 주세요.";
  ```
  `EMPTY_SCHEDULE_FIELDS` 에 Google 필드 셋을 `""` 로 더한다.
- 규칙(`place-input.ts` 와 같은 값, import 하지 않고 다시 정의): Google 장소 id `/^[A-Za-z0-9_-]{1,300}$/`, 이름표 1–100자(코드 포인트), 종류는 위 다섯. 셋 중 하나라도 틀리면 `errors.place = "장소를 찾지 못했어요. 다시 검색해 주세요."`.
- 우선순위: `googlePlaceId` 가 비지 않으면 Google(그때 `placeId`·`place` 무시, 둘 다 null, `place` 길이 검사도 하지 않음) → 아니면 `placeId` → 아니면 `place` 글자.
- 제목: 빈 값이면 `null`. 제목·`place`·`placeId`·`googlePlaceId` 가 모두 비면 `errors.title = TITLE_OR_PLACE_REQUIRED`.

- [ ] **Step 1: 실패하는 시험 쓰기.** 기존 `valid` 에 Google 필드 `""` 를 더하고 기존 기대값에 `google: null` 을 더한다. `"requires title"` 을 다음으로 바꾸고 새 시험을 더한다:
  ```js
  test("title or place is required", () => {
    assert.equal(errorsOf({ ...valid, title: "  " }).title, "제목이나 장소를 적어 주세요.");
  });
  test("title is optional when a place is given", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    assert.equal(parseScheduleInput({ ...valid, title: "", place: "역" }, range).value.title, null);
    assert.equal(isOk({ ...valid, title: "", placeId: id }), true);
    assert.equal(isOk({ ...valid, title: "", googlePlaceId: "ChIJabc", googleLabel: "시부야 스카이", googleCategory: "sight" }), true);
  });
  test("google pick wins over placeId and place text", () => {
    const r = parseScheduleInput({ ...valid, placeId: "123e4567-e89b-12d3-a456-426614174000", place: "x".repeat(300),
      googlePlaceId: " ChIJabc ", googleLabel: " 시부야 스카이 ", googleCategory: "sight" }, range);
    assert.deepEqual(r.value.google, { googlePlaceId: "ChIJabc", label: "시부야 스카이", category: "sight" });
    assert.equal(r.value.placeId, null);
    assert.equal(r.value.place, null);
  });
  test("rejects a bad google pick", () => {
    const g = { googlePlaceId: "ChIJabc", googleLabel: "a", googleCategory: "sight" };
    for (const bad of [{ googlePlaceId: "a/b" }, { googleLabel: "" }, { googleLabel: "가".repeat(101) }, { googleCategory: "shop" }]) {
      assert.equal(errorsOf({ ...valid, ...g, ...bad }).place, "장소를 찾지 못했어요. 다시 검색해 주세요.", JSON.stringify(bad));
    }
  });
  ```
  그리고 상수가 `place-input.ts` 와 같은지(시험 파일은 둘 다 import 할 수 있다):
  ```js
  import { PLACE_CATEGORIES } from "./place-input.ts";
  test("categories match place-input", () => {
    assert.deepEqual([...SCHEDULE_PLACE_CATEGORIES], [...PLACE_CATEGORIES]);
  });
  ```
- [ ] **Step 2:** `node --test src/lib/schedule-input.test.mjs` → 새 시험 FAIL.
- [ ] **Step 3:** `parseScheduleInput` 를 위 규칙대로 고친다.
- [ ] **Step 4:** `node --test 'src/**/*.test.mjs'` → 모두 PASS.
- [ ] **Step 5:** `npm run typecheck` 가 `schedule-actions.ts`·`schedule-items.ts` 에서 깨지면(새 필드) 최소로 맞춘다: `readScheduleFields` 가 Google 필드 셋을 읽고, 쿼리는 `input.google` 을 아직 쓰지 않는다(Task 3·4 에서). `npm run lint` 통과.
- [ ] **Step 6: Commit** — `git commit -m "feat: 일정 입력에 제목 선택·Google 장소 필드 (#35)"`

### Task 3: 쿼리 — Google 장소 찾기, 장소+일정 한 문 쓰기

**Files:**
- Modify: `src/db/queries/schedule-items.ts`

**Interfaces:**
- Consumes: `ScheduleInput`, `GooglePlacePick` (Task 2).
- Produces:
  ```ts
  // 이 사용자가 접근할 수 있는 여행 tripId 에 같은 Google 장소가 있으면 그 장소 id. 없거나 id 형식이 틀리면 null.
  export async function findPlaceIdByGoogleId(userId: string, tripId: string, googlePlaceId: string): Promise<string | null>;
  // 장소 넣기(같은 Google 장소가 이미 있으면 그것) + 일정 넣기를 한 문으로. 못 넣었으면 null.
  export async function createScheduleItemWithNewPlace(userId: string, tripId: string,
    input: ScheduleInput & { google: GooglePlacePick }, coords: { lat: number; lng: number }): Promise<string | null>;
  // 장소 넣기(같은 것이 있으면 그것) + 일정 고치기를 한 문으로. 일정이 조건에 안 맞으면 장소도 들어가지 않는다. 바뀐 행이 없으면 false.
  export async function updateScheduleItemWithNewPlace(userId: string, tripId: string, itemId: string,
    input: ScheduleInput & { google: GooglePlacePick }, coords: { lat: number; lng: number }): Promise<boolean>;
  ```
  기존 `createScheduleItem`·`updateScheduleItem` 은 `input.google` 을 쓰지 않는다(`values`/`set` 에 퍼뜨릴 때 `google` 키를 빼고 넘긴다). `title` null 은 그대로 저장된다.

- [ ] **Step 1:** 두 쓰기 함수의 SQL 모양(`db.execute(sql\`…\`)` 또는 Drizzle `$with`, 구현자 판단). 추가:
  ```sql
  WITH t AS (SELECT id FROM trips WHERE id = $tripId AND <accessibleTrips(userId)>),
  new_place AS (
    INSERT INTO places (trip_id, google_place_id, label, category, memo, lat, lng, coords_fetched_at)
    SELECT t.id, $gid, $label, $category, NULL, $lat, $lng, now() FROM t
    ON CONFLICT (trip_id, google_place_id) DO NOTHING
    RETURNING id, label),
  chosen AS (
    SELECT id, label FROM new_place
    UNION ALL
    SELECT p.id, p.label FROM places p JOIN t ON p.trip_id = t.id WHERE p.google_place_id = $gid
    LIMIT 1)
  INSERT INTO schedule_items (trip_id, date, time, title, place, place_id, memo)
  SELECT $tripId, $date, $time, $title, chosen.label, chosen.id, $memo FROM chosen
  RETURNING id;
  ```
  고치기: 같은 `t`·`new_place`·`chosen`, 단 `t` 에 "이 일정이 이 여행에 있음"(`EXISTS (SELECT 1 FROM schedule_items WHERE id = $itemId AND trip_id = t.id)`)을 더해 일정이 없으면 장소도 넣지 않는다. 마지막은 `UPDATE schedule_items SET date, time, title, memo, place = chosen.label, place_id = chosen.id, updated_at = now() FROM chosen WHERE schedule_items.id = $itemId AND schedule_items.trip_id = $tripId RETURNING schedule_items.id`. 매개변수는 열 타입으로 캐스트(`::date`, `::time`, `::text`, `::double precision`). 앞머리에서 `isUuid(tripId)`(고치기는 `itemId` 도)가 아니면 null/false.
- [ ] **Step 2:** `findPlaceIdByGoogleId` — `places` 에서 `google_place_id = $gid` 이고 `places.ts` 의 `placeInAccessibleTrip` 과 같은 조건(여행 id + 접근 가능한 여행). `limit 1`.
- [ ] **Step 3:** `npm run typecheck`, `npm run lint` → 통과. (DB 동작은 Task 6 브라우저 확인에서 본다. 이 세션의 `DATABASE_URL` 은 프로덕션 DB 이고 마이그레이션 전이므로, 그때는 제목이 있는 일정으로 확인한다.)
- [ ] **Step 4: Commit** — `git commit -m "feat: Google 장소와 일정을 한 문으로 쓰는 쿼리 (#35)"`

### Task 4: Server Action — Google 장소 경로

**Files:**
- Modify: `src/app/trips/schedule-actions.ts`
- Modify: `src/app/trips/messages.ts` (`PLACE_SEARCH_UNAVAILABLE` 추가)

**Interfaces:**
- Consumes: Task 3 의 세 함수, `countPlaces`·`MAX_PLACES_PER_TRIP`(`places.ts`), `fetchPlaceCoords`, `PLACE_LIMIT`·`PLACE_NOT_FOUND`·`SAVE_FAILED`.
- Produces: `export const PLACE_SEARCH_UNAVAILABLE = "지금은 장소를 검색할 수 없어요. 직접 적거나 잠시 뒤 다시 해 주세요.";` (`messages.ts`, Task 5 가 씀). 액션 시그니처는 그대로.

- [ ] **Step 1:** 파일 안 도우미(내보내지 않음):
  ```ts
  type GoogleResolution =
    | { kind: "existing"; placeId: string }
    | { kind: "new"; coords: { lat: number; lng: number } }
    | { kind: "error"; message: string };
  async function resolveGooglePlace(userId: string, tripId: string, googlePlaceId: string): Promise<GoogleResolution>;
  ```
  순서: `findPlaceIdByGoogleId` → 있으면 `existing` / 없으면 `countPlaces >= MAX_PLACES_PER_TRIP` → `PLACE_LIMIT` / `fetchPlaceCoords` 실패 → `notFound ? PLACE_NOT_FOUND : SAVE_FAILED` / 성공 → `new`. DB 오류는 `SAVE_FAILED`.
- [ ] **Step 2:** 두 액션: 여행(고치기는 일정도) 접근 확인과 `parseScheduleInput` 은 지금 순서 그대로(남의 것이면 Google 을 부르기 전에 `notFound()`). `parsed.value.google` 이 있으면 `resolveGooglePlace` →
  - `existing`: `{ ...parsed.value, google: null, placeId }` 로 지금의 `createScheduleItem`/`updateScheduleItem` 경로.
  - `new`: `createScheduleItemWithNewPlace`/`updateScheduleItemWithNewPlace`.
  - `error`: `{ values, errors: { place: message }, formError: null, savedAt: prev.savedAt }` (values 에 Google 필드가 남아 있어 양식이 고른 장소를 다시 보인다).
  - 쓰기가 0행이면 지금 규칙(여행·일정이 보이면 `place: "장소를 다시 골라 주세요."` 로, values 의 Google 필드는 비운다 / 아니면 `notFound()`).
  - 성공 후 추가 액션의 반환 `values` 는 지금처럼 `EMPTY_SCHEDULE_FIELDS`(+date).
- [ ] **Step 3:** `npm run typecheck`, `npm run lint` → 통과.
- [ ] **Step 4: Commit** — `git commit -m "feat: 일정 저장 때 Google 장소를 가 볼 곳에 함께 넣기 (#35)"`

### Task 5: 화면 — 공통 자동완성, 일정 장소 칸, Provider

**Files:**
- Create: `src/app/trips/[id]/google-place-search.tsx` (`'use client'`)
- Modify: `src/app/trips/[id]/place-add-form.tsx` (공통 컴포넌트 사용)
- Modify: `src/app/trips/[id]/schedule-item-form.tsx` (`PlaceField`, 제목 칸 이름, 숨은 값)
- Modify: `src/app/trips/[id]/schedule-editor.tsx` (`ScheduleEditorProvider` 에 `browserKey`, `APIProvider`)
- Modify: `src/app/trips/[id]/schedule-section.tsx` (`browserKey` 전달)
- Modify: `src/lib/schedule.ts` + Test `src/lib/schedule.test.mjs` (판정 함수)

**Interfaces:**
- Consumes: `ScheduleFields` 의 Google 필드(Task 2), `PLACE_SEARCH_UNAVAILABLE`(Task 4), `guessCategory`, `PLACE_NOT_FOUND`.
- Produces:
  ```ts
  // google-place-search.tsx — APIProvider 안에서만. 고르면 fetchFields(["displayName","primaryType","types"]) 후 onPick.
  export type GooglePick = { googlePlaceId: string; label: string; category: PlaceCategory };
  export function GooglePlaceSearch(props: { onPick: (pick: GooglePick) => void; onError: (message: string) => void;
    ariaLabel?: string }): React.ReactNode;
  // schedule.ts (순수) — 고른 Google 장소가 이 여행 장소 중 하나면 그 id.
  export function existingPlaceIdFor(googlePlaceId: string, places: { id: string; googlePlaceId: string }[]): string | null;
  // ScheduleEditorProvider: { places, browserKey: string | null, children }
  ```

- [ ] **Step 1: 실패하는 시험** (`schedule.test.mjs`):
  ```js
  test("existingPlaceIdFor finds a trip place by google id", () => {
    const places = [{ id: "a", googlePlaceId: "G1" }, { id: "b", googlePlaceId: "G2" }];
    assert.equal(existingPlaceIdFor("G2", places), "b");
    assert.equal(existingPlaceIdFor("G3", places), null);
  });
  ```
  `node --test src/lib/schedule.test.mjs` → FAIL. 구현 → PASS.
- [ ] **Step 2:** `GooglePlaceSearch`: `place-add-form.tsx` 의 `PlaceSearch` 안 요소 생성·`gmp-select`·늦게 온 응답 무시(`pickCount`)·정리 로직을 옮긴다. `PLACE_NOT_FOUND` 는 `onError` 로. 요소의 `gmp-error` 이벤트 → `onError(PLACE_SEARCH_UNAVAILABLE)`. 스크립트를 불러오는 동안 `장소 검색을 불러오는 중…`. `PlaceAddForm` 은 이것을 쓰고 동작은 그대로(고르면 `PlaceDraftForm`, 취소하면 검색칸 비우기 — 비우기가 필요하면 `GooglePlaceSearch` 를 key 로 다시 만든다).
- [ ] **Step 3:** `ScheduleEditorProvider` 가 `browserKey` 가 있으면 자식을 `<APIProvider apiKey={browserKey} language="ko">` 로 감싼다(지도 칸과 같은 설정. 라이브러리는 전역 한 번 불러오므로 둘이어도 된다). context 에 `searchEnabled: boolean` 을 더해 양식에 넘긴다. `schedule-section.tsx` 는 `process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || null` 을 넘긴다.
- [ ] **Step 4:** `PlaceField` 를 다시 짠다. 장소 수와 관계없이 항상 이 컴포넌트(지금의 `places.length > 0` 갈림 제거). 상태: `pick: GooglePick | null`(처음은 `values.googlePlaceId` 가 있으면 values 의 Google 필드로).
  - `pick` 없음: `searchEnabled` 면 `GooglePlaceSearch` → 그 아래 지금의 고르기(`places.length > 0` 일 때만)와 직접 적기 칸(지금 규칙 그대로).
  - `pick` 있음: 고르기·글자 칸 대신 `📍 {label} · 가 볼 곳에 새로 넣어요`(또는 `existingPlaceIdFor` 가 id 를 주면 `· 가 볼 곳에 있는 장소`) + 지우기 버튼. 숨은 값: 기존 장소면 `placeId=<그 id>` 만, 아니면 `googlePlaceId`·`googleLabel`·`googleCategory`.
  - 검색 오류(`onError`)는 장소 칸 오류 자리에 보인다(서버 오류 `error` 와 같은 자리, 서버 오류가 우선).
  - 지금처럼 결과마다 `resultKey` 로 다시 만든다.
- [ ] **Step 5:** 제목 칸 이름을 `제목 (장소가 있으면 선택)` 으로. 초점은 그대로 제목 칸.
- [ ] **Step 6:** `npm run typecheck`, `npm run lint`, `node --test 'src/**/*.test.mjs'` → 통과.
- [ ] **Step 7: Commit** — `git commit -m "feat: 일정 장소 칸에서 Google 장소 검색 (#35)"`

### Task 6: 확인, 리뷰, PR

- [ ] **Step 1:** `npm run build`(가짜 환경 변수는 CI 와 같게) → 성공.
- [ ] **Step 2: 브라우저 확인** (`run` 스킬, Playwright, `docs/status.md` '알아 둘 것'의 테스트 계정 절차 — 행 넣기·지우기 SQL 을 사용자에게 보이고 각각 확인. `NODE_USE_ENV_PROXY=1 npm run dev`). 마이그레이션 전이므로 제목 없는 저장은 DB 가 거절한다 → 제목 있는 경우로 Google 흐름을, 제목 없는 경우는 서버가 `title: null` 을 보내는지(저장 실패 문구)까지만 보고 PR 본문에 "마이그레이션 적용 뒤 다시 확인"으로 적는다. 볼 것: Review Focus 1–4, 장소 없는 여행에서 검색칸, 휴대폰 너비(390px) 자동완성 목록, 브라우저 키 없이 띄우면 검색칸 숨김, '가 볼 곳' 넣기가 그대로 동작.
- [ ] **Step 3:** `/code-review`, 소유권 쿼리를 건드렸으므로 `/security-review`. 막는 지적을 고친다(`CLAUDE.md` 리뷰 종료 기준).
- [ ] **Step 4:** PR(draft). 맨 위 "사람 확인 필요: 마이그레이션(`src/db/schema.ts`, `drizzle/`)". SQL 전문, 파괴적 아님, 되돌리기(spec §5.1), `Closes #35`, 남은 지적. 자동 머지는 켜지 않는다. `subscribe_pr_activity`.
- [ ] **Step 5:** `human-approved` 뒤: 사람 확인 받고 `npm run db:migrate` → 제목 없는 일정 저장·표시를 브라우저로 확인(Review Focus 5) → 자동 머지 켜기.
- [ ] **Step 6:** 배포 확인 뒤 `docs/status.md` 갱신(끝난 것 표, 남은 확인에 "프로덕션 장소 검색·할당량 사용량 확인").
