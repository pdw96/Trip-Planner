# 여행별 가 볼 장소·지도·동선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행 자세히 보기에 Google 지도·가 볼 장소 목록·날마다 기준점·하루 동선(앱 안 대중교통 정보)을 더하고, 일정이 장소를 고를 수 있게 잇는다.

**Architecture:** 판단 로직(거리, 동선 만들기, 시각 계산, 구간 표시 결정, 입력 검증, 종류 짐작)은 `src/lib/` 의 순수 모듈로 두고 `node --test` 로 시험한다. DB 는 `places`·`trip_bases` 두 테이블과 `schedule_items.place_id` 를 더하고, 모든 쿼리는 `accessibleTrips(userId)` 를 같은 SQL 문 안에 건다. Google 호출(Place Details·Routes)은 `server-only` 모듈 하나가 서버 키로만 하고, 지도·자동완성은 말단 Client Component 가 브라우저 키로 한다. 하루 동선의 구간 정보는 N일차 탭을 열 때 Server Action 으로 받아 오고 저장하지 않는다.

**Tech Stack:** Next.js 16 App Router(`cacheComponents`), React 19, Drizzle ORM + Neon(neon-http), Tailwind 4, `@vis.gl/react-google-maps`(Google 이 관리하는 React 래퍼, 새 의존성), Places API (New), Routes API, Maps JavaScript API.

**Spec:** `docs/superpowers/specs/2026-11-18-trip-places-map-design.md` (승인됨). 섹션 번호(§)는 이 문서를 가리킨다. 실행자는 계획과 설계를 함께 읽는다.

## Global Constraints

- CLAUDE.md '규칙'·'구현 규칙' 전부: `getCurrentUser()` 만, Server Action 순서(사용자 → 필드별 검증 → `userId` 범위 쿼리 → `revalidatePath`), 남의 것과 없는 것은 같은 반응, uuid 형식이 틀리면 쿼리 전에 `null`/`false`, 사용자 문구는 한국어.
- `src/lib/*.ts` 중 `node --test` 대상은 다른 모듈을 import 하지 않는다(타입도 파일 안에서 정의). 시험 파일은 `src/lib/<이름>.test.mjs`, `import … from "./<이름>.ts"`.
- 구현 전에 `node_modules/next/dist/docs/` 의 폼·데이터 변경 문서(`02-guides/forms.md`, `01-getting-started/07-mutating-data.md`)를 읽는다(AGENTS.md).
- Google 약관(§3.2): DB 에 저장하는 Google 값은 `google_place_id`(무기한)와 `lat`·`lng`(30일)뿐. 경로 정보·나라·시간대·주소·Google 이름은 저장하지 않는다. 이름은 사용자가 확인한 이름표(`label`)로만 저장한다.
- 서버 키는 서버에서만: `GOOGLE_MAPS_SERVER_KEY`, 머리글 `X-Goog-Api-Key`. 브라우저: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
- 한도(§5.8): 이름표 1–100자, 메모 200자 이하(코드 포인트), Google 장소 id `^[A-Za-z0-9_-]{1,300}$`, 종류 `lodging`·`sight`·`food`·`cafe`·`etc`.
- 문구(§5.3, 최종 표현은 화면에서 사용자와 다듬음):
  - 국내 안내: "국내에서는 대중교통 길찾기만 돼요. Google 지도의 국내 도보·자동차 길찾기는 지도 데이터 반출 규제로 막혀 있다가 2026년 11월 규제가 풀렸고, Google 이 아직 출시하지 않았어요."
  - 일본 안내: "일본은 Google 이 앱에 대중교통 정보를 주지 않아요. Google 지도에서는 볼 수 있어요."
  - 그 밖: "이 지역은 Google 이 대중교통 정보를 주지 않아요."
  - 실패: "이동 정보를 불러오지 못했어요.", 좌표 갱신 실패: "위치 정보를 다시 불러오지 못했어요.", 중복: "이미 목록에 있는 장소예요.", 장소 못 찾음: "장소를 찾지 못했어요. 다시 검색해 주세요.", 저장 실패: `SAVE_FAILED`(`src/app/trips/messages.ts`).
- 커밋 전 `npm run lint`, `npm run typecheck`, `node --test 'src/**/*.test.mjs'` 통과. 커밋 메시지 끝에 세션의 Co-Authored-By·Claude-Session 줄.

## Review Focus

1. **좌표가 없는 장소**(30일 갱신 실패 → `lat`/`lng` null): 지도 핀·동선·거리 정렬에서 빠지고 화면은 깨지지 않는다. → Task 3 `buildDayRoute`·`sortByDistance` 시험.
2. **구간이 0개인 날**(장소 하나뿐이고 기준점이 그 장소, 또는 이어진 장소 없음): 빈 구간 목록 + "이 날 일정에 고른 장소가 없어요"/기준점만. → Task 3 시험.
3. **한국↔일본처럼 나라가 다른 두 장소의 구간**(비행기 이동 날): 대중교통 없음 → 한국 규칙(직선 + 국내 안내)이 먼저, WALK 를 묻지 않는다. → Task 5 시험.
4. **동시에 같은 장소를 두 번 넣기**(더블클릭·두 사람): 유니크 위반을 "이미 목록에 있는 장소예요."로 바꾼다, 500 이 아니다. → Task 8 Step 확인.
5. **이어진 장소를 지운 일정**: 일정은 남고 `place` 글자(이름표)도 남고, 지도에서만 빠진다. 기준점이던 장소면 앞 기준점이 이어진다. → Task 3(`baseForDate`) 시험 + Task 12 브라우저 확인.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/geo.ts` (+test) | 하버사인 거리, 거리 표기, 가까운 순 정렬 |
| `src/lib/place-input.ts` (+test) | 장소 입력 검증, Google 유형 → 종류 짐작 |
| `src/lib/day-route.ts` (+test) | 날의 기준점, 하루 동선(구간 목록·구간별 시각 조건), 좌표 갱신 대상 |
| `src/lib/route-time.ts` (+test) | 현지 날짜·시각 + IANA 시간대 → UTC, 지난 날짜를 앞날 같은 요일로 |
| `src/lib/leg-display.ts` (+test) | Routes 응답 요약 → 구간 표시, 나라 코드 → 대체 규칙·안내 종류, Google 지도 링크 |
| `src/lib/schedule-input.ts` (수정, +test) | `placeId` 필드 |
| `src/db/schema.ts`, `drizzle/0003_*.sql` | `places`, `trip_bases`, `schedule_items.place_id` |
| `src/db/queries/places.ts` | 장소 목록·넣기·고치기·지우기·좌표 갱신 |
| `src/db/queries/trip-bases.ts` | 기준점 목록·정하기 |
| `src/db/queries/schedule-items.ts` (수정) | `place_id` 잇기(같은 여행 장소만, 같은 문 안) |
| `src/lib/google-maps-server.ts` | `server-only`. Place Details(좌표 / 나라·시간대), Routes(TRANSIT·WALK) |
| `src/app/trips/place-actions.ts` | 장소·기준점 Server Action |
| `src/app/trips/route-actions.ts` | `loadDayRouteAction(tripId, date)` |
| `src/app/trips/schedule-actions.ts` (수정) | `placeId` 읽기 |
| `src/app/trips/[id]/map-section.tsx` | Server: 장소·기준점·일정을 읽고(좌표 갱신 포함) 패널에 넘김 |
| `src/app/trips/[id]/trip-map-panel.tsx` | Client: 탭, 지도, 구간 목록, 안내, 가 볼 곳 목록, 약관 링크 |
| `src/app/trips/[id]/place-add-form.tsx` | Client: 자동완성 → 이름표·종류·메모 → 넣기 |
| `src/app/trips/[id]/place-row.tsx` | Client: ⋯ 메뉴(이름표·종류·메모 고치기, 지우기) |
| `src/app/trips/[id]/schedule-item-form.tsx`, `schedule-editor.tsx`, `schedule-section.tsx` (수정) | 장소 고르기, 이어진 장소 링크 |
| `src/app/trips/[id]/page.tsx` (수정) | 지도 칸을 일정 위에 |
| `.env.example`, `package.json`, `package-lock.json` | 키 이름, 의존성 |

---

### Task 1: 거리 (`geo.ts`)

**Files:** Create `src/lib/geo.ts`, Test `src/lib/geo.test.mjs`

**Interfaces:**
- Produces:
  - `type LatLng = { lat: number; lng: number }`
  - `distanceMeters(a: LatLng, b: LatLng): number` — 하버사인, 지구 반지름 6371008.8 m
  - `formatDistance(meters: number): string` — 1000 m 미만 `"850m"`(정수 반올림), 이상 `"3.4km"`(소수 한 자리), 100 km 이상 `"123km"`(정수)
  - `sortByDistance<T extends { lat: number | null; lng: number | null }>(items: T[], from: LatLng): { item: T; meters: number | null }[]` — 좌표 있는 것 가까운 순, 좌표 없는 것은 맨 뒤(원래 순서 유지, `meters: null`)

- [ ] **Step 1: 실패하는 시험 쓰기** — `geo.test.mjs`:
  - `distanceMeters` 서울역(37.5547,126.9707)→부산역(35.1152,129.0422) 이 320–330 km 사이, 같은 점은 0.
  - `formatDistance(849.6)` → `"850m"`, `formatDistance(3449)` → `"3.4km"`, `formatDistance(123456)` → `"123km"`.
  - `sortByDistance` 에 `{id:"far"}`(먼 점), `{id:"none", lat:null, lng:null}`, `{id:"near"}` → id 순서 `["near","far","none"]`, `none` 의 `meters` 는 `null`.
- [ ] **Step 2:** `node --test src/lib/geo.test.mjs` → FAIL(모듈 없음)
- [ ] **Step 3:** `geo.ts` 구현(파일 맨 위 한 줄 주석: 순수 모듈, import 없음)
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `feat(#13): 좌표 거리·표기·가까운 순 정렬`

### Task 2: 장소 입력 검증·종류 짐작 (`place-input.ts`)

**Files:** Create `src/lib/place-input.ts`, Test `src/lib/place-input.test.mjs`

**Interfaces:**
- Produces:
  - `const PLACE_CATEGORIES = ["lodging","sight","food","cafe","etc"] as const`, `type PlaceCategory`
  - `const CATEGORY_LABELS: Record<PlaceCategory,string>` = 숙소·관광·맛집·카페·기타
  - `type PlaceFields = { googlePlaceId: string; label: string; category: string; memo: string }`
  - `type PlaceInput = { googlePlaceId: string; label: string; category: PlaceCategory; memo: string | null }`
  - `type PlaceFieldErrors = Partial<Record<keyof PlaceFields, string>>`
  - `parsePlaceInput(raw: PlaceFields): { ok: true; value: PlaceInput } | { ok: false; errors: PlaceFieldErrors }`
  - `parsePlaceEdit(raw: Omit<PlaceFields,"googlePlaceId">): { ok: true; value: Omit<PlaceInput,"googlePlaceId"> } | { ok: false; errors: PlaceFieldErrors }`
  - `isGooglePlaceId(value: string): boolean`
  - `guessCategory(primaryType: string | null, types: string[]): PlaceCategory`
  - `type PlaceFormState = { values: PlaceFields; errors: PlaceFieldErrors; formError: string | null; savedAt: number | null }` (#12 `ScheduleFormState` 와 같은 모양)

- [ ] **Step 1: 실패하는 시험** — 
  - `parsePlaceInput` 정상: 앞뒤 공백 제거, 빈 메모 → `null`.
  - 이름표 `""` → `errors.label === "이름을 입력해 주세요."`, 101자 → `"100자 이하로 입력해 주세요."`, 이모지 100개는 통과(코드 포인트).
  - 메모 201자 → 오류. 종류 `"hotel"` → `errors.category === "종류를 골라 주세요."`.
  - Google id `"ChIJOWucdKiMGGARbppa4b4CKA8"` 통과, `"a b"`·`""`·301자 → `errors.googlePlaceId === "장소를 찾지 못했어요. 다시 검색해 주세요."`.
  - `guessCategory`: `("lodging",[])`→lodging, `(null,["hotel"])`→lodging, `("ramen_restaurant",[…])`→food, `("cafe",[])`→cafe, `("coffee_shop",[])`→cafe, `("bakery",[])`→cafe, `("bar",[])`→food, `("museum",[])`→sight, `("tourist_attraction",[])`→sight, `("park",[])`→sight, `(null,["point_of_interest","establishment"])`→sight, `("dentist",["health"])`→etc. 규칙: primaryType 먼저, 없거나 안 맞으면 types 를 앞에서부터. 맛집은 `*_restaurant`·`restaurant`·`food`·`meal_takeaway`·`meal_delivery`·`bar`·`food_court`, 카페는 `cafe`·`coffee_shop`·`bakery`·`tea_house`·`dessert_shop`, 숙소는 `lodging`·`hotel`·`motel`·`hostel`·`resort_hotel`·`guest_house`·`bed_and_breakfast`·`inn`, 관광은 `tourist_attraction`·`museum`·`park`·`art_gallery`·`historical_landmark`·`amusement_park`·`zoo`·`aquarium`·`church`·`hindu_temple`·`buddhist_temple`·`shrine`·`point_of_interest`·`natural_feature`·`shopping_mall`·`market`.
- [ ] **Step 2:** `node --test src/lib/place-input.test.mjs` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS
- [ ] **Step 5:** 커밋 `feat(#13): 장소 입력 검증과 종류 짐작`

### Task 3: 기준점·하루 동선 (`day-route.ts`)

**Files:** Create `src/lib/day-route.ts`, Test `src/lib/day-route.test.mjs`

**Interfaces:**
- Produces:
  - `type RoutePlace = { id: string; label: string; googlePlaceId: string; lat: number | null; lng: number | null }`
  - `type BaseRow = { startDate: string; placeId: string | null }`
  - `baseForDate(rows: BaseRow[], date: string): string | null` — `startDate <= date` 중 가장 늦은 행의 `placeId`, 없으면 `null` (§5.5)
  - `type DayStop = { placeId: string; time: string | null }` — 그날 일정 중 `place_id` 있는 것, 일정 순서(#12 정렬)대로, `time` 은 `"HH:MM"` 또는 null
  - `type LegTiming = { kind: "arrival"; time: string } | { kind: "departure"; time: string }`
  - `type DayLeg = { from: RoutePlace; to: RoutePlace; fromIsBase: boolean; toIsBase: boolean; timing: LegTiming; straightMeters: number }`
  - `type DayRoute = { base: RoutePlace | null; stops: { place: RoutePlace; number: number }[]; legs: DayLeg[] }`
  - `type LatLng = { lat: number; lng: number }` (이 파일 안에 다시 정의)
  - `buildDayRoute(stops: DayStop[], baseId: string | null, places: Map<string, RoutePlace>, distance: (a: LatLng, b: LatLng) => number): DayRoute`
  - `needsCoordsRefresh(fetchedAt: Date, now: Date): boolean` — 30일(30×24h) 넘으면 true
  - `const DEFAULT_DEPART = "10:00"`

규칙(§5.1, §5.3 '시각'):
- 좌표가 없거나 `places` 에 없는 장소는 stops·base 에서 뺀다.
- 순서: base → stops → base. base 가 없으면 첫 stop 에서 시작, 마지막 stop 에서 끝(돌아오는 구간 없음).
- 연달아 같은 장소인 구간은 뺀다. 번호는 base 를 뺀 stop 순서로 1부터(뺀 중복 stop 은 번호 없음).
- `timing`: 도착 쪽이 stop 이고 그 stop 에 시각이 있으면 `arrival`, 아니면 출발 쪽 stop 에 시각이 있으면 `departure`, 둘 다 아니면 `departure` `DEFAULT_DEPART`. base 는 시각이 없다.
- `straightMeters` 는 넷째 인자 `distance` 로 구한다. 순수 모듈 규칙(import 금지) 때문에 `geo.ts` 를 import 하지도, 하버사인을 복사하지도 않는다. 호출하는 쪽(서버)이 Task 1 `distanceMeters` 를 넘긴다.

- [ ] **Step 1: 실패하는 시험** — 장소 A(숙소), B, C(좌표 있음), D(좌표 null). 시험의 `distance` 는 `() => 1`.
  - `baseForDate([{startDate:"2026-12-03",placeId:"A"},{startDate:"2026-12-05",placeId:null}], "2026-12-04")` → `"A"`; `"2026-12-05"` → `null`; `"2026-12-02"` → `null`; 시작 전 날짜 행 `{startDate:"2026-12-01",placeId:"A"}` 만 있을 때 `"2026-12-03"` → `"A"`.
  - base A, stops `[B 09:30, C null]` → legs `A→B arrival 09:30`, `B→C departure 09:30`, `C→A departure 10:00`; stops 번호 B=1, C=2.
  - base 없음, stops `[B, C]` → legs 1개 `B→C`.
  - base A, stops `[A 12:00, B]` → `A→A` 는 빠짐, legs `A→B departure 12:00`, `B→A departure 10:00`.
  - stops `[D]`, base A → D 빠짐, legs `[]`, stops `[]`, base A. (Review Focus 1·2)
  - stops `[]`, base 없음 → legs `[]`, base `null`.
  - `needsCoordsRefresh(new Date("2026-10-18T00:00:00Z"), new Date("2026-11-18T00:00:01Z"))` → true, 29일 전 → false.
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS
- [ ] **Step 5:** 커밋 `feat(#13): 날의 기준점과 하루 동선 만들기`

### Task 4: 현지 시각 → 요청 시각 (`route-time.ts`)

**Files:** Create `src/lib/route-time.ts`, Test `src/lib/route-time.test.mjs`

**Interfaces:**
- Produces:
  - `zonedToUtc(date: string, time: string, timeZone: string): Date` — `"2026-12-04"`,`"09:30"`,`"Europe/Paris"` 의 현지 시각을 UTC 로. `Intl.DateTimeFormat` 으로 그 순간의 오프셋을 구해 두 번 보정(서머타임 경계 대응). import 없음.
  - `requestInstant(date: string, time: string, timeZone: string, now: Date, maxAheadDays: number): Date` — `zonedToUtc` 결과가 `now` 이전이면 7일씩 더해 `now` 이후가 될 때까지(같은 요일·같은 현지 시각, 매번 `zonedToUtc` 로 다시 계산), `now + maxAheadDays` 를 넘으면 그 안에 들어올 때까지 7일씩 뺀다(그래도 `now` 이전이면 `now` 이후 첫 같은 요일).
  - `const ROUTES_MAX_AHEAD_DAYS: number` — Step 0 에서 정한 값.

- [ ] **Step 0: Routes API 허용 범위 확인** — 클라우드 세션의 서버 키(프록시 주입)로 서울 경복궁(37.5796,126.9770)→남산(37.5512,126.9882) TRANSIT 을 `departureTime` 1일 전, 30일 후, 60일 후, 100일 후, 200일 후로 호출한다(설계 §3.1 의 curl 형식, `X-Goog-FieldMask: routes.duration`). 오류(400 등) 나는 경계를 찾아 `ROUTES_MAX_AHEAD_DAYS` 를 그보다 하루 작게 정하고, 과거 시각이 받아지는지도 기록한다. 결과를 이 파일 맨 위 주석에 날짜와 함께 적는다.
- [ ] **Step 1: 실패하는 시험** —
  - `zonedToUtc("2026-12-04","09:30","Asia/Tokyo").toISOString()` → `"2026-12-04T00:30:00.000Z"`.
  - 파리 겨울 `("2026-12-04","09:30","Europe/Paris")` → `"…T08:30:00.000Z"`, 여름 `("2027-07-01","09:30","Europe/Paris")` → `"2027-07-01T07:30:00.000Z"`.
  - 서머타임 시작일 `("2027-03-28","10:00","Europe/Paris")` → `"2027-03-28T08:00:00.000Z"`.
  - `requestInstant("2026-11-01","10:00","Asia/Seoul", now=2026-11-18T00:00Z, 100)` → 2026-11-22(일) 10:00 KST = `"2026-11-22T01:00:00.000Z"`.
  - 먼 미래 `("2027-06-01",…, now=2026-11-18, 100)` → `now` 이후 100일 안, 요일이 2027-06-01 과 같고 현지 10:00.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS
- [ ] **Step 5:** 커밋 `feat(#13): 현지 시각을 Routes 요청 시각으로`

### Task 5: 구간 표시 결정 (`leg-display.ts`)

**Files:** Create `src/lib/leg-display.ts`, Test `src/lib/leg-display.test.mjs`

**Interfaces:**
- Produces:
  - `type TransitSummary = { durationSeconds: number; lineName: string | null; vehicle: string | null; transfers: number; polyline: string | null }` — 대중교통 단계가 하나 이상일 때만
  - `type WalkSummary = { durationSeconds: number; polyline: string | null }`
  - `summarizeTransit(response: unknown): TransitSummary | null` — Routes `computeRoutes` JSON 에서 `routes[0]`. 대중교통 단계(`legs[].steps[].transitDetails`)가 없으면(빈 `{}`, 걷기만) `null`. `lineName` 은 첫 대중교통 단계의 `transitLine.nameShort ?? transitLine.name`, `vehicle` 은 `transitLine.vehicle.type`, `transfers` = 대중교통 단계 수 − 1, `durationSeconds` 는 `"2223s"` 를 숫자로.
  - `summarizeWalk(response: unknown): WalkSummary | null`
  - `fallbackRule(fromCountry: string | null, toCountry: string | null): { askWalk: boolean; notice: "kr" | "jp" | "other" | null }` — 하나라도 `KR` → `{askWalk:false, notice:"kr"}`; 아니고 하나라도 `JP` → `{askWalk:true, notice:"jp"}`; 둘 다 알면 `{askWalk:true, notice:"other"}`; 나라를 하나라도 모르면 `{askWalk:true, notice:null}` (§5.3 6: 실패 시 안내 없음)
  - `const WALK_MAX_SECONDS = 3600`
  - `type LegResult = { kind: "transit"; transit: TransitSummary } | { kind: "walk"; walk: WalkSummary; notice: "jp" | "other" | null } | { kind: "straight"; notice: "kr" | "jp" | "other" | null } | { kind: "failed" }`
  - `decideLeg(transit: TransitSummary | null, walk: WalkSummary | null, rule: ReturnType<typeof fallbackRule>): LegResult` — transit 있으면 transit; 없고 `askWalk` 이고 walk 가 `WALK_MAX_SECONDS` 이하면 walk; 아니면 straight(notice 그대로)
  - `legText(result: LegResult): string` — transit `"🚇 18분 · JR 야마노테선"`(vehicle `SUBWAY`/`HEAVY_RAIL`/`COMMUTER_TRAIN`/`HIGH_SPEED_TRAIN`/`RAIL`/`TRAM`/`MONORAIL`/`LIGHT_RAIL` → 🚇, `BUS`/`INTERCITY_BUS`/`TROLLEYBUS` → 🚌, 그 밖 🚆) + 환승 있으면 `" · 환승 1회"`; walk `"🚶 25분 (대중교통 정보 없음)"`; straight `""`(거리만 보임); failed `"이동 정보를 불러오지 못했어요."`. 분은 반올림, 최소 1분, 60분 이상은 `"1시간 5분"`.
  - `const NOTICES: Record<"kr"|"jp"|"other", string>` — Global Constraints 문구 그대로
  - `directionsUrl(from: {label:string; googlePlaceId:string}, to: …): string` — §5.3 5 형식, `URLSearchParams` 로 인코딩
  - `placeUrl(p: {label:string; googlePlaceId:string}): string` — §5.1 형식

- [ ] **Step 1: 실패하는 시험** — §3.1 시험 응답을 줄인 고정값 사용:
  - 서울 응답(WALK 단계 + BUS 01A 단계, `duration:"2223s"`) → `summarizeTransit` `{durationSeconds:2223, lineName:"01A", vehicle:"BUS", transfers:0}`; `legText` → `"🚌 37분 · 01A"`.
  - `{}` → `null`; 오사카처럼 WALK 단계만 있는 응답 → `null`.
  - SUBWAY 두 단계 → `transfers:1`, 텍스트에 `"· 환승 1회"`.
  - `fallbackRule("KR","JP")` → `{askWalk:false, notice:"kr"}` (Review Focus 3); `("JP","JP")` → jp; `("FR","FR")` → other; `(null,"FR")` → `{askWalk:true, notice:null}`.
  - `decideLeg(null, {durationSeconds:3601,…}, jp규칙)` → `{kind:"straight", notice:"jp"}`; 3600 → walk.
  - `legText` walk 3976초 → `"🚶 1시간 6분 (대중교통 정보 없음)"`.
  - `directionsUrl` 에 `travelmode=transit`, `origin_place_id`, 한글 이름이 인코딩됨.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS
- [ ] **Step 5:** 커밋 `feat(#13): Routes 응답을 구간 표시로`

### Task 6: 일정 입력에 장소 선택 (`schedule-input.ts`)

**Files:** Modify `src/lib/schedule-input.ts`, `src/lib/schedule-input.test.mjs`

**Interfaces:**
- Produces: `ScheduleFields` 에 `placeId: string`(빈 값 = 직접 적기), `ScheduleInput` 에 `placeId: string | null`, `EMPTY_SCHEDULE_FIELDS.placeId = ""`.

- [ ] **Step 1: 실패하는 시험** — `placeId: ""` → `value.placeId === null`; uuid → 그대로; `"not-a-uuid"` → `errors.place === "장소를 다시 골라 주세요."`. 기존 시험의 입력 객체에 `placeId: ""` 를 더한다. uuid 검사는 이 파일 안에 정규식으로(`ids.ts` import 금지).
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** `node --test 'src/**/*.test.mjs'` PASS
- [ ] **Step 5:** 커밋 `feat(#13): 일정 입력에 장소 선택 필드`

### Task 7: 스키마·마이그레이션

**Files:** Modify `src/db/schema.ts`; Create `drizzle/0003_*.sql`(생성), `drizzle/meta/*`(생성)

**Interfaces:**
- Produces: `places`, `tripBases` 테이블, `scheduleItems.placeId`, 타입 `Place`, `TripBase`. 컬럼은 §5.6 그대로:
  - `places`: `id` uuid PK random, `tripId` → trips cascade, `googlePlaceId` text not null, `label` text not null, `lat`/`lng` `doublePrecision` null, `coordsFetchedAt` timestamptz not null, `category` text not null + check `places_category_check` in 다섯 값, `memo` text null, `createdAt`/`updatedAt`(trips 와 같은 방식). `uniqueIndex("places_trip_google_place_idx").on(tripId, googlePlaceId)`, `index("places_trip_id_idx").on(tripId)`.
  - `scheduleItems.placeId`: uuid null → `places.id` `onDelete: "set null"`.
  - `tripBases`: `tripId` → trips cascade, `startDate` date not null, `placeId` uuid null → `places.id` cascade, `createdAt`/`updatedAt`, `primaryKey({ columns: [tripId, startDate] })`.
  - 파일 맨 위 주석에 "Google 값은 place id 와 좌표(30일)만 저장(§3.2)" 한 줄.

- [ ] **Step 1:** `schema.ts` 수정
- [ ] **Step 2:** `npm run db:generate` → `drizzle/0003_*.sql` 생성. 손대지 않는다.
- [ ] **Step 3:** SQL 을 읽고 `CREATE TABLE "places"`, `CREATE TABLE "trip_bases"`, `ALTER TABLE "schedule_items" ADD COLUMN "place_id" uuid`, FK·인덱스·check 만 있고 DROP·타입 변경·NOT NULL 추가가 없는지 확인(비파괴). 있으면 멈추고 사용자에게 보고.
- [ ] **Step 4:** `npm run typecheck` PASS
- [ ] **Step 5:** 커밋 `feat(#13): places·trip_bases 테이블, 일정 place_id (마이그레이션 0003)`. **적용(`db:migrate`)은 하지 않는다**(Task 12).

### Task 8: 쿼리 (`places.ts`, `trip-bases.ts`, `schedule-items.ts`)

**Files:** Create `src/db/queries/places.ts`, `src/db/queries/trip-bases.ts`; Modify `src/db/queries/schedule-items.ts`

**Interfaces:**
- Consumes: `accessibleTrips` (`trips.ts`), `isUuid`, Task 2 `PlaceInput`, Task 6 `ScheduleInput`.
- Produces (모두 `import "server-only"`, 첫 인자 `userId`, 여행 접근 조건은 `schedule-items.ts` 의 `inAccessibleTrip` 과 같은 방식으로 같은 문 안에):
  - `listPlaces(userId, tripId): Promise<Place[]>` — `createdAt, id` 순
  - `createPlace(userId, tripId, input: PlaceInput, coords: {lat:number; lng:number}): Promise<{ ok: true; id: string } | { ok: false; reason: "not_found" | "duplicate" }>` — 접근 확인 → insert. 유니크 위반(Postgres `23505`, 제약 이름 `places_trip_google_place_idx`)은 `duplicate`. 그 밖 오류는 던진다.
  - `updatePlace(userId, tripId, placeId, input: {label; category; memo}): Promise<boolean>` — 장소 행 갱신 후, 같은 여행에서 `place_id = placeId` 인 일정의 `place` 를 새 이름표로(두 번째 문도 접근 조건). 첫 문이 0행이면 false.
  - `deletePlace(userId, tripId, placeId): Promise<boolean>`
  - `setPlaceCoords(placeId: string, tripId: string, coords: {lat:number; lng:number} | null, fetchedAt: Date): Promise<void>` — 서버 내부(갱신)용. 호출자가 이미 `listPlaces(userId, tripId)` 로 받은 행에만 쓴다. `where id = placeId and trip_id = tripId`.
  - `listTripBases(userId, tripId): Promise<{ startDate: string; placeId: string | null }[]>`
  - `setTripBase(userId, tripId, startDate, placeId: string | null): Promise<boolean>` — 한 문: `insert into trip_bases select … where 여행 접근 가능 and (placeId is null or exists(같은 여행의 장소)) on conflict (trip_id, start_date) do update set place_id = excluded.place_id, updated_at = now()`. 넣거나 바뀐 행이 없으면 false. 날짜의 여행 기간 검사는 액션이 한다.
  - `schedule-items.ts`: `createScheduleItem`·`updateScheduleItem` 이 `input.placeId` 가 있으면 **한 문 안에서** 같은 여행·접근 가능한 장소인지 확인하고 `place` 를 그 장소의 `label` 로 저장한다(insert … select from places / update … from places). 장소가 조건에 안 맞으면 0행 → 기존처럼 `null`/`false`(액션이 `notFound()`). `placeId` 가 null 이면 지금과 같고 `place_id` 를 null 로.

- [ ] **Step 1:** `places.ts`·`trip-bases.ts` 작성, `schedule-items.ts` 수정
- [ ] **Step 2:** `npm run typecheck`, `npm run lint` PASS
- [ ] **Step 3:** 커밋 `feat(#13): 장소·기준점 쿼리, 일정에 장소 잇기`
  - 실제 DB 동작 확인(중복 → duplicate, 남의 장소 → 0행)은 마이그레이션 적용 뒤 Task 12 에서.

### Task 9: Google 서버 호출 (`google-maps-server.ts`)

**Files:** Create `src/lib/google-maps-server.ts`

**Interfaces:**
- Consumes: Task 5 `summarizeTransit`, `summarizeWalk`, `TransitSummary`, `WalkSummary`.
- Produces (`import "server-only"`; 키 없으면 `{ ok: false }` 를 바로 돌려줌; 모든 fetch 에 `AbortSignal.timeout(5000)`, `cache: "no-store"`; 실패는 `console.error("[places] …")`/`"[routes] …"` 한 줄, 키·응답 본문의 키는 찍지 않음):
  - `fetchPlaceCoords(googlePlaceId: string): Promise<{ ok: true; lat: number; lng: number } | { ok: false; notFound: boolean }>` — `GET https://places.googleapis.com/v1/places/{id}`, `X-Goog-FieldMask: location`. 404/`NOT_FOUND` 는 `notFound: true`.
  - `fetchPlaceRegion(googlePlaceId: string): Promise<{ countryCode: string | null; timeZone: string | null } | null>` — FieldMask `addressComponents,timeZone`. 나라는 `types` 에 `country` 가 있는 구성요소의 `shortText`.
  - `fetchTransit(from: LatLng, to: LatLng, at: { kind: "arrival" | "departure"; instant: Date } | null): Promise<{ ok: true; summary: TransitSummary | null } | { ok: false }>` — `POST https://routes.googleapis.com/directions/v2:computeRoutes`, `travelMode:"TRANSIT"`, `languageCode:"ko"`, `arrivalTime`/`departureTime` RFC3339, FieldMask `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name,routes.legs.steps.transitDetails.transitLine.vehicle.type`.
  - `fetchWalk(from: LatLng, to: LatLng): Promise<{ ok: true; summary: WalkSummary | null } | { ok: false }>` — `travelMode:"WALK"`, 시각 없음.
  - 좌표는 `latLng` 로 보낸다(place id 대신: 좌표가 이미 있고, 나라 다른 구간도 같은 방식).

- [ ] **Step 1:** 작성
- [ ] **Step 2:** 확인 스크립트(스크래치패드, 커밋 안 함)로 클라우드 세션에서 `fetchTransit` 서울 구간 → `summary.lineName` 있음, 도쿄 구간 → `summary: null`, `fetchPlaceRegion("ChIJOWucdKiMGGARbppa4b4CKA8")` → `{countryCode:"JP", timeZone:"Asia/Tokyo"}`. (`server-only` 때문에 스크립트는 같은 fetch 를 직접 부르거나 `node --conditions=react-server` 로 실행)
- [ ] **Step 3:** `npm run typecheck`, `npm run lint` PASS
- [ ] **Step 4:** 커밋 `feat(#13): Google Place Details·Routes 서버 호출`

### Task 10: Server Action (장소·기준점·하루 동선·일정)

**Files:** Create `src/app/trips/place-actions.ts`, `src/app/trips/route-actions.ts`; Modify `src/app/trips/schedule-actions.ts`, `src/app/trips/messages.ts`

**Interfaces:**
- Consumes: Task 2, 3, 4, 5, 8, 9.
- Produces:
  - `createPlaceAction(tripId: string, prev: PlaceFormState, formData: FormData): Promise<PlaceFormState>` — 필드 `googlePlaceId`·`label`·`category`·`memo` 를 문자열로 꺼냄 → `parsePlaceInput` → `getTrip`(없으면 `notFound()`) → `fetchPlaceCoords`(실패면 notFound 는 "장소를 찾지 못했어요…", 그 밖은 `SAVE_FAILED` 를 `formError` 로) → `createPlace`(duplicate 면 `formError: "이미 목록에 있는 장소예요."`, not_found 면 `notFound()`) → `revalidatePath`. 성공하면 빈 값과 새 `savedAt`.
  - `updatePlaceAction(tripId, placeId, prev: PlaceFormState, formData): Promise<PlaceFormState>` — `parsePlaceEdit` → `updatePlace` (false → `notFound()`).
  - `deletePlaceAction(tripId, placeId): Promise<void>` — false → `notFound()`.
  - `setTripBaseAction(tripId: string, date: string, placeId: string | null): Promise<{ ok: boolean }>` — 날짜 형식·여행 기간(getTrip 의 시작·끝) 검사, `placeId` 는 null 또는 uuid. 대상 없음과 실패를 같은 `{ok:false}` 로(#12 완료 체크와 같은 이유).
  - `loadDayRouteAction(tripId: string, date: string): Promise<{ ok: true; legs: LegView[]; notices: ("kr"|"jp"|"other")[] } | { ok: false }>` — `type LegView = { fromId: string; toId: string; result: LegResult; text: string; straightMeters: number; distanceText: string; directionsUrl: string }`. 순서: 사용자 → `getTrip` → 날짜 형식·기간 → `listPlaces`·`listTripBases`·`listScheduleItems` → 그날 stops(`placeId` 있는 일정, #12 정렬) → `buildDayRoute(…, distanceMeters)` → 구간에 나오는 장소들 `fetchPlaceRegion` 병렬(장소당 한 번) → 구간마다 `requestInstant`(시간대 없으면 `at: null`) → `fetchTransit` → 필요하면 `fetchWalk` → `decideLeg`; transit 실패(`ok:false`)면 `{kind:"failed"}`. `notices` 는 결과에 나온 종류를 중복 없이, kr→jp→other 순. 이 함수의 인자는 `tripId`·`date` 뿐(§5.7: 클라이언트가 임의 구간을 묻지 못함). 결과는 저장하지 않는다.
  - `schedule-actions.ts`: `readScheduleFields` 가 `placeId` 도 읽는다.
  - `messages.ts`: `PLACE_DUPLICATE`, `PLACE_NOT_FOUND` 상수.

- [ ] **Step 1:** 작성(파일 맨 위 주석: bind 값도 클라이언트가 바꿀 수 있음, 쿼리 조건이 막음)
- [ ] **Step 2:** `npm run typecheck`, `npm run lint` PASS
- [ ] **Step 3:** 커밋 `feat(#13): 장소·기준점·하루 동선 Server Action`

### Task 11: 화면

**Files:** Create `src/app/trips/[id]/map-section.tsx`, `trip-map-panel.tsx`, `place-add-form.tsx`, `place-row.tsx`; Modify `src/app/trips/[id]/page.tsx`, `schedule-section.tsx`, `schedule-editor.tsx`, `schedule-item-form.tsx`, `.env.example`, `package.json`(+lock)

**Interfaces:**
- Consumes: Task 1–10.
- Produces: 화면만.

- [ ] **Step 1: 의존성·키 이름** — `npm install @vis.gl/react-google-maps`(정확한 버전 고정은 lock 이 함). 설치 뒤 `node_modules/@vis.gl/react-google-maps` 의 README 에서 `APIProvider`, `Map`(`mapId`), `AdvancedMarker`, `useMap`, `useMapsLibrary` 사용법을 확인한다. `.env.example` 에 주석과 함께 세 키 이름(값 빈칸): `GOOGLE_MAPS_SERVER_KEY`(서버 전용, Routes·Places API (New) 제한), `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`(웹사이트 제한), `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
- [ ] **Step 2: `map-section.tsx`(Server)** — `MapSection({ userId, trip, today })`. `listPlaces` → `needsCoordsRefresh` 인 장소만 `fetchPlaceCoords` 병렬 → `setPlaceCoords`(실패면 `null`, `notFound` 든 아니든 좌표 비움) → 갱신된 목록. `listTripBases`, `listScheduleItems` 로 날마다 stops 와 기준점(`baseForDate`)을 미리 계산해 패널에 넘긴다(구간 정보는 넘기지 않음). 일정에 이어진 장소의 "N일차 일정" 표시용 맵(`placeId → dayNumber[]`)도 여기서. 브라우저 키가 없으면 패널에 `mapsEnabled=false`. `page.tsx` 에서 머리 아래, `ScheduleSection` 위에 둔다(같은 `<Suspense>` 안, `getTrip` 뒤).
- [ ] **Step 3: `trip-map-panel.tsx`(Client)** — §5.1 그림대로. 상태: 선택 탭(`"all"` 또는 날짜; 처음 값은 오늘이 기간 안이면 오늘, 아니면 `"all"`), 전체 보기 기준점(기본 첫날 기준점, 저장 안 함), 강조된 장소 id. 
  - N일차 탭을 열면 `loadDayRouteAction(trip.id, date)` 를 `useTransition` 으로 부르고, 기다리는 동안 서버가 넘긴 그날 동선으로 직선 거리와 점선을 그린다. 같은 탭을 다시 열면 다시 부른다(저장 안 함, §3.2).
  - 지도: `APIProvider`(브라우저 키) + `Map`(`mapId`, `gestureHandling: "greedy"` 아님 → 기본 `cooperative`, 처음엔 모든 핀이 들어오게 `fitBounds`). 핀은 `AdvancedMarker`: N일차는 번호, 기준점은 🏨, 전체는 종류별(🏨 숙소, 📍 관광, 🍜 맛집, ☕ 카페, • 기타). 선: transit/walk 는 `polyline` 을 `google.maps.geometry.encoding.decodePath`(`useMapsLibrary("geometry")`)로 풀어 실선, straight·failed·대기 중은 직선 점선. 전체 보기에서 기준점을 고르면 기준점→각 장소 옅은 직선.
  - 구간 목록: `🏨 → ① 이름표  <legText>  <거리>  [Google 지도 ↗](directionsUrl, 새 탭)`. 아래에 `notices` 문구를 한 번씩.
  - "가 볼 곳": `PlaceAddForm`, 목록(`PlaceRow`). 전체 보기에서 기준점이 있으면 `sortByDistance` 순서와 거리, 없으면 넣은 순서. 좌표 없는 장소는 "위치 정보를 다시 불러오지 못했어요" 표시.
  - 맨 아래 약관 줄(§5.11) — `mapsEnabled` 일 때만.
  - `mapsEnabled=false` 면 지도·검색 대신 "지도를 쓸 수 없어요" 한 줄, 목록은 보임.
- [ ] **Step 4: `place-add-form.tsx`(Client)** — `useMapsLibrary("places")` 로 Places (New) 자동완성(`PlaceAutocompleteElement` 또는 `AutocompleteSuggestion.fetchAutocompleteSuggestions` + 세션 토큰). 후보를 고르면 `place.fetchFields({ fields: ["displayName","primaryType","types"] })` 로 이름·유형을 받아 이름 칸·종류 칸(`guessCategory`)을 채운다(저장 전, §5.2). `useActionState(createPlaceAction.bind(null, trip.id), …)`, 숨은 필드 `googlePlaceId`. 저장되면(`savedAt` 변경) 검색칸과 양식을 비운다. 화면을 떠났다 오면 초기화(`trip-form.tsx` 의 key 재설정 방식).
- [ ] **Step 5: `place-row.tsx`(Client)** — 종류 라벨, 이름표(→ `placeUrl` 새 탭), 메모, "N일차 일정". ⋯ 메뉴: 고치기(그 자리 입력칸: 이름표·종류·메모, `updatePlaceAction`), 삭제(`window.confirm("이 장소를 삭제할까요?")` → `deletePlaceAction`). 고치기 칸은 한 번에 하나(같은 패널 안 상태).
- [ ] **Step 6: N일차 기준점 고르기** — 탭 아래 `기준점 [▾]`(숙소 종류 먼저, "없음"), 바꾸면 `setTripBaseAction(trip.id, date, placeId)` → 실패면 되돌리고 `SAVE_FAILED`. "이 날부터 바뀌어요" 작은 글씨. 바꾼 뒤 동선을 다시 부른다.
- [ ] **Step 7: 일정 양식** — `schedule-item-form.tsx` 의 장소 칸을 `select name="placeId"`(맨 위 "직접 적기", 그 아래 이 여행 장소들 이름표, 숙소 먼저) + 직접 적기일 때만 보이는 기존 `place` 글자 칸으로. 장소 목록은 `ScheduleSection` 이 `listPlaces` 결과에서 `{id,label,category}` 로 넘긴다. `schedule-editor.tsx` 의 장소 링크: `placeId` 가 있고 그 장소가 목록에 있으면 `placeUrl`, 아니면 기존 `mapsSearchUrl(place)`.
- [ ] **Step 8:** `npm run lint`, `npm run typecheck`, `node --test 'src/**/*.test.mjs'`, `npm run build`(CI 와 같은 가짜 `DATABASE_URL`·`BETTER_AUTH_SECRET`) PASS
- [ ] **Step 9:** 커밋 `feat(#13): 여행 화면에 지도·가 볼 곳·하루 동선`

### Task 12: PR·마이그레이션·브라우저 확인·배포

- [ ] **Step 1: 클라우드 환경** — `get_environment` 후, 브라우저가 지도를 받도록 `maps.googleapis.com`, `maps.gstatic.com` 허용과 환경 변수 `GOOGLE_MAPS_SERVER_KEY=injected-by-proxy` 를 `update_environment` 로 요청(사용자 승인). 새 세션이 아니면 `NEXT_PUBLIC_GOOGLE_MAPS_*` 가 없으므로 `env | grep -c NEXT_PUBLIC_GOOGLE_MAPS` 로 확인하고, 없으면 사용자에게 알린다.
- [ ] **Step 2: `/code-review`, `/security-review`**(소유권 코드), 막는 지적 처리(CLAUDE.md '리뷰 종료 기준').
- [ ] **Step 3: PR 본문 갱신**(#31, draft 유지) — 맨 위 "사람 확인 필요": 위험 경로 `src/db/schema.ts`, `drizzle/**`, `.env.example`, `package.json`, `package-lock.json` 과 이유. 마이그레이션 SQL 전문과 "비파괴" 판정. 사용자가 할 일(운영 브라우저 키 `https://trip-planner-beta-pink.vercel.app/*`, Vercel Production 환경 변수 3개). "남은 지적"(이름표 미리 채움의 약관 회색지대, 일정 글자에 이름표 복사). 자동 머지는 켜지 않는다.
- [ ] **Step 4:** 사용자가 `human-approved` 를 붙이면 `npm run db:migrate` 직전에 사용자 확인 → 적용 → `places`·`trip_bases`·`schedule_items.place_id` 존재 확인(Neon MCP `describe_table_schema`).
- [ ] **Step 5: 브라우저 확인** — `docs/status.md` '알아 둘 것'의 테스트 계정 A·B 방식(넣기·지우기 SQL 전문을 보이고 각각 확인), `npm run dev`, Playwright. 설계 §5.12 5번 목록 전부, 더해서:
  - 같은 장소를 빠르게 두 번 넣기 → 한 번만 들어가고 "이미 목록에 있는 장소예요." (Review Focus 4)
  - 일정에 이어진 장소를 지우면 일정 글자 남음, 기준점이던 장소면 앞 기준점 이어짐 (Review Focus 5)
  - 한국 장소와 일본 장소를 같은 날 이으면 직선 + 국내 안내 (Review Focus 3)
  - 390px 폭 스크린숏
  - 끝나면 테스트 행 삭제, 남은 행 0개
- [ ] **Step 6:** 리뷰 종료 기준 충족 → draft 해제 → 자동 머지(squash) 켜기 → 배포 뒤 사용자에게 프로덕션에서 운영 키로 지도·장소 검색 확인 요청.
- [ ] **Step 7:** `docs/status.md` 갱신(끝난 이슈 표, 다음 할 일, 알아 둘 것: Google 키·약관 저장 규칙·클라우드 프록시 주입), 사용자에게 새 세션 권함.
