# 일정 사이 예상 이동 시간 (#37) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정표의 날마다, 장소가 이어진 일정 사이에 예상 이동 시간 한 줄을 보이고, 화면에 들어온 날만 묻고, 지도 N일차 탭과 결과를 함께 쓴다.

**Architecture:** 날짜별 동선 뼈대를 만드는 순수 함수(`routesByDate`)와 서명(`daySignature`)을 `src/lib/day-route.ts` 에 두고 지도 칸·일정 칸·`loadDayRoute` 가 같이 쓴다. 구간 결과는 페이지 단위 클라이언트 저장소(`DayRouteProvider`, 키 `날짜|서명`)에 두고 지도 패널과 일정표가 같은 훅으로 읽는다. 일정표는 응답 구간의 `fromItemId`·`toItemId` 로 이동 줄 자리를 정한다(순수 함수 `placeTravelLines`).

**Tech Stack:** Next.js 16 App Router, React 19 (`useSyncExternalStore`), TypeScript, Tailwind 4, `node --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-schedule-travel-time-design.md`

## Global Constraints

- 경로 정보는 DB·요청을 넘어서는 서버 메모리에 저장하지 않는다. 브라우저 화면 상태로만.
- 이동 정보는 `GET /trips/[id]/day-route?date=` 로만 묻는다. Route Handler 의 인자·상태 코드·소유권 검사는 바꾸지 않는다. 새 Server Action 없음.
- DB 스키마·마이그레이션 변경 없음. 위험 경로(`CLAUDE.md` '위험 경로')를 건드리지 않는다.
- `src/lib/day-route.ts`, `src/lib/travel-lines.ts` 는 다른 모듈을 import 하지 않는다(`node --test` 로 직접 시험).
- 사용자에게 보이는 문구(한국어, 그대로): `이동 시간 불러오는 중…`, `이동 정보를 불러오지 못했어요.`(기존 `legText({kind:"failed"})`), `다시`, `직선 <거리>`, `<이름표>에서`, `<이름표>까지`, `길찾기 ↗`.
- 머무는 시간 500ms 뒤에 묻는다. 빠르게 지나간 날은 묻지 않는다.
- 커밋 전 `npm run lint`, `npm run typecheck`, `node --test 'src/**/*.test.mjs'` 통과.

## Review Focus

1. 일정을 지우고 같은 장소·시각으로 새로 넣음(장소 쌍·시각은 같고 일정 id 만 다름) → 서명이 달라져 다시 묻고, 이동 줄이 새 일정 위에 붙는다. (Task 1 시험 `daySignature 은 일정 id 를 담는다`)
2. 저장소에 남은 이전 서명 결과가 늦게 와도 새 서명의 화면을 덮지 않는다(키가 달라 섞이지 않음). (Task 3 브라우저 확인)
3. 응답의 일정 id 가 지금 줄 목록에 없음(사이에 일정을 지움) → 그 구간은 그리지 않고 오류도 내지 않는다. (Task 2 시험 `없는 일정 id 의 구간은 버린다`)
4. Activity 로 화면을 떠났다 돌아옴 → 받은 날은 다시 묻지 않고, 기다리던 요청은 다시 묻는다. (Task 3 브라우저 확인)
5. 일정 순서 첫 일정이나 마지막 일정이 기준점과 같은 장소 → 기준점 구간이 그 일정 줄에 붙고 줄이 겹치지 않는다. (Task 1 시험 `기준점과 같은 장소의 첫·끝 일정`, Task 2 시험 `도착이 일정이면 그 줄 위`)

---

### Task 1: 동선 뼈대에 일정 id, 날짜별 뼈대·서명, 응답에 일정 id

**Files:**
- Modify: `src/lib/day-route.ts`
- Modify: `src/lib/day-route.test.mjs`
- Modify: `src/app/trips/day-route-loader.ts`
- Modify: `src/app/trips/[id]/map-section.tsx`, `src/app/trips/[id]/map-types.ts`

**Interfaces:**
- Produces:
  - `DayStop = { itemId: string; placeId: string; time: string | null }`
  - `DayLeg` 에 `fromItemId: string | null; toItemId: string | null` 추가
  - `type ScheduleRow = { id: string; date: string; placeId: string | null; time: string | null }` (time 은 DB 값 `"09:30:00"` 또는 `"09:30"`, 함수가 앞 5자를 쓴다)
  - `routesByDate(dates: string[], items: ScheduleRow[], bases: BaseRow[], places: Map<string, RoutePlace>, distance: (a: LatLng, b: LatLng) => number): Map<string, DayRoute>` — items 는 `listScheduleItems` 순서 그대로 받는다.
  - `daySignature(route: DayRoute): string` — `${base id ?? "-"}|` + 구간마다 `${fromId}>${toId}@${kind} ${time}#${fromItemId ?? "-"}>${toItemId ?? "-"}` 를 `,` 로.
  - `LegView`(`day-route-loader.ts`)에 `fromItemId: string | null; toItemId: string | null` 추가.
  - `PanelDay` 에 `signature: string` 추가.

- [ ] **Step 1: 실패하는 시험 쓰기** (`src/lib/day-route.test.mjs`, 기존 시험의 stop 에 `itemId` 를 넣고 아래 추가)

```js
test("구간의 일정 id: 기준점은 null, 합친 점은 도착=처음·출발=마지막", () => {
  const r = buildDayRoute(
    [
      { itemId: "i1", placeId: "B", time: "09:30" },
      { itemId: "i2", placeId: "B", time: "11:00" },
      { itemId: "i3", placeId: "C", time: null },
    ],
    "A", places, dist,
  );
  assert.deepEqual(r.legs.map((l) => [l.fromItemId, l.toItemId]), [
    [null, "i1"], ["i2", "i3"], ["i3", null],
  ]);
});

test("기준점과 같은 장소의 첫·끝 일정은 일정 id 가 이긴다", () => {
  const r = buildDayRoute(
    [
      { itemId: "out", placeId: "A", time: "09:00" },
      { itemId: "i1", placeId: "B", time: null },
      { itemId: "in", placeId: "A", time: "18:00" },
    ],
    "A", places, dist,
  );
  assert.deepEqual(r.legs.map((l) => [l.fromItemId, l.toItemId, l.fromIsBase, l.toIsBase]), [
    ["out", "i1", true, false], ["i1", "in", false, true],
  ]);
});

test("좌표 없는 장소의 일정은 건너뛴다", () => {
  const r = buildDayRoute(
    [
      { itemId: "i1", placeId: "B", time: null },
      { itemId: "i2", placeId: "D", time: null },
      { itemId: "i3", placeId: "C", time: null },
    ],
    null, places, dist,
  );
  assert.deepEqual(r.legs.map((l) => [l.fromItemId, l.toItemId]), [["i1", "i3"]]);
});

test("routesByDate: 날짜별로 그날 장소 일정만, 시각은 앞 5자", () => {
  const items = [
    { id: "i1", date: "2026-12-03", placeId: "B", time: "09:30:00" },
    { id: "x", date: "2026-12-03", placeId: null, time: null },
    { id: "i2", date: "2026-12-04", placeId: "C", time: null },
  ];
  const m = routesByDate(["2026-12-03", "2026-12-04"],
    items, [{ startDate: "2026-12-03", placeId: "A" }], places, dist);
  assert.deepEqual(summary(m.get("2026-12-03")), ["A>B arrival 09:30", "B>A departure 09:30"]);
  assert.deepEqual(summary(m.get("2026-12-04")), ["A>C departure 10:00", "C>A departure 10:00"]);
});

test("daySignature 은 일정 id 를 담는다", () => {
  const two = (second) =>
    buildDayRoute(
      [{ itemId: "i1", placeId: "B", time: null }, { itemId: second, placeId: "C", time: null }],
      null, places, dist,
    );
  assert.equal(daySignature(two("i2")), daySignature(two("i2")));
  assert.notEqual(daySignature(two("i2")), daySignature(two("i3")));
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test src/lib/day-route.test.mjs` / Expected: FAIL (`routesByDate`·`daySignature` 없음, `fromItemId` undefined)

- [ ] **Step 3: 구현** (`src/lib/day-route.ts`)
  - `Point` 에 `arriveItemId`·`departItemId`(기준점 null). 합칠 때 시각과 같은 규칙: `arriveItemId = last.arriveItemId ?? point.arriveItemId`, `departItemId = point.departItemId ?? last.departItemId`.
  - 구간: `fromItemId = from.departItemId`, `toItemId = to.arriveItemId`.
  - `routesByDate` 는 날짜마다 `baseForDate` + `buildDayRoute`. 장소 없는 일정은 빼고, time 은 `slice(0, 5)`.
  - 파일 머리 주석에 새 두 함수 한 줄씩.

- [ ] **Step 4: 통과 확인** — Run: `node --test src/lib/day-route.test.mjs` / Expected: PASS

- [ ] **Step 5: 부르는 쪽 바꾸기**
  - `day-route-loader.ts`: 손으로 stops 만들던 부분을 `routesByDate([date], itemRows, baseRows, placesById, distanceMeters).get(date)` 로. `LegView` 에 `fromItemId`·`toItemId` 를 채운다. 그 밖(구간 상한, 나라·시간대, 요청 안 중복 묻기)은 그대로.
  - `map-section.tsx`: `panelDays` 를 `routesByDate(days.map(d=>d.date), itemRows, baseRows, routePlaces, distanceMeters)` 로 만들고 `signature: daySignature(route)` 를 넣는다. `unlocatedCount` 계산은 그대로.
  - `map-types.ts`: `PanelDay.signature` 추가(주석: "구간 결과 저장소 키. 바뀌면 다시 묻는다").

- [ ] **Step 6: 확인** — Run: `npm run lint && npm run typecheck && node --test 'src/**/*.test.mjs'` / Expected: 모두 통과

- [ ] **Step 7: 커밋** — `git commit -m "동선 뼈대에 일정 id, 날짜별 뼈대·서명 (#37)"`

---

### Task 2: 이동 줄 자리 정하기 (순수 함수)

**Files:**
- Create: `src/lib/travel-lines.ts`
- Create: `src/lib/travel-lines.test.mjs`

**Interfaces:**
- Consumes: 없음(모양만 맞춘다. `LegView`·스켈레톤 어느 쪽에서도 만들 수 있게).
- Produces:

```ts
export type LineLeg = {
  key: string;
  fromItemId: string | null;
  toItemId: string | null;
  fromLabel: string | null; // 출발 장소 이름표(모르면 null)
  toLabel: string | null;   // 도착 장소 이름표(모르면 null)
};
export type PlacedLine<L extends LineLeg> = { leg: L; caption: string | null };
export type PlacedLines<L extends LineLeg> = {
  before: Map<string, PlacedLine<L>>; // 일정 id → 그 줄 바로 위 이동 줄
  after: PlacedLine<L> | null;        // 마지막 줄 아래(도착이 일정이 아닌 구간)
};
export function placeTravelLines<L extends LineLeg>(itemIds: string[], legs: L[]): PlacedLines<L>;
```

규칙(설계 §4.2):
- `toItemId` 가 있으면 그 일정 줄 위. `itemIds` 에 없으면 버린다. 같은 줄에 둘째 구간이 오면 버린다(첫 구간만).
- `toItemId` 가 null 이면 `after`. 둘째는 버린다.
- caption: 출발이 일정 아님(`fromItemId === null`) → `fromLabel ? `${fromLabel}에서` : null`. 출발 일정이 도착 줄의 바로 앞 줄이면 null, 아니면 `fromLabel ? `${fromLabel}에서` : null`. `after` 는 출발 일정이 `itemIds` 마지막이 아니면 `"<fromLabel>에서 "` 를 앞에 붙이고 `toLabel ? `${toLabel}까지` : null`.

- [ ] **Step 1: 실패하는 시험 쓰기** (`src/lib/travel-lines.test.mjs`)

```js
const leg = (fromItemId, toItemId, fromLabel = "F", toLabel = "T") =>
  ({ key: `${fromItemId}>${toItemId}`, fromItemId, toItemId, fromLabel, toLabel });

test("바로 앞 줄에서 오면 출발지를 적지 않는다", () => {
  const r = placeTravelLines(["a", "b"], [leg("a", "b")]);
  assert.equal(r.before.get("b").caption, null);
  assert.equal(r.after, null);
});
test("사이에 다른 줄이 끼면 '<출발>에서'", () => {
  const r = placeTravelLines(["a", "x", "b"], [leg("a", "b", "경복궁")]);
  assert.equal(r.before.get("b").caption, "경복궁에서");
});
test("기준점에서 출발·기준점까지", () => {
  const r = placeTravelLines(["a"], [leg(null, "a", "호텔"), leg("a", null, "A", "호텔")]);
  assert.equal(r.before.get("a").caption, "호텔에서");
  assert.equal(r.after.caption, "호텔까지");
});
test("기준점까지 구간의 출발이 마지막 줄이 아니면 출발지도", () => {
  const r = placeTravelLines(["a", "x"], [leg("a", null, "A", "호텔")]);
  assert.equal(r.after.caption, "A에서 호텔까지");
});
test("도착이 일정이면 그 줄 위 (기준점과 합친 끝 일정)", () => {
  const r = placeTravelLines(["a", "in"], [leg("a", "in")]);
  assert.ok(r.before.has("in"));
  assert.equal(r.after, null);
});
test("없는 일정 id 의 구간은 버린다", () => {
  const r = placeTravelLines(["a"], [leg("a", "gone"), leg("gone", null)]);
  assert.equal(r.before.size, 0);
  assert.equal(r.after.caption, "F에서 T까지");
});
test("이름표를 모르면 출발지 없이", () => {
  const r = placeTravelLines(["a", "x", "b"], [leg("a", "b", null)]);
  assert.equal(r.before.get("b").caption, null);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test src/lib/travel-lines.test.mjs` / Expected: FAIL (모듈 없음)
- [ ] **Step 3: `placeTravelLines` 구현** (머리 주석: 순수 모듈, 다른 모듈 import 없음)
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: 커밋** — `git commit -m "이동 줄 자리 정하기 (#37)"`

---

### Task 3: 페이지 단위 구간 결과 저장소, 지도 패널 옮기기

**Files:**
- Create: `src/app/trips/[id]/day-route-store.tsx` (`"use client"`)
- Modify: `src/app/trips/[id]/trip-map-panel.tsx` (지금 `useDayRoute`·`fetchDayRoute`·`routeSignature`·`RouteState` 제거)
- Modify: `src/app/trips/[id]/page.tsx`

**Interfaces:**
- Consumes: `DayRouteResult`(`../day-route-loader`, type import), `PanelDay.signature`(Task 1).
- Produces:
  - `DayRouteProvider({ tripId, children }: { tripId: string; children: React.ReactNode })`
  - `useDayRoute(date: string | null, signature: string, hasLegs: boolean, wanted: boolean): { result: DayRouteResult | null; reload: () => void }` — `hasLegs` 가 false 면 묻지 않고 `{ ok: true, legs: [], notices: [] }`. `wanted` 가 true 이고 `날짜|서명` 키에 항목이 없으면 묻는다. 결과는 `wanted` 와 상관없이 있으면 돌려준다. `null` 은 기다리는 중(또는 아직 묻지 않음).

동작(설계 §4.3·§4.4):
- 저장소는 Provider 안의 `useRef` 객체(키 → `{ result: DayRouteResult | null; controller: AbortController | null }`) + 구독자 집합, 훅은 `useSyncExternalStore` 로 자기 키만 읽는다.
- 묻기: 지금 패널의 `fetchDayRoute` 를 그대로 옮긴다(`cache: "no-store"`, 실패·모양 틀림은 `{ ok: false }`).
- `reload()`: 그 키의 진행 중 요청을 끊고 새로 묻는다.
- 구독을 끊어도(탭을 바꾸거나 날이 화면을 벗어남) 진행 중 요청은 끊지 않는다. 끊어도 서버의 Google 호출은 멈추지 않으므로(#13 남은 지적) 받아 두는 편이 낫다. 설계 §4.4 의 "다른 쪽이 기다리지 않으면 끊는다"를 이 규칙으로 고치고 설계 문서에도 반영한다.
- Provider 의 effect 정리(페이지를 떠남·Activity 로 숨음)에서 진행 중 요청을 모두 끊고 그 항목을 지운다(돌아오면 다시 묻는다). 받은 결과는 남긴다.
- 지도 패널: `useDayRoute(day?.date ?? null, day?.signature ?? "", (day?.legs.length ?? 0) > 0, day !== null)`. 같은 탭 다시 누르면 `reload()`(지금 동작 유지). `matchedLeg`·`legRows`·`dayView` 는 그대로.
- `page.tsx`: `<DayRouteProvider tripId={trip.id}>` 로 지도 `<Suspense>` 와 `ScheduleSection` 을 함께 감싼다.

- [ ] **Step 1: `day-route-store.tsx` 작성** — 위 인터페이스·동작대로. 파일 머리에 왜 있는지 한 줄(지도 탭과 일정표가 같은 날을 두 번 묻지 않게, 결과는 저장하지 않음).
- [ ] **Step 2: `trip-map-panel.tsx` 를 저장소 훅으로 바꾸고 옛 훅 제거, `page.tsx` 감싸기**
- [ ] **Step 3: 확인** — Run: `npm run lint && npm run typecheck` / Expected: 통과
- [ ] **Step 4: 브라우저 확인(지도 탭만, 동작이 그대로인지; 테스트 계정을 두 번 만들지 않도록 Task 4 Step 5 와 한 번에 해도 된다)** — `docs/status.md` '로그인한 화면의 브라우저 확인' 절차(테스트 계정 SQL 은 사용자 확인 뒤), `NODE_USE_ENV_PROXY=1 npm run dev`. N일차 탭을 열면 `day-route` 요청 1번, 다른 탭 갔다 돌아오면 다시 묻지 않음, 같은 탭 다시 누르면 다시 묻기, 일정 장소를 바꾸면 그날 다시 묻기(Review Focus 2). 다른 화면(`/trips`)에 갔다 돌아오기(Review Focus 4).
- [ ] **Step 5: 커밋** — `git commit -m "구간 결과를 페이지 단위 저장소로, 지도 탭이 씀 (#37)"`

---

### Task 4: 일정표에 이동 줄

**Files:**
- Create: `src/app/trips/[id]/schedule-day-items.tsx` (`"use client"`)
- Create: `src/app/trips/[id]/use-dwell-visible.ts` (`"use client"` 훅)
- Modify: `src/app/trips/[id]/schedule-section.tsx`
- Modify: `src/app/trips/[id]/schedule-editor.tsx` (필요하면 `RowItem` export 만)

**Interfaces:**
- Consumes: `routesByDate`·`daySignature`·`DayRoute`(Task 1), `placeTravelLines`·`LineLeg`(Task 2), `useDayRoute`(Task 3), `legText`·`directionsUrl`·`NOTICES`(`@/lib/leg-display`), `formatDistance`(`@/lib/geo`).
- Produces:
  - `useDwellVisible(ref: React.RefObject<Element | null>, dwellMs = 500): boolean` — IntersectionObserver(`rootMargin: "200px 0px"`). 들어와 `dwellMs` 동안 머물면 true, 나가면 바로 false.
  - `type DayTravel = { date: string; signature: string; legs: TravelSkeletonLeg[] }`
  - `type TravelSkeletonLeg = LineLeg & { distanceText: string; directionsUrl: string }`
  - `ScheduleDayItems({ tripId, items, dateOptions, travel }: { tripId: string; items: RowItem[]; dateOptions: DateOption[]; travel: DayTravel | null })`

서버(`schedule-section.tsx`):
- `listTripBases(userId, trip.id)` 를 `Promise.all` 에 더한다. `RoutePlace` 맵을 `placeRows` 로 만들고 `routesByDate` 로 날마다 뼈대.
- 날마다 `DayTravel`: 구간마다 `key: \`${i}:${fromItemId}>${toItemId}\``, `fromLabel`/`toLabel`(장소 이름표), `distanceText: formatDistance(straightMeters)`, `directionsUrl(from, to)`. 구간이 없으면 `travel: null`.
- 날 칸의 `<ul>`·"아직 일정이 없어요" 자리를 `<ScheduleDayItems … />` 로 바꾼다. 여행 기간 밖 모음은 그대로(`travel` 없음, 기존 `row()`).

클라이언트(`schedule-day-items.tsx`):
- `ref` 를 `<ul>` 에 걸고 `wanted = useDwellVisible(ref)`. `useDayRoute(travel?.date ?? null, travel?.signature ?? "", travel !== null, wanted)`.
- 그릴 구간:
  - `result?.ok` → 응답 `legs` 를 `LineLeg` 로(`fromLabel`/`toLabel` 은 이 화면이 아는 장소 이름표: 뼈대 구간의 같은 장소 id 에서, 없으면 null). 줄 글자: `text !== "" ? text : \`직선 ${distanceText}\``. 길찾기는 응답의 `directionsUrl`.
  - 아니면 뼈대 `legs` 로, 글자는 `result === null` → `이동 시간 불러오는 중…`, `!result.ok` → `legText({ kind: "failed" })` + `다시` 버튼(`reload`).
  - `placeTravelLines(items.map(i => i.id), legs)` 로 자리를 정해 `<li>` 사이에 이동 줄 `<li>` 를 끼운다(`aria-hidden` 쓰지 않음, 읽을 수 있는 글자). 모양: 시각 칸 너비(`w-12`)만큼 들여 `↓ <caption> · <글자>` + 오른쪽 `길찾기 ↗`(새 탭, `rel="noopener noreferrer"`), 작은 회색 글씨(`text-sm text-zinc-500`).
  - `result?.ok` 이고 `notices` 가 있으면 `<ul>` 아래에 `ⓘ {NOTICES[n]}`(설계는 "그날 칸 맨 아래"; "+ 일정 추가" 바로 위에 둔다).
- 일정이 없으면 지금처럼 `아직 일정이 없어요`.

- [ ] **Step 1: `use-dwell-visible.ts` 작성**
- [ ] **Step 2: `schedule-day-items.tsx` 작성**
- [ ] **Step 3: `schedule-section.tsx` 바꾸기**
- [ ] **Step 4: 확인** — Run: `npm run lint && npm run typecheck && node --test 'src/**/*.test.mjs'` / Expected: 통과
- [ ] **Step 5: 브라우저 확인** (Playwright, 로컬 dev + 테스트 계정, 3일 이상 여행에 날마다 장소 일정 2개 이상 + 기준점, 휴대폰·데스크톱 너비 스크린샷)
  - 처음 열면 화면에 보이는 날만 `day-route` 요청. 아래로 빠르게 지나간 날은 요청 없음, 멈춘 날은 요청.
  - 지도 N일차 탭으로 연 날을 일정표에서 보면 요청 없음, 반대도.
  - 장소 없는 일정이 끼었을 때 `경복궁에서` 류, 기준점 구간 `<이름표>에서`·`<이름표>까지`, 마지막 일정이 기준점 장소면 줄이 하나(Review Focus 5).
  - 일정을 지우고 같은 장소·시각으로 새로 넣으면 그날만 다시 묻고 새 일정 위에 붙음(Review Focus 1).
  - 고치기 입력칸을 열어도 이동 줄 그대로, 완료 체크·저장이 이동 시간을 기다리지 않음.
  - `page.route` 로 `day-route` 를 500 으로 → `이동 정보를 불러오지 못했어요.` + `다시` 눌러 다시 묻기.
- [ ] **Step 6: 커밋** — `git commit -m "일정표에 일정 사이 이동 시간 (#37)"`

---

### Task 5: 마무리

**Files:**
- Modify: `docs/superpowers/specs/2026-11-19-schedule-travel-time-design.md` (§4.4 끊기 규칙, 안내 문구 자리)
- Modify: `docs/status.md` (끝난 뒤, 머지·배포 확인 후 — '작업 흐름')

- [ ] **Step 1: 설계 문서를 Task 3·4 의 결정대로 고친다**
- [ ] **Step 2: `/code-review`**, 막는 지적 처리
- [ ] **Step 3: push, PR #42 본문 갱신(구현 요약, 브라우저 확인 결과, 남은 지적), draft 해제 → Codex 리뷰 → 리뷰 종료 기준 → 자동 머지(squash)**
- [ ] **Step 4: 배포 확인 뒤 `docs/status.md` 갱신 PR**
