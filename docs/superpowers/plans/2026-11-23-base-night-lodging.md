# 기준점을 그날 밤 묵는 곳으로 (#91) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** N일차 동선을 "전날 밤 숙소 → 그날 일정들 → 그날 밤 숙소"로 그려, 첫날·마지막 날·숙소 옮기는 날이 저절로 맞게 한다.

**Architecture:** 저장(`trip_bases`)은 그대로. 순수 모듈 `src/lib/day-route.ts` 가 날마다 시작점·끝점을 따로 정하고(`basesForDay`), `buildDayRoute` 가 앞에 시작점·뒤에 끝점을 붙인다. 지도 칸·일정 칸·하루 동선 Route Handler 가 같은 `routesByDate` 를 쓰므로 여행 시작일·끝일을 함께 넘긴다. 지도 N일차 탭의 고르기 칸 이름과 "아침엔 … 출발" 줄을 바꾼다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, `node --test`(`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-23-base-night-lodging-design.md`

## Global Constraints

- DB 변경 없음(`src/db/schema.ts`, `drizzle/` 손대지 않음). 위험 경로를 건드리지 않는다.
- `src/lib/day-route.ts` 는 다른 모듈을 import 하지 않는다(`node --test` 로 `.ts` 를 바로 읽음).
- 여행은 N박 N+1일: 밤은 첫날부터 마지막 날 **전날**까지. 당일치기는 밤 없음.
- 화면 문구(한국어, 그대로): 고르기 이름표 `{N}일차 밤 숙소`, 옆 `이 날부터 바뀌어요`, 아래 줄 `아침엔 {아이콘} {이름표}에서 출발`.
- 색은 디자인 토큰만(`text-sub` 등, `dark:`·`zinc-*` 금지). 커밋 전 `npm run lint`·`npm run typecheck`·`npm test` 모두 통과(종료 코드 따로 확인).

## Review Focus

1. 숙소 옮기는 날인데 일정이 하나도 없음(A → B 만): 구간 하나 A → B 가 지도 선·구간 목록에 보여야 한다("이 날 일정에 고른 장소가 없어요"만 보이면 안 됨). → Task 2 Step 3.
2. 끝 숙소가 시작 숙소와 다름: 구간 목록 마지막 줄이 "② → 🏨" 로만 나오면 어느 숙소인지 모른다 → 숙소에도 이름표. → Task 2 Step 3.
3. 하루 동선 Route Handler 는 날짜 하나만 넘긴다: 둘째 날의 시작점(전날 밤)을 지도 칸과 똑같이 계산해야 한다(서명이 달라 구간 결과가 맞지 않으면 "실패"로 보임). → Task 1 Step 1 의 `routesByDate 날짜 하나` 시험.
4. 여행 날짜를 줄여 마지막 날이 바뀜: 전에 "가운데 날"이던 날의 숙소 행이 이제 마지막 날 행이 되어 무시된다(지우지 않음). → Task 1 Step 1 `마지막 날 행은 무시`.
5. 같은 숙소가 시작점이자 끝점이고 그날 일정이 없음: 핀 하나, 구간 없음. → Task 1 Step 1 `시작점=끝점, 일정 없음`.

---

### Task 1: 동선 뼈대에 시작점·끝점 (`day-route.ts` 와 호출부)

**Files:**
- Modify: `src/lib/day-route.ts`
- Modify: `src/lib/day-route.test.mjs`
- Modify: `src/app/trips/day-route-loader.ts:158-164`
- Modify: `src/app/trips/[id]/schedule-section.tsx:98-104`
- Modify: `src/app/trips/[id]/map-section.tsx:77-130`
- Modify: `src/app/trips/[id]/map-types.ts` (`PanelDay.routeBaseId` → `routeBaseIds`)
- Modify: `src/app/trips/[id]/trip-map-panel.tsx` (`dayView` 의 기준점 핀만)

**Interfaces:**
- Produces (`src/lib/day-route.ts`):
  - `export type TripRange = { startDate: string; endDate: string };`
  - `export type DayBases = { start: string | null; end: string | null };` — 저장된 장소 id(좌표 여부와 무관).
  - `export function previousDate(date: string): string` — `"2026-12-01"` → `"2026-11-30"`(UTC 로 계산).
  - `export function basesForDay(rows: BaseRow[], date: string, trip: TripRange): DayBases` — start = `date > trip.startDate ? baseForDate(rows, previousDate(date)) : null`, end = `date < trip.endDate ? baseForDate(rows, date) : null`.
  - `buildDayRoute(stops: DayStop[], bases: DayBases, places, distance): DayRoute` (둘째 인자가 `baseId` 에서 바뀜).
  - `DayRoute = { start: RoutePlace | null; end: RoutePlace | null; stops; legs }` — `base` 를 없앤다. start·end 는 좌표가 있어 동선에 들어간 것만.
  - `routesByDate(dates, items, bases: BaseRow[], trip: TripRange, places, distance)` (넷째 인자 추가).
  - `daySignature` 앞부분 `${start?.id ?? "-"}>${end?.id ?? "-"}|`.
- Produces (`map-types.ts`): `PanelDay.routeBaseIds: string[]` — 동선에 들어간 시작·끝 숙소 id, 중복 없음, 순서 [시작, 끝].

- [ ] **Step 1: 시험 고치기·더하기 (`src/lib/day-route.test.mjs`)**

기존 `buildDayRoute(..., "A", ...)` 는 `{ start: "A", end: "A" }`, `null` 은 `{ start: null, end: null }` 로 바꾸고 `r.base` 단언은 `r.start`/`r.end` 로. `routesByDate` 기존 시험은 trip `{ startDate: "2026-12-03", endDate: "2026-12-05" }` 를 넘겨 기대값 그대로(둘 다 가운데·첫날 규칙에 맞게 고침: 12-03 은 첫날이라 `["B>A departure 09:30"]`, 12-04 는 `["A>C departure 10:00","C>A departure 10:00"]`; 12-03 의 `legs[0].toItemId === "i1"` 단언은 `legs[0].fromItemId === "i1"` 로). 새 시험:

```js
const trip3 = { startDate: "2026-12-01", endDate: "2026-12-03" };
const moved = [
  { startDate: "2026-12-01", placeId: "A" },
  { startDate: "2026-12-02", placeId: "B" },
  { startDate: "2026-12-03", placeId: null },
];

test("previousDate", () => {
  assert.equal(previousDate("2026-12-01"), "2026-11-30");
  assert.equal(previousDate("2027-01-01"), "2026-12-31");
  assert.equal(previousDate("2028-03-01"), "2028-02-29");
});

test("basesForDay: 첫날·옮기는 날·마지막 날", () => {
  assert.deepEqual(basesForDay(moved, "2026-12-01", trip3), { start: null, end: "A" });
  assert.deepEqual(basesForDay(moved, "2026-12-02", trip3), { start: "A", end: "B" });
  assert.deepEqual(basesForDay(moved, "2026-12-03", trip3), { start: "B", end: null });
});

test("basesForDay: 마지막 날 행은 무시, 당일치기는 없음", () => {
  const rows = [{ startDate: "2026-12-01", placeId: "A" }, { startDate: "2026-12-03", placeId: "C" }];
  assert.deepEqual(basesForDay(rows, "2026-12-03", trip3), { start: "A", end: null });
  const day = { startDate: "2026-12-01", endDate: "2026-12-01" };
  assert.deepEqual(basesForDay(rows, "2026-12-01", day), { start: null, end: null });
});

test("basesForDay: 없음 행 = 그날 밤 숙소 없음", () => {
  const rows = [{ startDate: "2026-12-01", placeId: "A" }, { startDate: "2026-12-02", placeId: null }];
  const trip4 = { startDate: "2026-12-01", endDate: "2026-12-04" };
  assert.deepEqual(basesForDay(rows, "2026-12-02", trip4), { start: "A", end: null });
  assert.deepEqual(basesForDay(rows, "2026-12-03", trip4), { start: null, end: null });
});

test("buildDayRoute: 시작점과 끝점이 다르다", () => {
  const r = buildDayRoute([{ itemId: "i1", placeId: "C", time: "13:00" }], { start: "A", end: "B" }, places, dist);
  assert.deepEqual(summary(r), ["A>C arrival 13:00", "C>B departure 13:00"]);
  assert.equal(r.start.id, "A");
  assert.equal(r.end.id, "B");
  assert.deepEqual([r.legs[0].fromIsBase, r.legs[1].toIsBase], [true, true]);
});

test("buildDayRoute: 일정 없이 A → B", () => {
  const r = buildDayRoute([], { start: "A", end: "B" }, places, dist);
  assert.deepEqual(summary(r), ["A>B departure 10:00"]);
  assert.deepEqual(r.stops, []);
});

test("buildDayRoute: 시작점=끝점, 일정 없음", () => {
  const r = buildDayRoute([], { start: "A", end: "A" }, places, dist);
  assert.deepEqual(r.legs, []);
  assert.equal(r.start.id, "A");
});

test("buildDayRoute: 좌표 없는 끝점은 빠진다", () => {
  const r = buildDayRoute([{ itemId: "i1", placeId: "B", time: null }], { start: "A", end: "D" }, places, dist);
  assert.deepEqual(summary(r), ["A>B departure 10:00"]);
  assert.equal(r.end, null);
});

test("routesByDate: 날짜 하나만 넘겨도 전날 밤 숙소에서 시작", () => {
  const items = [{ id: "i1", date: "2026-12-02", placeId: "C", time: null }];
  const one = routesByDate(["2026-12-02"], items, moved, trip3, places, dist).get("2026-12-02");
  const all = routesByDate(["2026-12-01", "2026-12-02", "2026-12-03"], items, moved, trip3, places, dist).get("2026-12-02");
  assert.deepEqual(summary(one), ["A>C departure 10:00", "C>B departure 10:00"]);
  assert.equal(daySignature(one), daySignature(all));
});

test("daySignature 는 시작점·끝점을 담는다", () => {
  const s = (bases) => daySignature(buildDayRoute([{ itemId: "i1", placeId: "C", time: null }], bases, places, dist));
  assert.notEqual(s({ start: "A", end: "B" }), s({ start: "B", end: "A" }));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | tail -30`
Expected: FAIL — `previousDate`/`basesForDay` 가 export 되지 않음, `buildDayRoute` 기대값 불일치.

- [ ] **Step 3: `src/lib/day-route.ts` 구현**

Interfaces 대로. `buildDayRoute` 는 `sequence` 앞에 `locate(bases.start)`, 뒤에 `locate(bases.end)`(각각 `isBase: true`), 나머지(같은 장소 합치기·번호·구간 시각)는 그대로. `routesByDate` 는 `basesForDay(bases, date, trip)`. 파일 맨 위 설명 주석의 "날의 기준점(숙소)"을 "그날 밤 숙소(기준점, #91): 시작점은 전날 밤, 끝점은 그날 밤"으로.

- [ ] **Step 4: 시험 통과 확인**

Run: `npm test 2>&1 | tail -30`
Expected: PASS (모든 시험).

- [ ] **Step 5: 호출부 맞추기**

- `day-route-loader.ts`: `routesByDate([date], itemRows, baseRows, { startDate: trip.startDate, endDate: trip.endDate }, placesById, distanceMeters)` — `trip` 은 `try` 안에서 읽으므로 범위를 밖으로 꺼낸다.
- `schedule-section.tsx`: `trip` 을 넷째 인자로(`{ startDate: trip.startDate, endDate: trip.endDate }`).
- `map-section.tsx`: 같은 방식으로 trip 을 넘기고, `routeBaseId` 대신 `routeBaseIds: [...new Set([route.start?.id, route.end?.id].filter((id): id is string => !!id))]`, 빈 동선 기본값을 `{ start: null, end: null, stops: [], legs: [] }` 로. (`baseId` 는 Task 2 에서 바꾼다.)
- `map-types.ts`: `routeBaseId: string | null` → `routeBaseIds: string[]`(주석 "동선에 들어간 시작·끝 숙소(좌표가 있을 때만)").
- `trip-map-panel.tsx` `dayView`: `routeBaseIds` 마다 기준점 핀 하나(키 `base:${id}`, 제목 `숙소: ${label}`).

- [ ] **Step 6: 검사**

Run: `npm run typecheck > /tmp/tc.log 2>&1; echo $?` 와 `npm run lint > /tmp/lint.log 2>&1; echo $?`
Expected: 둘 다 `0`.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/day-route.ts src/lib/day-route.test.mjs src/app/trips/day-route-loader.ts "src/app/trips/[id]/schedule-section.tsx" "src/app/trips/[id]/map-section.tsx" "src/app/trips/[id]/map-types.ts" "src/app/trips/[id]/trip-map-panel.tsx"
git commit -m "feat: 동선 시작점은 전날 밤 숙소, 끝점은 그날 밤 숙소 (#91)"
```

---

### Task 2: 지도 N일차 탭 — "N일차 밤 숙소" 고르기와 아침 출발 줄

**Files:**
- Modify: `src/app/trips/[id]/map-types.ts` (`PanelDay`)
- Modify: `src/app/trips/[id]/map-section.tsx` (`panelDays`)
- Modify: `src/app/trips/[id]/trip-map-panel.tsx` (`DayBasePicker`, 고르기 자리, `legRows`, 구간 목록 조건)
- Modify: `src/app/trips/[id]/day-legs.tsx` (`LegRow.toLabel` 주석)

**Interfaces:**
- Consumes: `basesForDay`, `TripRange` (Task 1).
- Produces (`PanelDay`): `baseId` 를 없애고
  - `hasNight: boolean` — 마지막 날·당일치기는 false(고르기 칸 없음).
  - `nightBaseId: string | null` — 저장된 그날 밤 숙소(고르기 현재 값). `hasNight` 가 false 면 null. 장소 목록에 없는 id 는 null(지금 `baseId` 처리와 같음).
  - `morningBaseId: string | null` — `basesForDay(...).start`, 장소 목록에 없으면 null.

- [ ] **Step 1: `map-section.tsx` 에서 세 값 채우기**

`const bases = basesForDay(baseRows, day.date, tripRange)`; `hasNight = day.date < trip.endDate`; `nightBaseId = hasNight ? (bases.end && routePlaces.has(bases.end) ? bases.end : null) : null`; `morningBaseId` 같은 방식. `baseForDate` import 는 `firstDayBase`([전체] 기본값)에서 계속 쓴다.

- [ ] **Step 2: 고르기 칸 바꾸기 (`trip-map-panel.tsx`)**

- `DayBasePicker` 이름표 `{day.dayNumber}일차 밤 숙소`, 값은 `baseChoices[date]?.value ?? day.nightBaseId`(지금 `day.baseId` 자리).
- 새 `MorningLine({ place }: { place: PanelPlace | undefined })`: place 가 있으면 `<p className="text-xs text-sub">아침엔 {CATEGORY_ICONS[place.category]} {place.label}에서 출발</p>`, 없으면 아무것도 없음.
- N일차 자리: `day.hasNight && places.length > 0` 일 때 `DayBasePicker`, 그 아래(마지막 날은 단독으로) `MorningLine place={placesById.get(day.morningBaseId)}`.
- 저장 뒤 서버 값 비교(`useEffect` 의 `serverBase`)는 `nightBaseId` 를 본다.

- [ ] **Step 3: 구간 목록 (Review Focus 1·2)**

- 구간 목록 조건: `day.legs.length === 0` 일 때만 "위치 정보 없음 / 고른 장소가 없어요" 문구, 아니면 `DayLegs`(일정 없이 A → B 만 있는 날도 목록이 보임). 문구 고르기는 지금처럼 `stops.length === 0 && unlocatedCount > 0`.
- `legRows` 의 `toLabel`: 숙소에도 이름표(`to.label`). `day-legs.tsx` 의 `toLabel` 주석을 "도착 장소 이름표"로.
- `legRows` 위 주석의 "기준점은 🏨" 를 "숙소(시작·끝)는 🏨" 로.

- [ ] **Step 4: 검사**

Run: `npm run typecheck > /tmp/tc.log 2>&1; echo $?`, `npm run lint > /tmp/lint.log 2>&1; echo $?`, `npm test > /tmp/test.log 2>&1; echo $?`
Expected: 셋 다 `0`.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/trips/[id]/map-types.ts" "src/app/trips/[id]/map-section.tsx" "src/app/trips/[id]/trip-map-panel.tsx" "src/app/trips/[id]/day-legs.tsx"
git commit -m "feat: 지도 N일차 탭에 밤 숙소 고르기와 아침 출발 줄 (#91)"
```

---

### Task 3: 브라우저 확인과 빌드

**Files:** 없음(확인만). 고칠 것이 나오면 해당 Task 파일에서 고치고 커밋.

- [ ] **Step 1: 빌드**

Run: `npm run build > /tmp/build.log 2>&1; echo $?` (CI 와 같이 가짜 환경 변수가 필요하면 `.github/workflows` 의 `check` 를 따름)
Expected: `0`.

- [ ] **Step 2: 테스트 계정·데이터 (사용자 승인 뒤)**

`docs/status.md` '로그인한 화면의 브라우저 확인' 방법. 넣기 전 SQL 전문을 보이고 확인받는다. 데이터: 3일 여행(2박 3일), 장소 A·B(숙소, 좌표는 Places Text Search), 관광지 C·D, 기준점 행 1일차 A·2일차 B, 일정 1일차 C, 2일차 D, 3일차 C. 당일치기 여행 하나(장소 하나, 일정 하나).

- [ ] **Step 3: Playwright 로 확인 (`NODE_USE_ENV_PROXY=1 npm run dev`)**

- 1일차: 구간 `① → 🏨 A`, 고르기 "1일차 밤 숙소 = A", 아침 줄 없음, 지도 숙소 핀 1개.
- 2일차: `🏨 → ① D → 🏨 B`, "아침엔 🏨 A에서 출발", 핀 A·B 둘.
- 3일차: 고르기 칸 없음, "아침엔 🏨 B에서 출발", 마지막 구간이 C 에서 끝남.
- 일정표의 2일차 이동 줄이 A 에서 오고 B 로 가는 줄이 마지막에 보임.
- 2일차 일정을 지운 상태에서 구간 `🏨 → 🏨 B` 하나가 목록에 보임.
- 1일차 고르기를 B 로 바꾸면 2일차 아침 줄이 B 로 바뀜(저장 → 서버 새로 그리기).
- 당일치기: 고르기 칸·아침 줄 없음.
- 휴대폰 너비(390px) 한 장.

- [ ] **Step 4: 테스트 데이터 지우기 (SQL 전문 보이고 확인 뒤)**
