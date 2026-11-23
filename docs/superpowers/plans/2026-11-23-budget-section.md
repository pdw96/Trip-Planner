# 예산 칸 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예산 카드를 지도 칸에서 빼서 일정 다음 독립 칸으로 두고, 아래 예산 줄을 PC·휴대폰 모두에 두되 예산 칸이 보이면 숨긴다.

**Architecture:** 서버 `BudgetSection` 하나가 예산 데이터를 읽어 클라이언트 `BudgetArea` 에 넘긴다. `BudgetArea` 는 fragment 로 예산 칸(`<section>`)과 `BudgetDock` 을 나란히 그린다(둘 다 article 의 직계 자식이라 sticky 가 그대로 동작). 예산 칸의 화면 안/밖은 `BudgetArea` 가 IntersectionObserver 로 보고 dock 에 `hidden` 으로 넘긴다. 날짜를 바꿀 때 위치 유지는 `SelectedDayProvider` 에 "고르기 직전" 구독을 더해, 바뀌기 전 예산 칸 위치를 재고 바뀐 뒤 `useLayoutEffect` 에서 차이만큼 `window.scrollBy` 한다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-11-23-budget-section-design.md`

## Global Constraints

- DB·서버 동작 변경 없음. 위험 경로 파일을 건드리지 않는다.
- 사용자에게 보이는 문구는 한국어.
- 예산이 없으면 아래 줄은 없다. 예산 칸은 [전체]·[N일차] 모두 "예산 정하기" 빈 상태를 보인다.
- 숨은 줄에는 초점이 들어가지 않는다(`inert`). 숨김·보임이 레이아웃을 바꾸지 않는다(transform·opacity 만).
- `prefers-reduced-motion` 이면 부드러운 스크롤·전환 없음.

## Review Focus

1. 예산 칸을 보며 예산 표에서 날을 고르거나 날짜 줄을 누름 → 예산 칸 위 끝이 화면에서 같은 자리에 남는다.
2. 페이지 맨 끝까지 내림 → 줄이 숨은 채로 깜빡이지 않는다(숨김이 레이아웃을 바꾸지 않으므로 관찰 결과가 되먹임되지 않음).
3. 휴대폰 가로 돌림·PC 폭에서 [+ 지출] 판이 보이고 닫힌다(판은 이제 모든 폭에서 보이는 줄의 형제).
4. 키보드: 줄 요약 버튼 Enter → 예산 칸 제목에 초점, 날짜 줄에 가리지 않음(`scroll-mt-28`).
5. 지도 키가 없는 여행·예산이 없는 여행에서도 예산 칸이 보인다.

UI 배치·스크롤 동작이라 단위 시험(`src/**/*.test.mjs`, 순수 함수용)으로 잡을 것이 없다. 위 다섯 가지는 Task 3 의 브라우저 확인에서 본다.

---

### Task 1: 고르기 직전 구독 + 예산 카드 정리

**Files:**
- Modify: `src/app/trips/[id]/selected-day.tsx`
- Modify: `src/app/trips/[id]/budget-card.tsx`

**Interfaces:**
- Produces: `useSelectedDay()` 결과에 `onBeforeSelect(listener: () => void): () => void` 추가(해제 함수 반환). `select(value)` 는 상태를 바꾸기 전에 등록된 listener 를 동기로 부른다. listener 는 ref 에 든 `Set` 에 둔다(렌더를 일으키지 않음).
- Produces: `BudgetCard` props 의 `days` 타입을 `TripDay[]`(`@/lib/schedule`)로. 쓰는 필드는 `date`·`dayNumber`·`label` 뿐이라 `PanelDay` 는 필요 없다.

- [ ] **Step 1:** `selected-day.tsx` 에 위 `onBeforeSelect` 를 더한다. 맨 위 "왜 있나" 주석에 한 줄(예산 칸이 날짜 바뀜 전 위치를 재려고).
- [ ] **Step 2:** `budget-card.tsx`: `days: TripDay[]`. 예산 없음 분기의 `if (tab !== "all") return null;` 를 지워 [N일차]에도 빈 상태. [전체] 카드의 `h3` "예산" → "전체 예산"(바깥 칸 제목 "예산"과 겹치지 않게). 맨 위 주석 "지도 칸 탭 아래의" → "예산 칸의".
- [ ] **Step 3:** `npm run typecheck` — 이 단계에서는 `trip-map-panel.tsx` 가 `PanelDay[]` 를 넘겨도 구조적으로 맞으므로 통과.

### Task 2: 예산 칸·아래 줄 옮기기

**Files:**
- Create: `src/app/trips/[id]/budget-section.tsx` (서버, `budget-dock-section.tsx` 를 대체)
- Create: `src/app/trips/[id]/budget-area.tsx` (`"use client"`)
- Delete: `src/app/trips/[id]/budget-dock-section.tsx`
- Modify: `src/app/trips/[id]/budget-dock.tsx`, `trip-map-panel.tsx`, `map-section.tsx`, `page.tsx`, `budget-data.ts`(주석), `budget-meter.tsx`(주석)

**Interfaces:**
- Consumes: Task 1 의 `onBeforeSelect`, `BudgetCard({ tripId, budget, tab, days: TripDay[], onSelectTab })`.
- Produces: `BudgetSection({ userId, trip, today }): Promise<JSX>` — `toPanelBudget(await loadBudget(userId, trip), trip)` 를 `BudgetArea` 에 넘긴다(`days = tripDays(...)`, `today` 는 여행 중이면 그날 아니면 null — 지금 `BudgetDockSection` 과 같은 계산).
- Produces: `BudgetArea({ tripId, budget: PanelBudget, days: TripDay[], today: string | null })`.
- Produces: `BudgetDock` props 에 `hidden: boolean`, `onJump: () => void` 추가.

- [ ] **Step 1: `BudgetArea`**
  - fragment 로 `<section ref aria-labelledby="budget-heading" className="flex scroll-mt-28 flex-col gap-4">` + `<h2 id="budget-heading" tabIndex={-1} className={sectionTitleClass}>예산</h2>` + `<BudgetCard tab={selected} onSelectTab={select} …/>`, 그 뒤 `budget && <BudgetDock hidden={sectionVisible} onJump={jump} …/>`. wrapper div 를 두지 않는다(dock 은 article 직계여야 sticky).
  - `sectionVisible`: IntersectionObserver(threshold 0)로 칸이 한 픽셀이라도 화면에 있으면 true.
  - `jump()`: `section.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" })`, 이어서 제목 `focus({ preventScroll: true })`. `reduced` 는 `matchMedia("(prefers-reduced-motion: reduce)").matches`.
  - 위치 유지: `onBeforeSelect` 로 등록한 listener 가 `{ top: rect.top, visible: rect.top < innerHeight && rect.bottom > 0 }` 를 ref 에 적는다. `useLayoutEffect([selected])` 에서 적힌 값이 있고 visible 이면 `scrollBy(0, newTop - top)`(차이 1px 이상일 때), 그다음 ref 를 비운다. 브라우저 scroll anchoring 이 이미 맞췄으면 차이가 0 이라 아무 일 없다.
- [ ] **Step 2: `BudgetDock`**
  - 줄 클래스에서 `sm:hidden` 제거, `sm:-mx-6 sm:px-6` 추가. `hidden` 이면 `translate-y-full opacity-0` + `inert`, 아니면 그대로. `transition-[translate,opacity] motion-reduce:transition-none`.
  - 왼쪽 요약을 `<button type="button" onClick={onJump} aria-label="예산 칸으로 가기">` 로. 안의 `<p>` 는 `<span className="flex …">`, `BudgetBar` 의 `div` 도 버튼 안에 둘 수 있게 `BudgetBar` 바깥을 `span block` 으로 바꾼다(버튼 안은 phrasing content).
  - dialog 클래스에 `sm:mx-auto sm:max-w-2xl` 추가(PC 에서 글 칸 폭, 아래 가운데).
  - 머리 주석: 데스크톱 없음 → 모든 폭, "숫자는 눌러도 아무 일 없다" 삭제, 판을 줄 밖에 둔 까닭(가로 돌림) 문구를 "판은 줄의 형제: 줄이 숨거나(inert) 옮겨져도 판은 영향 없게" 로 고친다.
- [ ] **Step 3: 지도 칸에서 빼기** — `trip-map-panel.tsx` 에서 `BudgetCard`·`budget` prop·`PanelBudget` import 제거(`select` 가 더 안 쓰이면 구조 분해에서도 뺀다). `map-section.tsx` 에서 `loadBudget`·`toPanelBudget`·`budget=` 제거.
- [ ] **Step 4: 페이지** — `page.tsx` 에서 `BudgetDockSection` 대신 `ScheduleSection` 다음에 `<Suspense fallback={null}><BudgetSection userId trip today /></Suspense>`. 주석: "예산 칸과 아래 예산 줄(#88). article 마지막이라 줄이 끝에서 제자리에 놓인다."
- [ ] **Step 5:** `npm run lint`, `npm run typecheck`, `npm test` 통과.
- [ ] **Step 6: Commit** `feat: 예산을 지도 칸에서 빼서 따로 보기 (#88)`

### Task 3: 브라우저 확인

- [ ] `run` 스킬로 dev 서버, 테스트 계정으로 예산 있는 여행·없는 여행. Playwright 로 390×844, 1280×900 두 폭에서 Review Focus 1–5 와 설계 '빌더에게 남긴 것'의 확인 목록을 본다. 스크린숏(사람이 볼 것은 deviceScaleFactor 2).
- [ ] 문제가 있으면 고치고 Task 2 Step 5 를 다시 돌린 뒤 커밋.
