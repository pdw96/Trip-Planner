# 예산 바텀 시트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 맨 아래 예산 칸을 없애고, 아래 예산 줄을 누르면 예산 카드가 `<dialog>` 바텀 시트(맨 위 날짜 칩 줄, 쓸어내려 닫기)로 열린다.

**Architecture:** `BudgetArea` 는 늘 떠 있는 아래 줄(예산 있음: `BudgetDock`, 없음: `BudgetSetupDock`)과 `BudgetSheet` 를 그리고, 시트 열기 요청(`{ mode, id } | null`)을 상태로 든다. 시트 안 날짜 칩은 위 날짜 줄에서 떼어 낸 `DayChips` 를 함께 쓴다(같은 `useSelectedDay`). 쓸어내리기의 판정(방향 고정, 닫을지)은 순수 함수 `src/lib/sheet-drag.ts` 로 두고 단위 시험한다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-budget-sheet-design.md`

## Global Constraints

- DB·서버 동작 변경 없음. 위험 경로 파일(`package.json` 등)을 건드리지 않는다 — 새 패키지 없음.
- 사용자에게 보이는 문구는 한국어.
- 시트: `<dialog>` showModal, 휴대폰 전체 폭, `sm` 이상 `max-w-2xl` 가운데, 최대 높이 `85dvh`, 바탕 흐림(`backdrop:bg-foreground/30`, [+ 지출] 시트와 같게).
- 닫기 네 가지: 바깥 누르기·[✕]·Esc·쓸어내리기. 쓸어내리기는 손잡이·날짜 칩 줄(시트 머리)에서만.
- `prefers-reduced-motion` 이면 끌기 뒤 되돌아오는 전환·열고 닫는 애니메이션 없음.
- 같은 예산이 한 화면에 두 번 보이지 않는다(맨 아래 예산 칸 없음).

## Review Focus

1. 시트 머리의 날짜 칩 줄을 옆으로 넘김 → 시트가 내려오거나 닫히지 않고 칩만 넘어간다(Task 1 `dragAxis` 시험 + Task 4 브라우저).
2. 날짜 칩을 그냥 톡 누름 → 그날로 바뀌고 시트는 그대로. 세로로 끌다 놓은 뒤에는 손가락 밑 칩이 눌리지 않는다(Task 2 구현 규칙, Task 4 브라우저).
3. 시트 안 긴 [전체] 카드를 스크롤 → 시트가 닫히지 않고 머리는 위에 붙어 있다(Task 4 브라우저).
4. 예산 없는 여행: "예산 정하기" → 설정 양식이 열린 시트. 칩으로 다른 날로 갔다 와도 설정 양식이 저절로 다시 열리지 않는다. 저장하면 줄이 요약 줄로 바뀐다(Task 2 규칙, Task 4 브라우저).
5. 시트를 닫으면 페이지 스크롤 위치는 연 때 그대로, 초점은 연 버튼으로 돌아온다(Task 4 브라우저).

UI 동작은 단위 시험(`src/**/*.test.mjs`, 순수 함수용)으로 잡을 수 없는 것이 많다. 끌기 판정만 Task 1 에서 시험하고 나머지는 Task 4 브라우저 확인에서 본다.

---

### Task 1: 끌기 판정 순수 함수

**Files:**
- Create: `src/lib/sheet-drag.ts`
- Test: `src/lib/sheet-drag.test.mjs`

**Interfaces:**
- Produces: `dragAxis(dx: number, dy: number): "x" | "y" | null` — 움직인 거리가 `AXIS_SLOP`(8px) 미만이면 `null`, 넘으면 `|dy| > |dx|` 일 때 `"y"`, 아니면 `"x"`.
- Produces: `shouldCloseSheet(dy: number, ms: number, height: number): boolean` — 아래로 `min(120, height * 0.25)` 이상 끌었거나, 24px 이상 끌고 속도 `dy / ms ≥ 0.5`(px/ms)면 `true`. 위로(`dy ≤ 0`)는 늘 `false`. `ms ≤ 0` 이면 속도 조건은 보지 않는다.
- Produces: `export const AXIS_SLOP = 8`.

- [ ] **Step 1: 실패하는 시험 작성** (`src/lib/day-line.test.mjs` 와 같은 꼴, `./sheet-drag.ts` 에서 import)

```js
test("dragAxis waits until movement passes the slop", () => {
  assert.equal(dragAxis(3, 5), null);
  assert.equal(dragAxis(0, 8), "y");
  assert.equal(dragAxis(10, 4), "x");
  assert.equal(dragAxis(-6, -9), "y");
});

test("shouldCloseSheet closes after a long enough drag", () => {
  assert.equal(shouldCloseSheet(119, 1000, 800), false);
  assert.equal(shouldCloseSheet(120, 1000, 800), true);
  assert.equal(shouldCloseSheet(50, 1000, 200), true); // 짧은 시트는 높이의 25%
});

test("shouldCloseSheet closes on a quick flick", () => {
  assert.equal(shouldCloseSheet(40, 60, 800), true);
  assert.equal(shouldCloseSheet(20, 10, 800), false); // 24px 미만
  assert.equal(shouldCloseSheet(40, 0, 800), false);
});

test("shouldCloseSheet never closes on an upward drag", () => {
  assert.equal(shouldCloseSheet(-200, 50, 800), false);
});
```

- [ ] **Step 2:** `npm test` → `sheet-drag` 시험이 모듈 없음으로 FAIL.
- [ ] **Step 3:** `src/lib/sheet-drag.ts` 에 위 세 가지를 구현. 맨 위 주석 한 줄(예산 바텀 시트 쓸어내리기 판정, #97).
- [ ] **Step 4:** `npm test` → 모두 PASS.
- [ ] **Step 5:** 커밋 `feat: 바텀 시트 끌기 판정 함수 (#97)`

### Task 2: 날짜 칩 떼어 내기 + 예산 시트

**Files:**
- Create: `src/app/trips/[id]/day-chips.tsx` (`"use client"`)
- Create: `src/app/trips/[id]/budget-sheet.tsx` (`"use client"`)
- Modify: `src/app/trips/[id]/trip-day-bar.tsx`
- Modify: `src/app/trips/[id]/budget-card.tsx`

**Interfaces:**
- Consumes: Task 1 의 `dragAxis`, `shouldCloseSheet`.
- Produces: `DayChips({ days: { date: string; dayNumber: number }[] })` — 지금 `TripDayBar` 의 `<fieldset>`(legend "날짜 고르기", [전체] + 날짜 동그라미 + 고른 날 글자)와 "고른 날이 줄 밖이면 줄만 옮겨 가운데" `useLayoutEffect` 를 그대로 옮긴 것. `useSelectedDay()` 를 직접 읽는다. `TripDayBar` 는 이것을 쓴다(동작·모양 변화 없음).
- Produces: `BudgetCard` props 에 `initialForm?: "settings"` 추가. 처음 연 탭에서만 그 양식이 열린 채 시작한다. 구현: `BudgetCard` 안에서 `const [firstTab, setFirstTab] = useState<string | null>(props.tab); if (firstTab !== null && props.tab !== firstTab) setFirstTab(null);`(렌더 중 파생 상태) 후 `CardBody` 에 `initialForm={props.tab === firstTab ? props.initialForm : undefined}`, `CardBody` 는 `useState(initialForm ?? null)`.
- Produces: `type SheetRequest = { mode: "view" | "settings"; id: number }` (`budget-sheet.tsx` 에서 export).
- Produces: `BudgetSheet({ tripId, budget: PanelBudget, days: TripDay[], request: SheetRequest | null, onClose: () => void })`.

- [ ] **Step 1:** `day-chips.tsx` 로 옮기고 `TripDayBar` 가 `<DayChips days={days} />` 를 쓰게. 맨 위 주석: 위 날짜 줄과 예산 시트가 함께 쓴다(#97).
- [ ] **Step 2:** `budget-card.tsx` 에 `initialForm` (위 규칙). 맨 위 주석의 "자리는 #88" → "자리는 예산 시트(#97)".
- [ ] **Step 3:** `budget-sheet.tsx` — 규칙:
  - `request` 가 null 이 아니게 되면 effect 에서 `dialogRef.current.showModal()`(이미 열려 있으면 안 함). 내용은 `request` 가 있을 때만 그리고 `key={request.id}`(열 때마다 양식 새로). `onClose` 이벤트에서 `onClose()` 를 불러 부모가 `request` 를 null 로.
  - dialog: `aria-label="예산"`, 클래스는 [+ 지출] 시트(`budget-dock.tsx`)와 같은 바탕에 `overscroll-contain`, 안쪽 여백은 머리·몸으로 나눔. 바깥 누르기 닫기는 [+ 지출] 시트와 같은 `event.target === event.currentTarget` 방식.
  - 머리(`sticky top-0 z-10 bg-background`): 가운데 손잡이 막대(`aria-hidden`, `touch-action: none`), 그 아래 한 줄에 `<DayChips>`(flex-1, `touch-action: pan-x` — 가로 넘김은 브라우저가, 세로 끌기는 우리가) + [✕] 버튼(`aria-label="예산 닫기"`, `autoFocus`).
  - 몸: `<BudgetCard tripId budget tab={selected} days onSelectTab={select} initialForm={request.mode === "settings" ? "settings" : undefined} />` (`selected`·`select` 는 `useSelectedDay()`).
  - 쓸어내리기(머리에서 pointerdown): 시작 좌표·시각 기록 → pointermove 에서 `dragAxis` 가 `"y"` 가 되면 `setPointerCapture` 하고 끌기 시작, `"x"` 면 이번 동작은 포기. 끄는 동안 dialog 에 `style.translate = "0 ${max(0, dy)}px"` 를 직접 넣는다(렌더 없음, 전환 끔). pointerup 에서 `shouldCloseSheet(dy, ms, dialog.offsetHeight)` 면 `dialog.close()`, 아니면 전환(`motion-reduce` 면 없이)으로 0 으로 되돌림. 닫을 때·`pointercancel` 때 `translate` 를 비운다. 세로로 끌었던 동작 뒤에 오는 click 은 capture 단계에서 한 번 막는다(놓은 자리 칩이 눌리지 않게).
  - 맨 위 주석: 왜 `<dialog>` 인지(초점 가두기·Esc·초점 돌려주기를 브라우저가), 쓸어내리기를 머리에서만 받는 이유(내용 스크롤과 헷갈리지 않게).
- [ ] **Step 4:** `npm run lint && npm run typecheck` → 통과(아직 아무도 `BudgetSheet` 를 쓰지 않아도 됨).
- [ ] **Step 5:** 커밋 `feat: 예산 바텀 시트와 날짜 칩 공통화 (#97)`

### Task 3: 예산 칸 없애고 아래 줄에서 시트 열기

**Files:**
- Modify: `src/app/trips/[id]/budget-area.tsx`
- Modify: `src/app/trips/[id]/budget-dock.tsx`
- Modify: `src/app/trips/[id]/selected-day.tsx`
- Modify: `src/app/trips/[id]/budget-section.tsx` (주석), `src/app/trips/[id]/page.tsx` (주석)

**Interfaces:**
- Consumes: Task 2 의 `BudgetSheet`, `SheetRequest`.
- Produces: `BudgetDock` props 에서 `hidden`·`onJump` 를 빼고 `onOpen: () => void` 추가. `ref` prop 도 뺀다(숨김이 없어져 쓸 곳이 없음).
- Produces: `BudgetSetupDock({ onOpen: () => void })` (`budget-dock.tsx` 에서 export). 줄 바깥 꼴(sticky·여백·테두리)은 `BudgetDock` 과 같은 상수 하나를 쓴다.

- [ ] **Step 1:** `budget-dock.tsx`: 숨김 관련 클래스·`inert` 제거, 요약 버튼 `onClick={onOpen}`, sr-only 글 "예산 열기, ". `BudgetSetupDock`: 줄 전체가 버튼 하나 — 굵은 "예산 정하기" + 작은 `text-sub` "일정마다 예상 비용과 실제 지출을 적을 수 있어요". 맨 위 주석을 #97 동작으로 고침(시트 밖에 dialog 를 둔 까닭 주석은 숨김이 없어졌으니 정리).
- [ ] **Step 2:** `budget-area.tsx`: `<section>`·`h2`·IntersectionObserver·`onBeforeSelect`·`useLayoutEffect`·`jump` 를 지운다. 상태 `const [request, setRequest] = useState<SheetRequest | null>(null)` 와 `open(mode)` (id 는 늘어나는 수). 그리기: `budget ? <BudgetDock … onOpen={() => open("view")} /> : <BudgetSetupDock onOpen={() => open("settings")} />` + `<BudgetSheet … request={request} onClose={() => setRequest(null)} />`. fragment 유지(줄이 article 직계 자식). 맨 위 주석 고침.
- [ ] **Step 3:** `selected-day.tsx`: `onBeforeSelect`·`beforeSelect` ref·`useCallback`·관련 주석 줄을 지운다(`select` 는 같은 날 다시 고르기만 셈).
- [ ] **Step 4:** `budget-section.tsx`·`page.tsx` 주석을 "아래 예산 줄과 예산 시트(#97)" 로.
- [ ] **Step 5:** `npm run lint && npm run typecheck && npm test` → 모두 통과. `grep -rn "onBeforeSelect\|budget-heading" src` → 결과 없음.
- [ ] **Step 6:** 커밋 `feat: 맨 아래 예산 칸 대신 아래 줄에서 예산 시트 열기 (#97)`

### Task 4: 브라우저 확인

**Files:** 없음(고칠 것이 나오면 해당 파일).

- [ ] **Step 1:** `run` 스킬로 앱을 띄우고 Playwright 로 로그인된 여행 화면을 연다(휴대폰 390×844, PC 1280×800 둘 다).
- [ ] **Step 2:** 설계 '빌더에게 남긴 것'의 확인 목록과 위 Review Focus 다섯 가지를 차례로 본다: 줄 요약 누르기(마우스·Enter) → 시트, 시트 칩으로 날 바꾸기와 닫은 뒤 뒤 화면 날짜, 날짜 표에서 날 고르기, 닫기 네 가지(쓸어내리기는 터치 에뮬레이션 또는 pointer 이벤트로), 닫은 뒤 `window.scrollY` 가 연 때와 같은지, 긴 [전체] 카드 스크롤, 예산 없는 여행, 저장 뒤 숫자 갱신, [+ 지출] 시트, 다크 모드. 같은 예산이 두 번 보이지 않는지.
- [ ] **Step 3:** 고친 것이 있으면 lint·typecheck·test 후 커밋 `fix: 예산 시트 … (#97)`.
