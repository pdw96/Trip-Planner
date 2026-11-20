# 디자인 정리 PR 2 (여행 화면) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행 화면(`/trips/[id]`)을 노선도 모양으로 바꾼다: 머리·함께하는 사람 접기, 위에 붙는 날짜 줄, 날짜 고르기가 지도·예산·일정을 함께 거름, 노선 일정(역 동그라미 = 완료), 지도 선·핀 날짜 색, 예산 카드 머리 + 휴대폰 아래 예산 줄과 [+ 지출] 시트. `Closes #53`.

**Architecture:** 고른 날은 페이지 안 클라이언트 context(`selected-day.tsx`) 하나에 두고 날짜 줄·지도 칸·일정 칸·아래 예산 줄이 같이 읽는다. 서버가 그린 일정 날·가 볼 곳은 그대로 두고 고르지 않은 것은 `hidden` 으로 감춘다(열린 칸·끌기 상태 유지). 노선 색은 일정 칸에서는 CSS 변수(`--line`)로 물려주고, 지도 선(Google Polyline)에만 hex 표를 쓴다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, `@dnd-kit`, `@vis.gl/react-google-maps`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-design-refresh-design.md` (§5.4 여행 화면, §5.4.1, §5.4.2, §5.5, §5.6, §5.7, §6)

## Global Constraints

- 새 패키지 없음. 위험 경로(CLAUDE.md 목록: `package.json`, `next.config.ts`, `src/db/schema.ts`, `src/lib/auth*.ts`, `.github/**` 등) 건드리지 않음. DB·Server Action·쿼리 변경 없음.
- 동작은 그대로(저장·권한·순서 규칙·이동 시간 묻는 방식). 바뀌는 동작은 하나: 날짜 고르기가 일정·가 볼 곳까지 거른다(§5.4.1).
- 기존 문구는 바꾸지 않는다. 새 문구만: "시각 없음", "N일차로 옮겼어요", "N박 M일"/"당일", "+ 지출", 함께하는 사람 한 줄 요약.
- 색은 토큰 유틸리티만(`bg-surface`, `text-sub`, `border-rule`, `text-danger` …). 컴포넌트에 `dark:`·`zinc-*`·`blue-*`·`amber-*`·`white`·`black` 을 쓰지 않는다.
- 노선 색은 날짜 표시에만(동그라미, 레일, 지도 선·핀, 예산 표의 점). 버튼·링크·초점 링·입력칸·**글자**에는 쓰지 않는다. (설계는 이동 줄 글자를 노선 색으로 했지만 주황·노랑 계열이 바탕 위 본문 대비 4.5:1 을 못 넘는다 — 반목표 "읽기 어려운 글자". 글자는 `text-foreground`, 노선 색은 바로 옆 레일이 맡는다.)
- 숨김은 `hidden` 속성(그리되 감춤). 고르지 않은 날·[전체] 전용 칸을 조건부 렌더로 빼지 않는다.
- 360px 너비에서 페이지 가로 스크롤 없음. 날짜 줄만 그 안에서 가로 스크롤.
- 커밋 전 `npm run lint > <scratchpad>/lint.log 2>&1; echo $?`(종료 코드 0), `npm run typecheck`, `node --test 'src/**/*.test.mjs'`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 와 `Claude-Session: https://claude.ai/code/session_01RrBS7m2oe6369b5ZHZd32h`.

## Review Focus

1. 고른 날이 사라짐: N일차를 보다가 여행 기간을 줄이고 돌아오면 [전체] 로 보인다(빈 화면이 아니다) — Task 1 `resolveSelection` 시험 + Task 7 확인.
2. 탭을 오가도 열린 일정 고치기 칸·가 볼 곳 고치기 칸·실제 지출 칸이 남고, 숨긴 날은 이동 시간을 묻지 않는다 — Task 7 확인(Vercel 대신 dev 서버 네트워크 탭의 `day-route` 요청 수).
3. 360px 에서 공백 없는 긴 제목·장소·메모가 노선 줄을 넘치지 않고, 30일 여행의 날짜 줄은 줄 안에서만 스크롤된다 — Task 4·Task 2 구현 조건 + Task 7 사진.
4. 다크 모드에서 날짜 동그라미 숫자·지도 선이 읽힌다, `globals.css` 와 TS hex 표가 어긋나지 않는다 — Task 1 대비 확인·동기화 시험.
5. [+ 지출] 시트: 오류가 나면 시트가 열린 채 문구, 저장하면 닫히고 숫자가 바뀜, Esc·바깥 누름·[취소] 로 닫으면 초점이 [+ 지출] 로 — Task 6 + Task 7 확인. 총 예산 0원일 때 막대가 NaN 폭이 되지 않는다 — Task 1 `budgetMeter` 시험.

---

### Task 1: 순수 함수와 노선 색 대비

**Files:**
- Modify: `src/lib/trip-dates.ts`, `src/lib/trip-dates.test.mjs`
- Modify: `src/lib/day-line.ts`, `src/lib/day-line.test.mjs`
- Modify: `src/lib/budget.ts`, `src/lib/budget.test.mjs`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces:
  - `resolveSelection(selected: string, startDate: string, endDate: string): string` — `"all"` 이거나 기간 안 날짜면 그대로, 아니면 `"all"`.
  - `stayLength(startDate: string, endDate: string): string` — `"당일"` | `"N박 M일"`.
  - `lineVar(dayNumber: number | null): string` — `"var(--color-line-3)"`, `null` 이면 `"var(--color-sub)"`(기간 밖 회색 노선).
  - `LINE_HEX: { light: readonly string[]; dark: readonly string[] }`(각 8개), `lineHex(dayNumber: number, scheme: "light" | "dark"): string`
  - `budgetMeter(projected: number, total: number): { percent: number; over: boolean }` — `percent` 0–100.
  - 토큰 `--on-line`(밝게 `#ffffff`, 어둡게 `#121418`) → 유틸리티 `text-on-line`.

- [ ] **Step 1: 실패하는 시험을 쓴다**

```js
// trip-dates.test.mjs
test("resolveSelection keeps all and in-range dates", () => {
  assert.equal(resolveSelection("all", "2026-12-05", "2026-12-07"), "all");
  assert.equal(resolveSelection("2026-12-05", "2026-12-05", "2026-12-07"), "2026-12-05");
  assert.equal(resolveSelection("2026-12-07", "2026-12-05", "2026-12-07"), "2026-12-07");
});
test("resolveSelection falls back to all", () => {
  assert.equal(resolveSelection("2026-12-08", "2026-12-05", "2026-12-07"), "all");
  assert.equal(resolveSelection("2026-12-04", "2026-12-05", "2026-12-07"), "all");
  assert.equal(resolveSelection("", "2026-12-05", "2026-12-07"), "all");
});
test("stayLength", () => {
  assert.equal(stayLength("2026-12-05", "2026-12-05"), "당일");
  assert.equal(stayLength("2026-12-05", "2026-12-06"), "1박 2일");
  assert.equal(stayLength("2026-12-30", "2027-01-02"), "3박 4일");
});

// day-line.test.mjs
test("lineVar", () => {
  assert.equal(lineVar(3), "var(--color-line-3)");
  assert.equal(lineVar(11), "var(--color-line-3)");
  assert.equal(lineVar(null), "var(--color-sub)");
});
test("LINE_HEX matches globals.css", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const [light, dark] = css.split("@media (prefers-color-scheme: dark)");
  const pick = (block) => Array.from({ length: 8 }, (_, i) =>
    block.match(new RegExp(`--line-${i + 1}:\\s*(#[0-9a-f]{6})`, "i"))[1].toLowerCase());
  assert.deepEqual([...LINE_HEX.light], pick(light));
  assert.deepEqual([...LINE_HEX.dark], pick(dark));
  assert.equal(lineHex(9, "dark"), LINE_HEX.dark[0]);
});

// budget.test.mjs
test("budgetMeter", () => {
  assert.deepEqual(budgetMeter(472000, 600000), { percent: 78.67, over: false }); // 소수 둘째 자리 반올림
  assert.deepEqual(budgetMeter(700000, 600000), { percent: 100, over: true });
  assert.deepEqual(budgetMeter(600000, 600000), { percent: 100, over: false });
  assert.deepEqual(budgetMeter(0, 0), { percent: 0, over: false });
  assert.deepEqual(budgetMeter(1000, 0), { percent: 100, over: true });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `node --test src/lib/trip-dates.test.mjs src/lib/day-line.test.mjs src/lib/budget.test.mjs`
Expected: FAIL — `resolveSelection`·`lineVar`·`budgetMeter` 가 없음.

- [ ] **Step 3: 함수를 구현한다**

`trip-dates.ts`·`day-line.ts`·`budget.ts` 는 다른 모듈을 import 하지 않는다(시험이 바로 불러온다). `LINE_HEX` 는 지금 `globals.css` 값으로 채운다. `resolveSelection` 은 날짜 문자열 비교로 충분(형식이 틀린 값은 기간 비교에서 떨어지거나 `"all"`). `budgetMeter`: `total <= 0` 이면 `projected > 0 ? {100, true} : {0, false}`.

- [ ] **Step 4: 노선 색 대비를 확인하고 고친다**

scratchpad 에 WCAG 대비 계산 스크립트를 쓰고, 밝게·어둡게 각각 (a) `line-N` vs `--on-line`(동그라미 안 숫자) ≥ 3:1, (b) `line-N` vs `--background`(레일·지도 선) ≥ 3:1 을 본다. 못 넘는 색만 같은 색상에서 명도만 조금 바꾼다(밝게는 어둡게, 어둡게는 밝게). `globals.css` 의 `:root`·dark 블록과 `LINE_HEX` 를 함께 고치고(동기화 시험이 지킴), `--on-line` 토큰과 `@theme inline` 의 `--color-on-line` 을 더한다. 고친 값과 대비 숫자를 커밋 메시지에 적는다.

- [ ] **Step 5: 시험 통과 확인 후 커밋**

Run: `node --test 'src/**/*.test.mjs'` → 모두 PASS. lint·typecheck 후:

```bash
git add src/lib src/app/globals.css
git commit -m "고른 날·숙박 길이·노선 색 변수·예산 막대 순수 함수, 노선 색 대비 (#53)"
```

---

### Task 2: 고른 날 저장소, 위에 붙는 날짜 줄, 여행 머리

**Files:**
- Create: `src/app/trips/[id]/selected-day.tsx`
- Create: `src/app/trips/[id]/trip-day-bar.tsx`
- Modify: `src/app/trips/[id]/page.tsx`
- Modify: `src/app/trips/delete-trip-button.tsx`
- Modify: `src/app/trips/[id]/map-section.tsx`, `src/app/trips/[id]/trip-map-panel.tsx`

**Interfaces:**
- Consumes: `resolveSelection`, `stayLength`(Task 1), `lineClass(n, "bg")`, `tripDays`, `dateLabel`, `formatLongRange`.
- Produces:
  - `SelectedDayProvider({ startDate, endDate, initial, children }: { startDate: string; endDate: string; initial: string; children: React.ReactNode })`
  - `useSelectedDay(): { selected: string; select: (value: string) => void; reselectCount: number }` — `selected` 는 늘 `resolveSelection` 을 거친 값. 이미 고른 값을 다시 고르면 `reselectCount` 만 1 늘어난다.
  - `ShownWhen({ value, children }: { value: string; children: React.ReactNode })` — `value` 가 `"all"` 이면 [전체] 일 때만, 날짜면 [전체] 이거나 그날일 때 보이는 `<div hidden>` 감싸개.
  - `TripDayBar({ title, titleId, days }: { title: string; titleId: string; days: { date: string; dayNumber: number }[] })`
  - `TripMapPanel` props 에서 `initialTab` 이 빠진다.

- [ ] **Step 1: `selected-day.tsx` 를 쓴다**

`"use client"`. 파일 맨 위에 왜 있나 한 줄(지도·예산·일정·아래 줄이 같은 고른 날을 읽는다, 설계 §5.4.1, 주소·DB 에 저장하지 않음). `ShownWhen` 은 위 규칙대로 `<div hidden={!shown}>` 하나.

- [ ] **Step 2: `trip-day-bar.tsx` 를 쓴다**

- 바깥: `sticky top-0 z-20 bg-background` + 본문 좌우 여백만큼 음수 여백·안쪽 여백(`-mx-4 px-4 sm:-mx-6 sm:px-6`). 붙은 동안에만 `border-b border-rule`.
- 첫 줄: 작은 제목(`truncate text-sm font-bold`). 늘 자리를 차지하고 붙기 전에는 `invisible`. 붙는 순간 아래 내용이 밀리지 않아야 한다(제목 줄 높이만큼 바 위쪽 음수 여백으로 article 의 `gap-8` 안에 넣는다).
- 붙었는지: `IntersectionObserver` 로 `document.getElementById(titleId)` 를 보고 `!isIntersecting && boundingClientRect.top < 0`. 스크롤 이벤트를 쓰지 않는다.
- 둘째 줄(가로 스크롤 `overflow-x-auto`): [전체] 알약(`buttonClass` 아님, 지금 `DayTabs` 의 알약 모양 유지, 고르면 `bg-foreground text-on-ink`) + 날마다 동그라미 `size-9 rounded-full text-sm font-bold text-on-line ${lineClass(n, "bg")}`, 고르지 않은 날 `opacity-45`, 고른 날 `ring-2 ring-foreground ring-offset-2 ring-offset-background`. 모두 `button type=button aria-pressed`, 동그라미 `aria-label={\`${n}일차 ${dateLabel(date, false)}\`}`, [전체] `title="모든 장소"`. 고른 동그라미 바로 뒤에 `dateLabel(date, false)` 글자(`text-sm text-sub whitespace-nowrap`).
- 처음 그릴 때 고른 동그라미가 줄 안에 보이도록 그 줄의 `scrollLeft` 만 맞춘다(`scrollIntoView` 금지 — 페이지가 움직인다).
- 누르면 `select(value)`.

- [ ] **Step 3: `page.tsx` 를 바꾼다**

- 위 줄: "← 내 여행" 링크 왼쪽, 오른쪽에 [고치기] `buttonClass("secondary", "small")`·[삭제](주인만). `DeleteTripButton` 은 이 화면에서만 쓰므로 `buttonClass("danger", "small")` 로 바꾼다.
- 제목 `h1 id="trip-title" className="text-2xl font-bold break-words"`, 그 아래 `${trip.destination} · ${formatLongRange(...)} · ${stayLength(...)}`(`text-sub break-words`), 메모 판 그대로, `MembersSection` 그대로(Task 3 이 모양을 바꾼다).
- `DayRouteProvider` 안을 `SelectedDayProvider startDate endDate initial={todayInTrip ? today : "all"}` 로 감싸고, 그 안 맨 앞에 `<TripDayBar title={trip.title} titleId="trip-title" days={tripDays(...).map(({date, dayNumber}) => ({date, dayNumber}))} />`, 그다음 지금처럼 지도 `Suspense` → `ScheduleSection`. 머리(`header`)는 저장소 밖 그대로.

- [ ] **Step 4: 지도 칸이 저장소를 읽게 한다**

`map-section.tsx`: `todayInTrip`·`initialTab` 계산을 지운다. `trip-map-panel.tsx`:
- `tab` 상태·`DayTabs`·`initialTab` 을 지우고 `useSelectedDay()` 를 쓴다. `day = selected === "all" ? null : days.find(...) ?? null`.
- 고른 날이 바뀌면 강조를 지운다(지금 `selectTab` 과 같음). `reselectCount` 가 늘면 그날이면 `reload()`(같은 탭 다시 누르면 다시 묻기, 지금과 같음).
- `showOnMap` 의 `setTab("all")` → `select("all")`. `BudgetCard onSelectTab={select}`.
- "가 볼 곳" `section` 에 `hidden={day !== null}`(그리되 감춤, 열린 고치기 칸 유지). 목록은 `divide-y divide-rule` 구분선 줄(종류 이모지 유지), 빈 문구 "아직 넣은 장소가 없어요" 는 `emptyStateClass` 판 안에.
- 칸 제목 "지도"·"가 볼 곳"(그리고 Task 4 의 "일정")은 `sectionTitleClass`(18px 700).

- [ ] **Step 5: 확인 후 커밋**

lint·typecheck. dev 서버(`run` 스킬, 테스트 계정은 `docs/status.md` '로그인한 화면의 브라우저 확인')로 날짜 줄을 누르면 지도·예산 카드가 바뀌고, 내리면 제목 줄이 붙고 그때 아래 내용이 튀지 않는지(바 아래 첫 요소의 `getBoundingClientRect().top` 을 붙기 직전·직후로 잰다) 본다.

```bash
git add src/app/trips
git commit -m "고른 날 저장소와 위에 붙는 날짜 줄, 여행 머리 정리 (#53)"
```

---

### Task 3: 함께하는 사람 접기

**Files:**
- Modify: `src/app/trips/[id]/members-section.tsx`
- Modify: `src/app/trips/[id]/invite-link-panel.tsx`(테두리 판 → 구분선만 필요하면)

**Interfaces:**
- Consumes: 기존 `listTripPeople`, `InviteLinkPanel`, `RemoveMemberButton`, `LeaveTripButton` 그대로.

- [ ] **Step 1: `<details>` 로 접는다**

서버 컴포넌트 그대로(클라이언트 JS 없이 접기). `h2 id="members-heading"` 는 `sr-only` 로 남긴다. `<details className="group">`:
- `summary`(`flex min-h-10 cursor-pointer list-none items-center gap-3`, 기본 삼각형 숨김 `[&::-webkit-details-marker]:hidden`): 앞 5명 사진 겹침(`-space-x-2`, 사진에 `ring-2 ring-background`), 이름들 `", "` 로 이어 한 줄 `min-w-0 flex-1 truncate text-sm`, 끝에 `▾`(`group-open:rotate-180`, `aria-hidden`). 혼자인 여행의 주인이면 이름 뒤에 ` · 함께할 사람 초대`(`text-sub`).
- 펼친 내용: 지금의 사람 목록·내보내기·나가기·초대 링크 칸 그대로, 바깥 테두리 판(`border border-rule p-4`)은 없앤다.

- [ ] **Step 2: 확인 후 커밋**

브라우저: 접힌 한 줄이 360px 에서 넘치지 않고, 펼쳐서 [링크 만들기] 를 눌러도(서버가 다시 그림) 펼친 상태가 유지되는지.

```bash
git add src/app/trips/[id]/members-section.tsx src/app/trips/[id]/invite-link-panel.tsx
git commit -m "함께하는 사람을 한 줄로 접기 (#53)"
```

---

### Task 4: 노선 일정

**Files:**
- Modify: `src/app/trips/[id]/schedule-section.tsx`
- Modify: `src/app/trips/[id]/schedule-day-items.tsx`
- Modify: `src/app/trips/[id]/schedule-editor.tsx`
- Modify: `src/app/trips/[id]/schedule-item-form.tsx`(`DateOption` 에 `dayNumber`)

**Interfaces:**
- Consumes: `lineVar`, `lineClass`(Task 1), `ShownWhen`, `useSelectedDay`(Task 2).
- Produces:
  - `DateOption = { value: string; label: string; dayNumber: number | null }`
  - `ScheduleItemRow` 새 props `railTop: boolean; railBottom: boolean`
  - `OpenState` 에 `moved: { fromDate: string; text: string } | null`, `setMoved`

- [ ] **Step 1: 날 묶음 (`schedule-section.tsx`)**

- "오늘 일정으로 ↓" 링크를 지운다.
- 날마다 `<ShownWhen value={day.date}>` 로 감싼다. 날 `section` 에 `style={{ "--line": lineVar(day.dayNumber) } as React.CSSProperties}`, `scroll-mt-4` → `scroll-mt-28`(붙은 날짜 줄 높이).
- 날 머리 `h3`: 동그라미(`size-7 rounded-full text-sm font-bold text-on-line ${lineClass(n, "bg")}`, `aria-hidden`) + `<span className="sr-only">{n}일차 </span>` + `dateLabel(day.date, false)` + 오늘이면 지금의 "오늘" 표시.
- `dayOptions` 에 `dayNumber`, 기간 밖 날짜 선택지는 `dayNumber: null`.
- 기간 밖 묶음: `<ShownWhen value="all">`, `cardClass` 판 대신 판 없이 제목·설명, 묶음마다 `--line: lineVar(null)`(회색 노선).

- [ ] **Step 2: 일정 줄 (`schedule-editor.tsx` 의 `ScheduleItemRow`)**

보기 줄 `li`: `relative grid grid-cols-[3.25rem_2.5rem_minmax(0,1fr)_2.5rem] items-start gap-x-2 py-1`.
- 1열 시각: 있으면 `pt-2 text-[15px] font-bold tabular-nums`, 없으면 `pt-2.5 text-xs text-sub` "시각 없음".
- 2열 레일·역: 칸 `relative flex justify-center self-stretch`. 레일 토막 `absolute left-1/2 w-1.5 -translate-x-1/2 bg-(--line)`: `railTop` 이면 `top-0 h-6`, `railBottom` 이면 `top-6 bottom-0`(역 중심 = `py-1` + 40px 칸의 절반 = 24px). 역 = 지금의 완료 체크칸을 `<label className="relative z-10 flex size-10 cursor-pointer items-center justify-center">` 안에 두고 input 에 `appearance-none size-5 rounded-full border-[3px] border-(--line) bg-background checked:bg-(--line)`. `checked`·`onChange`·`aria-label` 은 그대로.
- 3열: 제목 버튼·장소 링크·메모·실제 지출 칸·오류 그대로. 완료면 이 칸 글자를 `text-sub` 로(지금의 `opacity-50`·`line-through` 를 뺀다). 긴 글자가 넘치지 않게 `min-w-0 break-words` 유지.
- 4열: 손잡이 ⠿ (지금 버튼·`touch-none`·`aria-label` 그대로, 높이 `h-10`), 끌 수 없으면 빈 칸.
- 끄는 중(`isDragging`): `z-10 rounded-[10px] bg-surface shadow-lg` 그대로.
- 고치기로 열린 줄(`editing`)은 지금처럼 양식만(그리드 없음). 양식 판은 `cardClass`(`surface`) 그대로.

- [ ] **Step 3: 일정 추가 줄 (`AddScheduleItem`)**

닫힌 상태 버튼을 같은 4열 그리드 한 줄로: 2열에 점선 동그라미(`size-5 rounded-full border-2 border-dashed border-field-line`), 3열에 기존 글자 "+ 일정 추가"(`text-sm text-sub`), 줄 전체가 버튼(`min-h-10`, hover `bg-surface rounded-[10px]`). 연 뒤 양식은 그대로.

- [ ] **Step 4: 날 목록 (`schedule-day-items.tsx`)**

- 각 줄에 `railTop = index > 0 || placed.before.has(첫 줄 id)`, `railBottom = index < ordered.length - 1 || placed.after !== null` 을 넘긴다.
- `TravelLine` 도 같은 4열 그리드: 2열 레일 전체 높이(`top-0 bottom-0`, 역 없음), 3열 `text-sm`: `{caption && \`${caption} · \`}<span className="font-medium">{text}</span>` + 실패면 [다시] + ` · ` + "길찾기 ↗" 링크(`text-sub hover:underline`). "↓" 는 뺀다(레일이 방향을 보인다). `concealed` 동작 그대로.
- 빈 날 "아직 일정이 없어요" 는 그대로(레일 없음).

- [ ] **Step 5: "N일차로 옮겼어요"**

`ScheduleEditorProvider` 에 `moved` 상태를 둔다. `ScheduleItemRow.saveAndClose` 에서 저장이 성공했고(`next.savedAt !== prev.savedAt`) `formData.get("date")` 가 `item.date` 와 다르며 `useSelectedDay().selected !== "all"` 이면, 그 날짜의 `dateOptions` 항목 `dayNumber` 로 `setMoved({ fromDate: item.date, text: \`${dayNumber}일차로 옮겼어요\` })`(`dayNumber` 가 null 이면 두지 않음). `ScheduleDayItems` 는 `moved?.fromDate === date` 일 때 목록 아래에 `<p role="status" className="text-sm text-sub">` 로 보이고 4초 뒤 지운다(지금 `NOTICE_VISIBLE_MS` 와 같은 방식).

- [ ] **Step 6: 확인 후 커밋**

브라우저(휴대폰·데스크톱, 밝게·어둡게): [전체]/N일차 전환 시 일정 날이 함께 바뀜, 손잡이 끌기(마우스·터치 CDP·키보드 Space/방향키), 역 동그라미로 완료 켜기 → 실제 지출 칸 열림, 끄기 확인 창, 줄 눌러 고치기, N일차에서 날짜 옮기기 → "N일차로 옮겼어요", 이동 줄 위치, 360px 긴 제목. `docs/status.md` 'Playwright 로 끌기' 절차.

```bash
git add src/app/trips/[id]
git commit -m "일정을 노선으로: 레일·역 동그라미 완료·오른쪽 손잡이, 고른 날만 보이기 (#53)"
```

---

### Task 5: 지도 선·핀 날짜 색, 구간 목록

**Files:**
- Create: `src/app/trips/[id]/use-color-scheme.ts`
- Modify: `src/app/trips/[id]/trip-map-canvas.tsx`, `src/app/trips/[id]/trip-map-panel.tsx`, `src/app/trips/[id]/day-legs.tsx`

**Interfaces:**
- Consumes: `lineHex`, `lineClass`(Task 1).
- Produces:
  - `useColorScheme(): "light" | "dark"` — `useSyncExternalStore` + `matchMedia("(prefers-color-scheme: dark)")`, 서버 값 `"light"`. 지도는 `ColorScheme.FOLLOW_SYSTEM` 이라 같은 기준.
  - `MapPin` 에 `dayNumber: number | null`, `MapLine` 에 `dayNumber: number | null`.

- [ ] **Step 1: 지도 그림 (`trip-map-canvas.tsx`)**

`LINE_COLOR` 를 지우고 `route`·`straight` 선 색 = `lineHex(line.dayNumber ?? 1, scheme)`(점선 아이콘은 색별로 만든다). `faint` 선은 `sub` 색(밝게 `#6a707b`, 어둡게 `#9aa1ad`, 이 파일 상수). 번호 핀 `bg-blue-600 text-white` → `${lineClass(pin.dayNumber ?? 1, "bg")} text-on-line`. 종류 핀 `bg-white` → `bg-background`. 강조 `ring-amber-400` → `ring-foreground`, 보통 `ring-white` → `ring-background`.

- [ ] **Step 2: 보기 (`trip-map-panel.tsx`)**

`dayView` 의 번호 핀·선에 `day.dayNumber`, 기준점 핀과 `overviewView` 의 핀·선은 `null`([전체] 핀은 종류 그림 그대로, 날짜 색 없음). N일차 핀을 눌러도 지금처럼 그 핀만 강조(가 볼 곳이 감춰져 있어 목록 강조는 없음).

- [ ] **Step 3: 구간 목록 (`day-legs.tsx`)**

일정 이동 줄과 같은 글자 모양: 이동 글자 `font-medium text-foreground`, "직선 …"·"Google 지도 ↗" 는 `text-sub`. 줄 앞에 그날 색 작은 막대(`h-4 w-1.5 rounded-full ${lineClass(dayNumber, "bg")}`, `aria-hidden`) — `DayLegs` 에 `dayNumber: number` prop.

- [ ] **Step 4: 확인 후 커밋**

브라우저: 1·2·9일차 선·핀 색이 날짜 동그라미 색과 같다, 다크 모드에서 선이 보인다, 핀 강조가 보인다. (지도 확인은 `docs/status.md` 'Playwright 와 Google 지도'.)

```bash
git add src/app/trips/[id]
git commit -m "지도 선·핀을 날짜 색으로 (#53)"
```

---

### Task 6: 예산 카드 머리, 휴대폰 아래 예산 줄과 [+ 지출] 시트

**Files:**
- Create: `src/app/trips/[id]/budget-meter.tsx`
- Create: `src/app/trips/[id]/budget-dock-section.tsx`
- Create: `src/app/trips/[id]/budget-dock.tsx`
- Modify: `src/app/trips/[id]/budget-card.tsx`, `src/app/trips/[id]/budget-forms.tsx`, `src/app/trips/[id]/page.tsx`

**Interfaces:**
- Consumes: `budgetMeter`(Task 1), `useSelectedDay`(Task 2), `loadBudget`·`toPanelBudget`(`budget-data.ts`, 쿼리가 `cache` 라 지도 칸과 같은 결과), `ExtraItemForm`.
- Produces:
  - `BudgetBar({ projected, total, thin }: { projected: number; total: number; thin?: boolean })` — 잉크 채움 `bg-foreground`, 넘으면 전체 `bg-danger`, 바탕 `bg-rule`, `role="img"` + `aria-label` "예산의 N%"(넘으면 "예산 초과").
  - `BalanceText`(budget-card 에서 옮김, 문구·색 그대로).
  - `tripDateChoices(days: { date: string; label: string }[]): DateChoice[]` (budget-forms, `[{ value: "", label: "여행 전체" }, ...]` — 카드와 시트가 같이 쓴다).
  - `BudgetDockSection({ userId, trip, today })` 서버, `BudgetDock({ tripId, budget, days, today })` 클라이언트(`today` 는 여행 중일 때만 날짜, 아니면 `null`).

- [ ] **Step 1: 카드 머리 (`budget-card.tsx`, `budget-meter.tsx`)**

예산이 있으면 두 탭 공통 머리: `{money(projected)} / {money(total)}`(`text-xl font-bold tabular-nums`), 그 아래 `BudgetBar`, 그 옆에 `BalanceText balance={summary.balance}`. N일차는 지금의 "N일차 예산" 제목이 머리 위. 머리 아래 지금 줄들(`Summary`·`PeriodLine`·`DayTable`·항목 목록·설정)은 **하나도 빼지 않는다**. `DayTable` 날짜 이름 앞에 `size-2 rounded-full ${lineClass(n, "bg")}` 점. 예산 없음 판은 `emptyStateClass` 모양. 예상 0원뿐인 날의 "—" 는 그대로 둔다(빌더 판단, 범위 밖).

- [ ] **Step 2: 양식 판 (`budget-forms.tsx`)**

`formClass` 의 `border border-field-line bg-background` → 카드(`surface`) 안에서 구별되도록 `bg-background` 만(테두리 없음). `tripDateChoices` 를 더하고 카드의 `dateChoices` 를 이것으로.

- [ ] **Step 3: 아래 예산 줄 (`budget-dock-section.tsx`, `budget-dock.tsx`, `page.tsx`)**

- `page.tsx`: 저장소 안 `ScheduleSection` 뒤(article 마지막)에 `<Suspense fallback={null}><BudgetDockSection … /></Suspense>`. 예산이 없으면 `null`.
- `BudgetDock`: `sticky bottom-0 z-20 sm:hidden`, `bg-background border-t border-rule`, 좌우 음수 여백(날짜 줄과 같음), 아래 안전 영역 `pb-[max(0.75rem,env(safe-area-inset-bottom))]`. article 마지막에 있어 끝까지 내리면 제자리로 돌아와 아무것도 가리지 않는다.
  - N일차: "N일차 예상 {money(periods.byDate[date]?.estimate ?? 0)}" + "전체 {projected} / {total}" + `BudgetBar thin`.
  - [전체]: "예상 {projected} / {total}" + `BalanceText` + `BudgetBar thin`.
  - 숫자 부분은 버튼이 아니다. 오른쪽 [+ 지출] `buttonClass("primary", "small")`.
- 시트: `<dialog>` 를 `showModal()` 로 연다(초점 가둠·Esc·닫으면 [+ 지출] 로 초점 복귀는 브라우저 기본). 아래에 붙는 판(`m-0 mt-auto w-full max-w-none rounded-t-[14px] bg-background p-4`, `backdrop:bg-foreground/30`). 열 때마다 새 `key` 로 `ExtraItemForm`(item `null`, `defaultDate` = N일차면 그 날짜, [전체] 면 `today ?? ""`, `dates = tripDateChoices(days)`, `onClose` = `dialog.close()`). 저장 성공 시 `closingOnSave` 가 닫는다. 바깥(=`event.target === dialog`) 누르면 닫는다. `onClose`/`cancel` 이벤트에서 열림 상태를 내린다.

- [ ] **Step 4: 확인 후 커밋**

브라우저(iPhone 13): 줄이 늘 떠 있고 끝까지 내려도 마지막 일정 추가 줄을 가리지 않음, 데스크톱 너비에서 줄 없음, 예산 없는 여행에 줄 없음, 초과 여행에 빨간 막대, [+ 지출] → 빈 금액 저장(오류 문구, 시트 유지) → 바른 값 저장(닫힘, 카드·줄 숫자 바뀜), Esc·바깥·[취소] 뒤 초점 위치.

```bash
git add src/app/trips/[id]
git commit -m "예산 카드 머리와 휴대폰 아래 예산 줄·[+ 지출] 시트 (#53)"
```

---

### Task 7: 전체 확인과 PR

**Files:** 없음(고칠 것이 나오면 해당 Task 파일).

- [ ] **Step 1: 검사**

`npm run lint`(종료 코드 0), `npm run typecheck`, `node --test 'src/**/*.test.mjs'`, `npm run build`(로컬 확인용, 가짜 키면 CI 와 같게).

- [ ] **Step 2: 브라우저 회귀(설계 §6)**

iPhone 13·데스크톱, 밝게·어둡게(`emulateMedia colorScheme`) 사진을 scratchpad 에. Review Focus 1–5 를 하나씩. 360px 에서 `document.documentElement.scrollWidth <= 360`. 초대·참여 화면이 그대로인지 한 번. 테스트 계정·행은 끝나면 지운다(SQL 전문을 보이고 확인).

- [ ] **Step 3: 리뷰와 PR**

`/code-review`, 막는 지적 처리. 브랜치 push, draft PR(`Closes #53`, 사진, "남은 지적"), CLAUDE.md '작업 흐름'대로 draft 해제 → Codex → 자동 머지. 위험 경로를 건드리지 않았는지 `git diff --name-only origin/main` 로 확인.
