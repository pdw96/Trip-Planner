# 디자인 정리 PR 1 (바탕) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노선도 디자인의 바탕(색·글꼴 토큰, 공용 버튼·입력칸·카드·오류 조각)을 깔고, 홈·여행 목록·여행 만들기/고치기·초대·오류 화면을 새 모양으로 바꾼다. 여행 화면은 공용 조각만 바뀐다(배치·노선·예산 카드는 PR 2).

**Architecture:** 색은 `globals.css` 의 CSS 변수 + Tailwind 4 `@theme inline` 토큰으로 두고 다크 모드는 변수만 바꾼다(컴포넌트의 `dark:` 클래스를 없앤다). 공용 클래스 문자열은 `src/app/ui/styles.ts` 하나. 날짜 색·남은 날 같은 계산은 `src/lib/` 순수 함수 + `node --test`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, `next/font/google`(IBM Plex Sans KR), Biome, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-design-refresh-design.md` (§4 PR 1 범위, §5.1–5.3, §5.4 홈·목록·만들기/고치기·초대, §5.6, §5.7)

## Global Constraints

- 새 패키지 없음. 위험 경로(`package.json`, `next.config.ts`, `.github/**`, `src/lib/auth*.ts`, `src/db/**` 등 CLAUDE.md 목록) 건드리지 않음.
- 데이터·동작 변경 없음. 기존 문구는 바꾸지 않는다. 새 문구만: "N일 남음", "여행 중", "○○님의 여행"(기존).
- 컴포넌트에 `dark:` 클래스를 새로 쓰지 않는다. 색은 토큰 유틸리티(`bg-surface`, `text-sub`, `border-rule`, `text-danger` …)로만.
- 입력칸 기본 클래스에는 폭이 없다. 폭은 쓰는 쪽이 붙인다. `inputClass`(w-full 합친 상수)는 없앤다.
- 노선 색(`line-1…8`)은 날짜 표시에만. 버튼·링크·초점 링·입력칸에는 쓰지 않는다.
- 커밋 전 `npm run lint`(출력은 파일로, 종료 코드 따로 확인), `npm run typecheck`, `node --test 'src/**/*.test.mjs'`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 와 `Claude-Session: https://claude.ai/code/session_01RrBS7m2oe6369b5ZHZd32h`.

## Review Focus

1. 다크 모드에서 입력칸·고르기·날짜 칸이 바탕과 구별되고 글자가 읽힌다(#44 재발 금지) — Task 6 브라우저 확인에 다크 화면 사진.
2. 폭을 따로 정하던 칸(예산 금액·통화 고르기, 실제 지출 금액 `w-32`, 지도 패널 고르기)이 0 폭이나 카드 밖 넘침 없이 그대로 — Task 3 에서 `inputBaseClass` 사용처를 하나씩 옮기고 Task 6 에서 예산 설정 양식 사진.
3. 날이 많은 여행(30일)의 목록 노선이 360px 너비에서 가로 스크롤을 만들지 않는다 — Task 2 `miniLineDots` 시험 + Task 6.
4. 긴 여행 제목·목적지(공백 없는 40자)가 목록·여행 화면에서 넘치지 않고 줄바꿈 — Task 6.
5. 여행 화면(아직 옛 배치)이 PR 1 만으로 깨지지 않는다: 버튼·입력칸·오류 문구가 새 모양이고 끌기·완료·고치기 동작이 그대로 — Task 6.

---

### Task 1: 색·글꼴 토큰

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: Tailwind 유틸리티 `bg-background` `text-foreground`(기존 유지), `bg-surface`, `text-sub`, `border-rule`, `bg-field`, `border-field-line`, `text-danger` `border-danger`, `text-ok`, `text-on-ink`, `text-warn` `bg-warn-surface`, `bg-line-1`…`bg-line-8`(그리고 `text-`/`border-` 짝), 글꼴 `font-sans`.

- [ ] **Step 1: `globals.css` 에 토큰을 쓴다**

`:root` 에 밝은 값, `@media (prefers-color-scheme: dark) { :root { … } }` 에 어두운 값(설계 §5.1 표 그대로), `@theme inline` 에서 `--color-<이름>: var(--<이름>)` 으로 잇는다. 기존 `--background`·`--foreground`·`color-scheme: light dark` 유지. 설계 표에 더해 경고 색 두 개(지금 `amber-*` 자리):

| 토큰 | 밝게 | 어둡게 |
|---|---|---|
| `warn` | `#8a5a00` | `#f0c060` |
| `warn-surface` | `rgb(232 160 32 / 0.14)` | `rgb(240 192 96 / 0.14)` |

`--font-sans: var(--font-plex-kr), "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;` 로 두고 `--font-mono` 줄은 지운다. `body` 의 `font-family: Arial, Helvetica, sans-serif;` 을 지운다. 초점 링 공통 규칙 하나: `:focus-visible { outline: 2px solid var(--foreground); outline-offset: 2px; }`.

- [ ] **Step 2: `layout.tsx` 에서 글꼴을 바꾼다**

`Geist`·`Geist_Mono` 를 지우고 `IBM_Plex_Sans_KR({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-plex-kr", display: "swap" })`. `<html className>` 에 그 `.variable` 과 `font-sans`.

- [ ] **Step 3: 빌드로 글꼴을 받는지 확인**

Run: `npm run build > /tmp/claude-0/build.log 2>&1; echo $?`
Expected: `0`. 실패하면 로그에서 `fonts.googleapis.com` 접속 오류인지 본다(클라우드 세션이면 허용 호스트 문제 — `read_documentation` 의 environment.network 를 읽고 사용자에게 알림. CI 는 Geist 를 받아 왔으므로 된다).

- [ ] **Step 4: lint·typecheck 후 커밋**

```bash
npm run lint > /tmp/claude-0/lint.log 2>&1; echo $?
npm run typecheck
git add src/app/globals.css src/app/layout.tsx
git commit -m "디자인 토큰과 IBM Plex Sans KR (#53)"
```

---

### Task 2: 날짜 색·남은 날 순수 함수

**Files:**
- Create: `src/lib/day-line.ts`
- Create: `src/lib/day-line.test.mjs`
- Modify: `src/lib/trip-dates.ts`
- Modify: `src/lib/trip-dates.test.mjs`

**Interfaces:**
- Produces:
  - `LINE_COUNT = 8`
  - `lineIndex(dayNumber: number): number` → 1…8
  - `lineClass(dayNumber: number, kind: "bg" | "text" | "border"): string` → 예 `"bg-line-3"` (Tailwind 가 찾도록 24개 문자열을 표로 적어 둔다; 동적 문자열 조립 금지)
  - `miniLineDots(dayCount: number, max: number): { shown: number[]; hidden: number }` → 보일 일차 번호 목록과 숨긴 개수
  - `tripCountdown(startDate: string, endDate: string, today: string): string | null` (in `trip-dates.ts`) → `"N일 남음"` | `"내일 출발"` | `"여행 중"` | `null`(지난 여행)

- [ ] **Step 1: 실패하는 시험을 쓴다**

```js
// src/lib/day-line.test.mjs
test("lineIndex cycles every 8 days", () => {
  assert.deepEqual([1, 8, 9, 16, 17].map(lineIndex), [1, 8, 1, 8, 1]);
});
test("lineClass returns literal class names", () => {
  assert.equal(lineClass(3, "bg"), "bg-line-3");
  assert.equal(lineClass(11, "border"), "border-line-3");
  assert.equal(lineClass(8, "text"), "text-line-8");
});
test("miniLineDots keeps all days up to max", () => {
  assert.deepEqual(miniLineDots(3, 14), { shown: [1, 2, 3], hidden: 0 });
  assert.deepEqual(miniLineDots(14, 14), { shown: [1,2,3,4,5,6,7,8,9,10,11,12,13,14], hidden: 0 });
});
test("miniLineDots trims long trips", () => {
  const r = miniLineDots(30, 14);
  assert.equal(r.shown.length, 13);
  assert.equal(r.hidden, 17);
  assert.deepEqual(r.shown.slice(0, 2), [1, 2]);
});
```

```js
// src/lib/trip-dates.test.mjs 에 더함
test("tripCountdown", () => {
  assert.equal(tripCountdown("2026-12-05", "2026-12-07", "2026-11-20"), "15일 남음");
  assert.equal(tripCountdown("2026-12-05", "2026-12-07", "2026-12-04"), "내일 출발");
  assert.equal(tripCountdown("2026-12-05", "2026-12-07", "2026-12-05"), "여행 중");
  assert.equal(tripCountdown("2026-12-05", "2026-12-07", "2026-12-07"), "여행 중");
  assert.equal(tripCountdown("2026-12-05", "2026-12-07", "2026-12-08"), null);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test src/lib/day-line.test.mjs src/lib/trip-dates.test.mjs` / Expected: FAIL(없는 내보내기).

- [ ] **Step 3: 구현** — `day-line.ts` 는 다른 모듈을 import 하지 않는다(파일 맨 위에 한 줄 설명). `miniLineDots(n, max)`: `n <= max` 면 전부, 아니면 앞 `max - 1` 개 + `hidden = n - (max - 1)`. `tripCountdown` 의 날 수는 `trip-dates.ts` 의 기존 `parts` 로 UTC 날짜 차이를 센다(시간대 끼어들지 않게).

- [ ] **Step 4: 통과 확인** — Run: `node --test 'src/**/*.test.mjs'` / Expected: 모두 PASS.

- [ ] **Step 5: 커밋** — `git add src/lib/day-line.* src/lib/trip-dates.*` → `"날짜 노선 색과 남은 날 계산 (#53)"`.

---

### Task 3: 공용 조각과 모든 사용처 옮기기

**Files:**
- Create: `src/app/ui/styles.ts`
- Delete: `src/app/trips/styles.ts`
- Modify (import·클래스 바꾸기): `src/app/auth-buttons.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/in-app-browser-notice.tsx`, `src/app/invite/[token]/page.tsx`, `src/app/invite/[token]/join-button.tsx`, `src/app/trips/delete-trip-button.tsx`, `src/app/trips/date-range-picker.tsx`, `src/app/trips/trip-form.tsx`, `src/app/trips/page.tsx`, `src/app/trips/new/page.tsx`, `src/app/trips/[id]/edit/page.tsx`, `src/app/trips/[id]/page.tsx`, 그리고 `src/app/trips/[id]/` 의 `budget-card.tsx` `budget-forms.tsx` `invite-link-panel.tsx` `member-buttons.tsx` `members-section.tsx` `money-fields.tsx` `place-add-form.tsx` `place-fields.tsx` `place-row.tsx` `schedule-editor.tsx` `schedule-item-form.tsx` `schedule-day-items.tsx` `schedule-section.tsx` `trip-map-panel.tsx` `day-legs.tsx` `google-place-search.tsx`

**Interfaces:**
- Produces (`src/app/ui/styles.ts`):
  - `primaryButtonClass`, `secondaryButtonClass`, `dangerButtonClass`, `quietButtonClass` — 높이 40px(`h-10`), `rounded-[10px]`, `px-4`, `font-semibold text-sm`, `disabled:opacity-50`, 터치 영역 40px. primary = `bg-foreground text-on-ink`, secondary = `border border-field-line`, danger = `border border-danger/45 text-danger`, quiet = 테두리 없음 `text-sub hover:text-foreground`.
  - `smallButton(cls: string): string` — 같은 버튼을 높이 32px(`h-8 px-3 text-[13px]`)로. (Tailwind 충돌을 피하려고 기본 상수 안의 `h-10 px-4 text-sm` 을 바꿔 끼운 문자열을 돌려준다 — 덧붙이지 않는다.)
  - `fieldClass` — 폭 없음: `h-[42px] rounded-[10px] border border-field-line bg-field px-3 text-[15px] aria-[invalid=true]:border-danger`. 여러 줄 칸(`textarea`)은 `fieldAreaClass`(높이 대신 `py-2.5`).
  - `cardClass` — `rounded-[14px] bg-surface p-4`
  - `errorTextClass` — `text-[13px] text-danger`
  - `emptyStateClass` — `flex flex-col items-start gap-2.5 rounded-[14px] border border-dashed border-field-line p-4`
  - `sectionTitleClass` — `text-lg font-bold`; `subTitleClass` — `text-[13px] font-semibold text-sub`

- [ ] **Step 1: `src/app/ui/styles.ts` 를 만든다** (맨 위에 #52 폭 규칙 설명 한 줄). `src/app/trips/styles.ts` 를 지운다.

- [ ] **Step 2: 사용처를 옮긴다** — 위 파일들에서 import 를 `@/app/ui/styles` 로 바꾸고 클래스를 이렇게 바꾼다:
  - `inputClass` → `` `w-full ${fieldClass}` ``, `inputBaseClass` → `fieldClass` + 그 자리에 있던 폭 클래스 그대로(`w-32`, `w-auto` …). `py-1.5` 로 낮춘 작은 칸은 `h-8`.
  - `trip-map-panel.tsx` 의 `selectClass` → `` `${fieldClass} h-8 w-auto max-w-full text-sm` ``
  - `text-red-600`(32곳) → `errorTextClass` 또는 `text-danger`; `border-red-600` → `border-danger`
  - `text-zinc-400/500/600` → `text-sub`, `hover:text-zinc-700 dark:hover:text-zinc-300` → `hover:text-foreground`
  - `border-black/[.08] dark:border-white/[.145]`, `border-black/[.15] dark:border-white/[.2]` → `border-rule` (입력칸이면 `border-field-line`)
  - `bg-black/[.04] dark:bg-white/[.06]` → `bg-surface`; `hover:bg-black/[.04] dark:hover:bg-…` → `hover:bg-surface`
  - `divide-black/[.06] dark:divide-white/[.08]` → `divide-rule`
  - `text-emerald-700 dark:text-emerald-500` → `text-ok`; `amber` 경고 글자·바탕 → `text-warn` / `bg-warn-surface`; `bg-amber-400/15`(장소 강조) → `bg-warn-surface`
  - `rounded-full` 알약 버튼(`linkButtonClass`, `AddScheduleItem`, 실제 지출 저장·나중에 버튼 등) → `quietButtonClass`/`smallButton(...)` 로
  - `accent-foreground` 체크칸, `trip-map-canvas.tsx` 의 `bg-blue-600`·`LINE_COLOR` 은 **그대로**(PR 2).
  - 남는 `dark:` 클래스가 없게 한다: Run `grep -rn "dark:" src/app` → `trip-map-canvas.tsx` 외 0줄.

- [ ] **Step 3: 확인** — Run: `npm run typecheck && npm run lint > /tmp/claude-0/lint.log 2>&1; echo $?` / Expected: 오류 없음, `0`. Run: `grep -rn "zinc-\|red-600\|emerald-\|amber-\|black/\[\|white/\[" src/app` / Expected: `trip-map-canvas.tsx` 의 핀 강조(`ring-amber-400`) 한 줄만.

- [ ] **Step 4: 커밋** — `"공용 버튼·입력칸·카드·오류 조각으로 정리 (#53)"`.

---

### Task 4: 여행 목록

**Files:**
- Modify: `src/app/trips/page.tsx`
- Create: `src/app/ui/mini-line.tsx`

**Interfaces:**
- Consumes: `lineClass`, `miniLineDots` (Task 2), `tripCountdown` (Task 2), 공용 클래스(Task 3), `tripDays` 대신 날 수는 `startDate`·`endDate` 로 센다(`tripDays(start, end).length`, `src/lib/schedule.ts`).
- Produces: `MiniLine({ dayCount, dim }: { dayCount: number; dim?: boolean })` — Server Component, `aria-hidden`.

- [ ] **Step 1: `MiniLine` 을 만든다** — 가로 선(`h-1 bg-rule rounded`) 위에 동그라미(12px, 3px 테두리 = `lineClass(n, "border")`, 바탕 `bg-background`), 간격 10px. `miniLineDots(dayCount, 14)` 의 `hidden > 0` 이면 끝에 `+N` 작은 글자(`text-sub text-xs`). `dim` 이면 `opacity-55`.

- [ ] **Step 2: 목록 줄을 바꾼다** — 카드 대신 구분선 줄(`border-t border-rule`, 마지막 `border-b`, `py-3.5`): 제목 `text-[17px] font-bold break-words`(공유받은 여행이면 제목 옆 `○○님의 여행` 작은 테두리 표시 `rounded-md border border-rule px-1.5 text-xs text-sub`), 보조 줄 `text-[13.5px] text-sub` = `목적지, formatShortRange(...)` + (있으면) ` · ${tripCountdown(...)}`, 그 아래 `MiniLine`(지난 여행은 `dim`, 제목도 흐리게). 줄 전체가 링크, hover 는 `bg-surface`. 머리의 [+ 새 여행] 은 `primaryButtonClass`, 로그아웃은 `quietButtonClass`. 빈 상태는 `emptyStateClass`.

- [ ] **Step 3: 확인** — typecheck·lint(Task 3 Step 3 명령). 브라우저는 Task 6.

- [ ] **Step 4: 커밋** — `"여행 목록을 노선 줄로 (#53)"`.

---

### Task 5: 홈·만들기/고치기·달력·초대·오류 화면

**Files:**
- Modify: `src/app/page.tsx`, `src/app/auth-buttons.tsx`, `src/app/in-app-browser-notice.tsx`, `src/app/trips/trip-form.tsx`, `src/app/trips/date-range-picker.tsx`, `src/app/trips/new/page.tsx`, `src/app/trips/[id]/edit/page.tsx`, `src/app/invite/[token]/page.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`
- Modify: `src/app/ui/mini-line.tsx` (홈 장식에 재사용할 수 있으면)

**Interfaces:**
- Consumes: Task 3 공용 클래스, Task 4 `MiniLine`.

- [ ] **Step 1: 홈** — 왼쪽 정렬이 아닌 지금처럼 가운데 한 단 유지. 앱 이름(`text-3xl font-bold`), 소개 한 줄(기존 문구), 그 위에 `MiniLine dayCount={3}` 장식(크게: 동그라미 18px — `MiniLine` 에 `size?: "sm" | "lg"` prop 을 더함). Google 로그인 버튼은 `secondaryButtonClass` 높이 48px 유지(`h-12`).
- [ ] **Step 2: 여행 만들기/고치기 양식** — 라벨 `text-[13px] font-semibold`, 칸 `w-full fieldClass`, 칸 사이 `gap-3.5`, 버튼 줄 [저장] primary + [취소] secondary. 양식 판은 카드 없이 바탕 그대로(페이지 자체가 양식).
- [ ] **Step 3: 달력** — 범위 시작·끝 칸 `bg-foreground text-on-ink`, 사이 칸 `bg-surface`, 오늘 테두리 `border-field-line`, 일요일·공휴일 글자 `text-danger`(고른 칸 안에서는 `text-on-ink`). 열기 단추는 `w-full fieldClass text-left`.
- [ ] **Step 4: 초대·오류·없음·앱 안 브라우저 안내** — 공용 클래스로 색만 맞춘다(안내 판은 `bg-warn-surface text-warn`).
- [ ] **Step 5: 확인·커밋** — typecheck·lint → `"홈·양식·달력·초대 화면을 새 디자인으로 (#53)"`.

---

### Task 6: 브라우저 확인과 PR

**Files:**
- Modify: `docs/status.md` (PR 머지·배포 확인 뒤에만, 이 PR 에서는 안 함)

- [ ] **Step 1: 시험 전부** — `node --test 'src/**/*.test.mjs'`, `npm run typecheck`, `npm run lint`(종료 코드 확인), `npm run build`.
- [ ] **Step 2: 테스트 계정** — `docs/status.md` '로그인한 화면의 브라우저 확인' 절차. 넣기 SQL 전문을 사용자에게 보이고 확인받는다. 테스트 데이터: 3일 여행(공유받은 여행 하나 포함, 다른 테스트 사용자를 주인으로), 30일 여행, 공백 없는 40자 제목 여행, 지난 여행 하나, 예산 있는 여행.
- [ ] **Step 3: 화면 사진** — `npm run dev` + Playwright, iPhone 13 과 1280px, 밝게·어둡게(`emulateMedia({ colorScheme })`): 홈(비로그인), 여행 목록, 새 여행 양식(오류 상태 포함), 달력 열림, 여행 화면(예산 설정 양식 열림 — 금액·통화 칸 폭), 일정 고치기 양식, 초대 화면. 360px 너비에서 `document.documentElement.scrollWidth <= 360`.
- [ ] **Step 4: 동작 회귀** — 여행 화면에서 일정 끌기(마우스), 완료 체크 → 실제 지출 칸, 일정 고치기 저장, 장소 고치기 칸이 PR 1 뒤에도 된다.
- [ ] **Step 5: 테스트 계정 지우기** — 지우기 SQL 전문을 보이고 확인받는다.
- [ ] **Step 6: `/code-review`** — 막는 지적 0 이 될 때까지(CLAUDE.md '리뷰 종료 기준').
- [ ] **Step 7: PR 본문 갱신·draft 해제·자동 머지** — `Refs #53`, 화면 사진, 남은 지적. 위험 경로 없음 확인(`human-gate` 통과).
