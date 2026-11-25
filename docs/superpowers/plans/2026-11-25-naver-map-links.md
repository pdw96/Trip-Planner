# 국내 여행 네이버 지도 링크 (#36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행 나라 코드가 `KR` 인 여행에서 장소 링크는 네이버 지도 검색으로 바꾸고, 이동 줄에는 Google 길찾기 옆에 "네이버 지도 ↗"(도착지 검색)를 더한다.

**Architecture:** 링크 규칙은 순수 모듈 `src/lib/leg-display.ts` 에 두 함수로 둔다(`usesNaverMap`, `naverSearchUrl`). 서버 칸(`MapSection`, `ScheduleSection`)이 `trip.countryCode` 로 `naverMap: boolean` 을 한 번 정해 클라이언트 칸에 내려준다. 지도 쪽은 `TripMapPanel` prop, 일정 쪽은 `ScheduleEditorProvider` 컨텍스트로 내려간다. DB·Google 호출 변화 없음.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `node --test`

**Spec:** GitHub 이슈 #36 본문(설계, 2026-11-25 사용자 승인 댓글). 나라 코드는 #100 결과: `trips.country_code`(`TripRow.countryCode: string | null`, 대문자 두 글자 CHECK).

## Global Constraints

- 네이버 링크 형식: `https://map.naver.com/p/search/<이름표>` (이름표는 `encodeURIComponent`).
- 넘기는 것은 **이름표(`label`)뿐**. Google 좌표·장소 id 는 네이버 링크에 넣지 않는다(Google 약관 15.2, 3.2.3(e)).
- 켜지는 조건: `countryCode === "KR"`. null 이거나 다른 나라면 지금과 똑같다.
- 링크 글자: 일정표 이동 줄 `길찾기 ↗`(그대로), 지도 탭 `Google 지도 ↗`(그대로), 네이버는 `네이버 지도 ↗`.
- 이동 줄의 네이버 링크는 도착지 이름표 검색. 장소 링크(가 볼 곳, 일정 줄 장소 글자)는 Google 대신 네이버로 **바꾼다**.
- DB 변경 없음. 위험 경로 파일을 건드리지 않는다.

## Review Focus

1. 이름표에 `/`·`#`·`?`·`%`·`&`·공백이 있음(예: "카페 A/B #2") → 이름표 전체가 검색어로 넘어가야 한다(경로가 끊기거나 해시로 잘리지 않음). Task 1 시험이 고정.
2. 이동 줄의 도착 이름표가 없음(`toLabel === null`, 응답 구간이 지금 장소 목록에 없는 장소를 가리킴) → 네이버 링크는 숨기고 Google 길찾기는 남는다. Task 3 에서 처리, 브라우저 확인 대상 아님(만들기 어려움) — 코드 리뷰로 본다.
3. 390px 휴대폰 폭에서 이동 줄에 링크가 둘 → 줄바꿈되더라도 가로로 넘치지 않고 링크 글자가 쪼개지지 않는다(`whitespace-nowrap`). Task 4 브라우저 확인.
4. 일정 줄 장소가 목록의 장소에 이어지지 않은 글자뿐(`placeId === null`) → 그 글자로 네이버 검색. 이어진 장소면 그 장소의 이름표로 검색. Task 2.
5. 나라 코드 null·`JP` 여행 → 링크가 지금과 똑같다(Google). Task 1 시험 + Task 4 브라우저 확인.

---

### Task 1: 링크 규칙 함수

**Files:**
- Modify: `src/lib/leg-display.ts` (끝, `placeUrl` 아래)
- Test: `src/lib/leg-display.test.mjs`

**Interfaces:**
- Produces:
  - `usesNaverMap(countryCode: string | null): boolean` — `countryCode === "KR"`.
  - `naverSearchUrl(label: string): string` — `` `https://map.naver.com/p/search/${encodeURIComponent(label)}` ``.

- [ ] **Step 1: 실패하는 시험 쓰기** (`leg-display.test.mjs` import 에 두 함수 추가)

```js
test("usesNaverMap: 한국 여행만", () => {
  assert.equal(usesNaverMap("KR"), true);
  assert.equal(usesNaverMap("JP"), false);
  assert.equal(usesNaverMap(null), false);
});

test("naverSearchUrl: 이름표만 검색어로", () => {
  assert.equal(
    naverSearchUrl("해운대 해수욕장"),
    "https://map.naver.com/p/search/%ED%95%B4%EC%9A%B4%EB%8C%80%20%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5",
  );
  const u = new URL(naverSearchUrl("카페 A/B #2 ?&%"));
  assert.equal(u.origin, "https://map.naver.com");
  assert.equal(u.hash, "");
  assert.equal(u.search, "");
  assert.equal(
    decodeURIComponent(u.pathname.slice("/p/search/".length)),
    "카페 A/B #2 ?&%",
  );
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → 두 시험 FAIL(import 한 이름이 없음).
- [ ] **Step 3: 두 함수 구현** — 위 Interfaces 그대로. 위 주석 한 줄: 국내 여행 링크(#36), Google 좌표·장소 id 는 넘기지 않음(약관).
- [ ] **Step 4: 통과 확인** — `npm test` → 모두 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "네이버 지도 검색 링크 함수 (#36)"`

### Task 2: 장소 링크를 네이버로 (가 볼 곳, 일정 줄 장소 글자)

**Files:**
- Modify: `src/app/trips/[id]/map-section.tsx` (`<TripMapPanel>` 에 `naverMap`)
- Modify: `src/app/trips/[id]/trip-map-panel.tsx` (`Props.naverMap: boolean`, `<PlaceRow naverMap>`)
- Modify: `src/app/trips/[id]/place-row.tsx` (`naverMap` prop, `href`)
- Modify: `src/app/trips/[id]/schedule-section.tsx` (`<ScheduleEditorProvider naverMap>`)
- Modify: `src/app/trips/[id]/schedule-editor.tsx` (`OpenState.naverMap`, provider prop, `export function useNaverMap(): boolean`, `ScheduleItemRow` 의 `placeHref`)

**Interfaces:**
- Consumes: Task 1 의 `usesNaverMap`, `naverSearchUrl`.
- Produces: `useNaverMap(): boolean` (schedule-editor.tsx, `useOpen().naverMap`) — Task 3 이 쓴다. `TripMapPanel` 의 `naverMap: boolean` prop — Task 3 이 `legRows` 에 넘긴다.

- [ ] **Step 1:** 두 서버 칸에서 `naverMap={usesNaverMap(trip.countryCode)}`.
- [ ] **Step 2:** `PlaceRow` 의 `href`: `naverMap ? naverSearchUrl(place.label) : placeUrl(place)`.
- [ ] **Step 3:** `ScheduleItemRow` 의 `placeHref`: 이어진 장소면 `naverMap ? naverSearchUrl(linkedPlace.label) : placeUrl(linkedPlace)`, 글자뿐이면 `naverMap ? naverSearchUrl(item.place) : mapsSearchUrl(item.place)`. 위 주석("Google 지도 링크…")도 맞게 고친다.
- [ ] **Step 4:** `npm run lint && npm run typecheck` → 통과.
- [ ] **Step 5: 커밋** — `git commit -m "국내 여행은 장소 링크를 네이버 지도 검색으로 (#36)"`

### Task 3: 이동 줄에 "네이버 지도 ↗" 더하기

**Files:**
- Modify: `src/app/trips/[id]/schedule-day-items.tsx` (`TravelLine`)
- Modify: `src/app/trips/[id]/day-legs.tsx` (`LegRow.naverUrl: string | null`, 링크 둘을 한 묶음으로)
- Modify: `src/app/trips/[id]/trip-map-panel.tsx` (`legRows(day, placesById, result, naverMap)`)

**Interfaces:**
- Consumes: `useNaverMap()` (Task 2), `naverSearchUrl` (Task 1), `TripMapPanel` 의 `naverMap`.

- [ ] **Step 1:** `ScheduleDayItems` 에서 `const naverMap = useNaverMap()`, `TravelLine` 에 `naverUrl={naverMap && line.toLabel ? naverSearchUrl(line.toLabel) : null}` 를 넘긴다. `TravelLine` 은 `길찾기 ↗` 뒤에 `naverUrl` 이 있을 때만 `<span className="text-sub"> · </span>` + `네이버 지도 ↗` 링크(기존 링크와 같은 class, `target="_blank" rel="noopener noreferrer"`).
- [ ] **Step 2:** `legRows` 에서 `naverUrl: naverMap ? naverSearchUrl(to.label) : null`. `DayLegs` 는 `ml-auto` 를 링크 묶음 `<span className="ml-auto flex shrink-0 gap-3">` 으로 옮기고 그 안에 `Google 지도 ↗`, (있으면) `네이버 지도 ↗`. 두 링크 모두 `whitespace-nowrap`.
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm test` → 통과.
- [ ] **Step 4: 커밋** — `git commit -m "국내 여행 이동 줄에 네이버 지도 링크 (#36)"`

### Task 4: 브라우저 확인과 PR

- [ ] **Step 1:** `run` 스킬로 로컬 dev, 임시 테스트 계정(docs/status.md 의 #90·#100 방식)으로 `KR` 여행·`JP` 여행 하나씩, 장소 둘 + 같은 날 일정 둘.
- [ ] **Step 2:** KR 여행: 가 볼 곳·일정 장소 글자 `href` 가 `map.naver.com/p/search/…`, 일정표 이동 줄과 지도 N일차 구간 목록에 `네이버 지도 ↗`(도착지 이름표), Google 링크 유지. JP 여행: 네이버 링크 없음, 장소 링크는 Google. 390px 에서 넘침 없음(Review Focus 3).
- [ ] **Step 3:** 테스트 행·계정 지우기, `/code-review`, draft PR(`Closes #36`, 위험 경로 없음), 이후 `CLAUDE.md` 작업 흐름대로.
