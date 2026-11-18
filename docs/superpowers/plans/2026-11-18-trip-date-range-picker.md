# 여행 날짜 범위 달력 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행 양식의 시작·끝 날짜 칸을 숙소 예약 앱 같은 범위 달력으로 바꾸고, 일요일·공휴일(공공데이터포털 API)을 빨갛게 표시한다 (#17).

**Architecture:** 날짜 계산·고르기 규칙·요약 문구는 import 없는 순수 모듈 `src/lib/calendar.ts`, 공휴일 응답 파싱은 `src/lib/holidays.ts`(둘 다 `node:test`). 공휴일 호출은 서버 전용 `src/lib/holidays-api.ts` 에서 `use cache` 로 연도별 하루 캐시. 페이지가 달력 범위·오늘·공휴일 Promise 를 `TripForm` → 클라이언트 `DateRangePicker`(네이티브 `<dialog>`)로 넘기고, 제출은 숨은 `startDate`·`endDate` 입력으로 기존 Server Action 을 그대로 쓴다.

**Tech Stack:** Next.js 16.4 (`cacheComponents`, `use cache`, `cacheLife`), React 19.3 (`use`), TypeScript, Tailwind 4, Node 22 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-trip-date-range-picker-design.md`

## Global Constraints

- #11 계획(`docs/superpowers/plans/2026-11-18-trips-crud.md`)의 Global Constraints 를 그대로 따른다 (순수 모듈은 import 없음, 단위 시험은 `node --test 'src/**/*.test.mjs'`, 한국어 문구, lint·typecheck).
- 새 의존성 없음. 위험 경로 중 `.env.example` 만 바꾼다 → PR 맨 위 "사람 확인 필요", `human-approved` 필요.
- 환경 변수 이름: `DATA_GO_KR_SERVICE_KEY`. 키 값은 로그·클라이언트·캐시 키에 넣지 않는다.
- 공휴일 API: `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`, 파라미터 `serviceKey`, `solYear`, `numOfRows=100`, `_type=json`. 연도별 요청 시간 초과 5초.
- 달력 범위: 오늘(한국 날짜)의 달 기준 12개월 전 ~ 24개월 뒤, 양식 날짜가 있으면 그 달까지 넓힌다.
- 서버 검증(`parseTripInput`)과 Server Action 은 바꾸지 않는다.
- 구현 전에 `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`, `04-functions/cacheLife.md` 를 읽는다.

## Review Focus

1. **공휴일 실패가 하루 동안 캐시되는 것.** 실패를 `use cache` 함수 안에서 빈 배열로 바꾸면 그 빈 결과가 하루 캐시된다. 캐시 함수는 실패 시 throw 하고, 바깥 `getHolidays` 가 잡아 빈 배열로 바꾼다. → Task 3 Step 1 구조, Task 5 Step 3 에서 키 없이 띄워 경고 로그와 정상 열림 확인.
2. **오래된 여행 고치기.** 기본 범위 밖(예: 2020-05-01) 날짜가 달력에 보이고 그 달로 스크롤된다. → Task 1 시험 `calendarRange extends to selected dates`.
3. **연·월 경계와 윤년.** 2026-12-31~2027-01-02 는 2박 3일, 2028년 2월은 29칸, 2027년 2월은 28칸. → Task 1 시험 `nights across year`, `monthCells`.
4. **취소 뒤 다시 열기.** ✕/Esc/바깥 클릭은 양식 값을 바꾸지 않고, 다시 열면 양식 값에서 시작한다. → Task 5 Step 3.
5. **잘못된 초기 값.** 형식이 틀린 `startDate`(서버가 돌려준 입력값 등)를 받아도 달력·요약이 깨지지 않고 빈 선택으로 시작한다. → Task 1 시험 `invalid initial dates are ignored`.

---

### Task 1: 달력 계산과 고르기 규칙

**Files:**
- Create: `src/lib/calendar.ts`
- Test: `src/lib/calendar.test.mjs`

**Interfaces:**
- Produces (`src/lib/calendar.ts`, 날짜는 모두 `"YYYY-MM-DD"`, 요일은 일=0…토=6):
  ```ts
  export type YearMonth = { year: number; month: number }; // month 1–12
  export type CalendarRange = { first: YearMonth; last: YearMonth };
  export type DayCell = { date: string; day: number; weekday: number } | null; // null = 앞쪽 빈칸
  export type Selection = { start: string | null; end: string | null };
  export function calendarRange(today: string, startDate: string, endDate: string): CalendarRange;
  export function monthsInRange(range: CalendarRange): YearMonth[];
  export function yearsInRange(range: CalendarRange): number[];
  export function monthCells(ym: YearMonth): DayCell[];
  export function monthTitle(ym: YearMonth): string; // "2027.01"
  export function initialSelection(startDate: string, endDate: string): Selection; // 형식이 틀리거나 끝<시작이면 {null,null}
  export function nextSelection(sel: Selection, date: string): Selection;
  export function stayLength(start: string, end: string): { nights: number; days: number };
  export function formatSelection(sel: Selection, today: string): string;
  export function weekdayName(date: string): string; // "일"…"토"
  ```

- [ ] **Step 1: 실패하는 시험 작성** (`node:test`, `import … from "./calendar.ts"`)
  - `calendarRange default`: `calendarRange("2026-11-18", "", "")` → `{ first: {year:2025, month:11}, last: {year:2028, month:11} }`
  - `calendarRange extends to selected dates`: `("2026-11-18", "2020-05-01", "2020-05-03")` → first `{2020,5}`; `("2026-11-18", "2030-01-01", "2030-02-01")` → last `{2030,2}`; 형식이 틀린 값(`"2020-5-1"`)은 무시
  - `monthsInRange` 길이: 기본 범위 → 37; 연 경계 순서 `…{2025,12},{2026,1}…`
  - `yearsInRange` 기본 → `[2025, 2026, 2027, 2028]`
  - `monthCells`: `{2026,12}` → 앞 빈칸 2개(12/1 화요일), 다음 칸 `{date:"2026-12-01", day:1, weekday:2}`, 날짜 칸 31개; `{2028,2}` 날짜 29개, `{2027,2}` 28개
  - `monthTitle({2027,1})` → `"2027.01"`
  - `invalid initial dates are ignored`: `initialSelection("2026-2-3","2026-12-01")` → `{start:null,end:null}`; `("2026-12-03","2026-12-01")` → `{null,null}`; `("2026-12-01","2026-12-03")` → 그대로
  - `nextSelection` 규칙: `{null,null}`+A → `{A,null}`; `{A,null}`+A → `{A,A}`; `{A,null}`+뒤 B → `{A,B}`; `{B,null}`+앞 A → `{A,null}`; `{A,B}`+C → `{C,null}`
  - `nights across year`: `stayLength("2026-12-31","2027-01-02")` → `{nights:2, days:3}`; 같은 날 → `{0,1}`
  - `formatSelection` (today `"2026-11-18"`): `{null,null}` → `""`; `{"2026-12-31",null}` → `"12.31(목)~"`; `{"2026-12-31","2027-01-02"}` → `"12.31(목)~2027.01.02(토) · 2박 3일"`; `{"2026-12-20","2026-12-23"}` → `"12.20(일)~12.23(수) · 3박 4일"`; `{"2027-01-05","2027-01-07"}` → `"2027.01.05(화)~01.07(목) · 2박 3일"`; `{"2026-12-20","2026-12-20"}` → `"12.20(일) · 당일치기"`
  - `weekdayName("2027-01-01")` → `"금"`

- [ ] **Step 2: 실패 확인** — `node --test 'src/lib/*.test.mjs'` → calendar 시험 FAIL (모듈 없음)

- [ ] **Step 3: 구현.** 날짜 계산은 `Date.UTC` 로 만든 날짜만 쓰고 지역 시간대 메서드를 쓰지 않는다. 연도 표시 규칙: 시작일은 연도 ≠ today 의 연도일 때, 끝일은 연도 ≠ 시작일 연도일 때 `YYYY.` 를 붙인다 (#11 의 `formatShortRange` 와 같은 규칙).

- [ ] **Step 4: 통과 확인** — `node --test 'src/lib/*.test.mjs'` PASS, lint·typecheck 통과

- [ ] **Step 5: 커밋** — `feat: 범위 달력 날짜 계산과 고르기 규칙 (#17)`

---

### Task 2: 공휴일 응답 파서

**Files:**
- Create: `src/lib/holidays.ts`
- Test: `src/lib/holidays.test.mjs`

**Interfaces:**
- Produces (`src/lib/holidays.ts`):
  ```ts
  export class HolidayResponseError extends Error {}
  export function parseHolidayResponse(text: string): string[]; // "YYYY-MM-DD" 오름차순, 중복 없음. 예상과 다르면 HolidayResponseError
  ```

- [ ] **Step 1: 실패하는 시험 작성.** 시험 데이터는 블로그로 확인한 형식으로 만들고, 파일 맨 위에 "블로그 기준 임시 데이터, Task 6 에서 실제 응답 추가" 주석을 단다.
  - `parses item array`: `{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE."},"body":{"items":{"item":[{"dateKind":"01","dateName":"1월1일","isHoliday":"Y","locdate":20270101,"seq":1},{"dateKind":"01","dateName":"설날","isHoliday":"Y","locdate":20270207,"seq":1}]},"numOfRows":100,"pageNo":1,"totalCount":2}}}` → `["2027-01-01","2027-02-07"]`
  - `parses single item object`: `item` 이 객체 하나 → 한 개 배열
  - `empty items`: `"items":""` → `[]`
  - `string locdate`: `"locdate":"20270101"` → `["2027-01-01"]`
  - `skips non-holidays`: `isHoliday:"N"` 항목 제외
  - `rejects error responses`: `resultCode:"30"` → throw `HolidayResponseError`; XML 문자열(`<OpenAPI_ServiceResponse>…`) → throw; `locdate:2027010` (7자리) → throw

- [ ] **Step 2: 실패 확인** — `node --test 'src/lib/*.test.mjs'` → holidays 시험 FAIL
- [ ] **Step 3: 구현** — `JSON.parse` 실패도 `HolidayResponseError` 로 바꾼다.
- [ ] **Step 4: 통과 확인** — PASS, lint·typecheck 통과
- [ ] **Step 5: 커밋** — `feat: 공휴일 API 응답 파서 (#17)`

---

### Task 3: 공휴일 서버 호출과 환경 변수

**Files:**
- Create: `src/lib/holidays-api.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `parseHolidayResponse` (Task 2)
- Produces (`import "server-only"`):
  ```ts
  export function getHolidays(years: number[]): Promise<string[]>; // 절대 reject 하지 않음. 실패한 해는 빠짐
  ```

- [ ] **Step 1: 구현.**
  - 파일 안 `async function holidaysForYear(year: number): Promise<string[]>` 에 `"use cache"` + `cacheLife("days")`. 키가 없거나 응답 실패·파싱 실패·5초 초과(`AbortSignal.timeout(5000)`)면 **throw** 한다(빈 배열을 캐시하지 않기 위해).
  - `getHolidays` 는 `Promise.allSettled` 로 연도별 호출, 실패한 해는 `console.warn("[holidays] <year>: <이유>")` 한 줄(상태 코드나 오류 종류만, 키·URL 없음) 후 건너뛴다.
  - 키가 없을 때는 호출하지 않고 바로 빈 배열(경고는 한 번만).
  - `URLSearchParams` 로 `serviceKey` 를 인코딩한다(Decoding 키 기준).
- [ ] **Step 2: `.env.example`** 에 추가:
  ```
  # 공휴일(한국천문연구원 특일 정보) — 공공데이터포털(data.go.kr) 일반 인증키(Decoding). 없으면 달력에 일요일만 빨갛게 표시됩니다.
  DATA_GO_KR_SERVICE_KEY=""
  ```
- [ ] **Step 3: 확인** — lint·typecheck 통과
- [ ] **Step 4: 커밋** — `feat: 공휴일 API 서버 호출과 하루 캐시 (#17)`

---

### Task 4: 범위 달력 컴포넌트와 양식 연결

**Files:**
- Create: `src/app/trips/date-range-picker.tsx`
- Modify: `src/app/trips/trip-form.tsx`, `src/app/trips/new/page.tsx`, `src/app/trips/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: Task 1 전부, Task 3 `getHolidays`, `todayInSeoul` (`@/lib/trip-dates`)
- Produces:
  ```ts
  // date-range-picker.tsx ("use client")
  export function DateRangePicker(props: {
    startDate: string; endDate: string;        // 양식 초기값 (서버가 돌려준 값 포함)
    today: string; range: CalendarRange;
    holidays: Promise<string[]>;
    error: string | undefined;                 // errors.startDate ?? errors.endDate
  }): JSX.Element;
  // 버튼 글자와 시트 요약은 같은 formatSelection 문구를 쓴다 (스펙 5.1 의 "~" 앞뒤 공백은 두지 않는다).
  // TripForm 의 props 에 추가
  today: string; range: CalendarRange; holidays: Promise<string[]>;
  ```

- [ ] **Step 1: `DateRangePicker`.**
  - 양식 값 상태 `{startDate, endDate}` (적용된 값)와 달력 안 임시 `Selection` 을 따로 둔다. 숨은 입력 `name="startDate"`·`name="endDate"` 는 적용된 값.
  - 트리거: "여행 날짜" `<label>` + 버튼. 버튼 글자는 `formatSelection(적용된 값, today)` 또는 "날짜를 선택해 주세요". 오류는 버튼 아래 `role="alert"`, 버튼에 `aria-invalid`·`aria-describedby`.
  - 열기: 임시 선택을 `initialSelection(적용된 값)` 으로 두고 `dialog.showModal()`, 시작일의 달(없으면 today 의 달) 제목으로 `scrollIntoView({ block: "start" })`.
  - 시트: 제목 "여행 날짜 선택", ✕ 버튼, 요약(`formatSelection(임시)`, 비면 "시작 날짜를 골라 주세요", 시작만 있으면 뒤에 "끝 날짜를 골라 주세요"), 고정 요일줄(일 빨강), `monthsInRange(range)` 마다 제목 + 7열 그리드, "적용하기"(임시 선택이 완성일 때만 활성).
  - 날짜 버튼: 일요일·공휴일 빨강, 오늘 굵게, 시작·끝은 진한 원(아래 "시작"/"끝", 같은 날이면 "당일"), 사이는 띠. `aria-label` 예: "2027년 1월 1일 금요일, 공휴일, 시작", `aria-pressed`.
  - 공휴일: 시트 안의 날짜 그리드를 `<Suspense>` 로 감싸고 `use(holidays)` 로 `Set` 을 만든다. fallback 은 공휴일 없이 같은 그리드(일요일만 빨강)를 그린다.
  - 닫기: ✕, Esc(`cancel` 이벤트), 바깥(backdrop) 클릭 → 임시 선택 버림. 적용 → 적용된 값 갱신 후 `close()`.
  - 배치: 기본은 화면 아래에 붙은 시트(최대 높이 85vh, 위 모서리 둥글게), `sm:` 이상은 가운데 창(최대 너비 28rem). 다크 모드 색 포함.
- [ ] **Step 2: `TripForm`.** 시작·끝 날짜 `Field` 두 개를 `DateRangePicker` 하나로 바꾼다(`startDate={values.startDate}` 등, `error={errors.startDate ?? errors.endDate}`). `TripFormFields` 가 리마운트되면 달력도 새로 시작한다.
- [ ] **Step 3: 페이지.** 만들기·고치기의 Suspense 안 컴포넌트에서 `getCurrentUser()`(고치기는 `getTrip` 까지) 뒤에 `today = todayInSeoul()`, `range = calendarRange(today, start, end)`, `holidays = getHolidays(yearsInRange(range))` (await 하지 않음)를 만들어 `TripForm` 에 넘긴다.
- [ ] **Step 4: 확인** — lint·typecheck 통과, `npm run build` 성공
- [ ] **Step 5: 커밋** — `feat: 숙소 예약형 범위 달력으로 여행 날짜 고르기 (#17)`

---

### Task 5: 테스트 계정으로 브라우저 확인 (사람 확인 두 번)

#11 Task 7 과 같은 방식. 쿠키 이름 `better-auth.session_token`, 값 `encodeURIComponent(token + "." + base64(HMAC-SHA256("better-auth-secret-12345678901234567890", token)))`, dev 서버는 시크릿·키 없이 뜬다.

- [ ] **Step 1: 넣기 SQL 승인** — 테스트 사용자 1명(`e2e-test-a-<yyyymmdd>`)과 세션, 지난 여행 1개(2020-05-01~2020-05-03, 범위 확장 확인용)의 INSERT 전문을 보이고 확인받아 실행. 로그아웃 확인은 하지 않는다(세션이 지워진다).
- [ ] **Step 2: 만들기 확인** (Playwright, 보이는 `main` 만 읽기, 390px·1000px 두 크기):
  - "여행 날짜" 버튼 → 시트 열림, 이번 달 제목이 보임, 일요일 숫자 색이 빨강(computed color), 요일줄 고정
  - 2026-12-31 → 요약 `12.31(목)~` / 적용하기 비활성 → 2027-01-02 → 요약 `12.31(목)~2027.01.02(토) · 2박 3일`, 사이 1일 띠, "시작"/"끝" 표시
  - 적용 → 버튼 글자 바뀜, 숨은 입력 값 `2026-12-31`/`2027-01-02` → 이름·여행지 넣고 만들기 → 자세히 보기 날짜 `2026년 12월 31일 – 2027년 1월 2일`
  - 같은 날 두 번 → `· 당일치기`, "당일" 표시
  - 390px 에서 시트가 화면 아래에 붙고 가로 넘침 없음, 1000px 에서 가운데 창
- [ ] **Step 3: 취소·고치기·실패 확인**:
  - 날짜를 바꾸다 ✕ → 버튼 글자·숨은 값 그대로, 다시 열면 원래 범위가 선택됨. Esc, 바깥 클릭도 같음
  - 2020 년 여행 고치기 → 시트가 2020.05 로 스크롤되고 범위가 선택돼 있음 → 다른 날짜로 바꿔 저장 → 반영
  - 날짜 없이 만들기 → "시작 날짜를 입력해 주세요." 가 날짜 칸 아래에
  - dev 로그에 `[holidays]` 키 없음 경고가 있고 달력은 정상(키 값이 로그에 없음)
- [ ] **Step 4: 정리 SQL 승인** — `DELETE FROM "user" WHERE id = …` 전문을 보이고 확인받아 실행, 남은 행 0 확인
- [ ] **Step 5: 스크린샷** (모바일 시트 범위 선택, 데스크톱 창, 양식 버튼)

---

### Task 6: 실제 공휴일 응답으로 시험 맞추기 (사용자 응답 필요)

- [ ] **Step 1:** 사용자가 붙인 응답(키 없음 확인)을 `src/lib/holidays.test.mjs` 의 `parses real response` 시험 데이터로 넣고, 그 해 공휴일 몇 개(예: `2026-01-01`, 설날, `2026-12-25`)가 결과에 있는지 단언한다. 블로그 기준 임시 데이터 주석을 지운다.
- [ ] **Step 2:** 실패하면 파서를 응답에 맞게 고친다. 응답이 `solMonth` 필수를 알리면 `holidaysForYear` 를 월 12회 호출로 바꾼다(Ruling 기록).
- [ ] **Step 3:** `node --test 'src/**/*.test.mjs'` PASS, lint·typecheck → 커밋 `test: 실제 공휴일 응답으로 파서 시험 (#17)`
- 응답이 아직 없으면 이 Task 만 남기고 Task 7 의 리뷰까지 진행하되, PR 은 draft 로 둔다.

---

### Task 7: 리뷰와 PR 마무리

- [ ] **Step 1:** lint, typecheck, `node --test 'src/**/*.test.mjs'`, `npm run build` 통과
- [ ] **Step 2:** `/code-review` — 막는 지적 0건까지
- [ ] **Step 3:** PR #18 본문: 맨 위 "사람 확인 필요 — `.env.example` 에 `DATA_GO_KR_SERVICE_KEY` 추가", `Closes #17`, 바뀐 것, 확인한 것, 사용자 할 일(인증키 발급, Vercel Production·Preview 환경 변수), "남은 지적"
- [ ] **Step 4:** Task 6 이 끝났으면 draft 해제, 사용자에게 `human-approved` 라벨 요청. 라벨이 붙고 CI 가 통과하면 자동 머지(squash) 켜기. 머지 뒤 프로덕션에서 공휴일 표시 확인을 사용자에게 요청
