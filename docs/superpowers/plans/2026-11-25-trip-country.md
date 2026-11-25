# 여행 나라 고르기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행에 나라(선택)를 저장하고, 여행지 글자로 나라를 저절로 고르며, 예산을 처음 정할 때 현지 통화·예정 환율을 나라에 맞춰 채운다(#100).

**Architecture:** 나라 목록·통화 표는 순수 모듈 `src/lib/countries.ts`, 여행지 → 나라 짐작은 순수 함수 `src/lib/place-match.ts` 와 GeoNames 로 만든 표 `src/lib/place-names.ts`(여행 양식에서만 동적 import). `trips.country_code` 칸 하나(마이그레이션). 예산 처음 값은 서버(`BudgetSection`)가 계산해 설정 양식까지 내려준다.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle(neon-http), `node --test`, Biome.

**Spec:** `docs/superpowers/specs/2026-11-25-trip-country-design.md`

## Global Constraints

- 순수 모듈(`src/lib/*.ts` 시험 대상)은 다른 모듈을 import 하지 않는다. 시험은 `src/lib/*.test.mjs`, `npm test`.
- 사용자에게 보이는 문구는 한국어. 문구는 설계 그대로: "나라 (선택)", "선택 안 함", "자주 가는 나라", "전체 (가나다순)", "여행지를 보고 골랐어요. 다르면 바꿔 주세요.", "예산을 처음 정할 때 현지 통화와 환율을 미리 채워요.", "지명 데이터: GeoNames (CC BY 4.0)", 오류 "나라를 목록에서 다시 골라 주세요."
- Google 값은 저장하지 않는다. 새 npm 의존성 없음.
- 위험 경로: `src/db/schema.ts`, `drizzle/**`(마이그레이션 PR, 자동 머지 끔). `biome.json` 은 꼭 필요할 때만.
- 커밋 전 `npm run lint`, `npm run typecheck`, `npm test`.
- 나라 이름(`Intl.DisplayNames`)·정렬은 서버에서 만들어 클라이언트에 넘긴다(hydration).

## Review Focus

- 여행지 칸에서 한글 조합 중(IME) 글자: 짐작은 `onChange` 값마다 돌아도 결과가 같으니 문제없어야 한다 — 마지막 값 기준으로 골라지는지 브라우저에서 "오사카" 입력으로 본다(Task 5).
- 서버 검증 오류로 양식이 다시 그려질 때 사용자가 고른 나라가 남고, 저절로 고른 나라도 덮이지 않는다(Task 5 브라우저 확인).
- 나라 칸을 고른 뒤 여행지를 지워도 나라가 남는다(직접 고른 것), 저절로 고른 뒤 여행지를 지우면 "선택 안 함"(Task 2 시험은 함수만, 동작은 Task 5 브라우저).
- 지명 표가 여행 자세히 보기 등 다른 화면 JS 에 실리지 않는다(Task 5: 빌드 뒤 여행 화면 요청에 표 청크가 없는지).
- 예산 통화를 바꾸면 미리 채운 환율이 비고, 되돌리면 다시 보인다(Task 6 브라우저).

---

### Task 1: 나라 목록과 통화 표 (`src/lib/countries.ts`)

**Files:**
- Create: `src/lib/countries.ts`
- Test: `src/lib/countries.test.mjs`

**Interfaces:**
- Produces:
  - `COUNTRY_CODES: readonly string[]` — ISO 3166-1 alpha-2 정식 배정 249개.
  - `FREQUENT_COUNTRY_CODES: readonly string[]` — `["KR","JP","VN","CN","TH","PH","TW","US","GU","HK","SG","MY","ID"]`.
  - `isCountryCode(value: string): boolean`
  - `countryCurrency(code: string): string | null` — 설계 §5.2 표.
  - `type CountryOption = { code: string; name: string }`
  - `countryOptions(): { frequent: CountryOption[]; all: CountryOption[] }` — 이름은 `new Intl.DisplayNames(["ko"], { type: "region" })`, `all` 은 `name.localeCompare(b.name, "ko")` 순.
  - `countryNameIndex(options: CountryOption[]): Record<string, string>` — 이름 → 코드(짐작용, 이름의 빈칸은 뺀 키).

- [ ] **Step 1: 실패하는 시험 쓰기** — `countries.test.mjs`:
  - `COUNTRY_CODES.length === 249`, `new Set(...).size === 249`, 모두 `/^[A-Z]{2}$/`, `KR`·`GU`·`BQ` 포함, `XK` 미포함.
  - `FREQUENT_COUNTRY_CODES` 모두 `isCountryCode`.
  - `isCountryCode("KR") === true`, `"kr"`, `""`, `"KOR"`, `"ZZ"` → false.
  - `countryCurrency`: KR→"KRW", JP→"JPY", BG→"EUR", GU→"USD", LI→"CHF", MN→null, MO→null.
  - 통화 표의 모든 키가 `isCountryCode` (내부 표를 `COUNTRY_CURRENCY` 로 export 해 검사).
  - `countryOptions()`: `frequent[0]` 가 `{ code: "KR", name: "대한민국" }`, `all.length === 249`, `all` 이 ko 정렬 순.
  - `countryNameIndex(countryOptions().all)["일본"] === "JP"`.
- [ ] **Step 2: 실행해 실패 확인** — `npm test` → `countries.ts` 없음으로 FAIL.
- [ ] **Step 3: 구현** — 통화 표는 설계 §5.2 목록 그대로.
- [ ] **Step 4: 실행해 통과 확인** — `npm test` PASS.
- [ ] **Step 5: 커밋** — `feat: 나라 목록·통화 표 (#100)`.

### Task 2: 여행지 → 나라 짐작 (`src/lib/place-match.ts`)

**Files:**
- Create: `src/lib/place-match.ts`
- Test: `src/lib/place-match.test.mjs`

**Interfaces:**
- Produces: `matchCountry(destination: string, names: Readonly<Record<string, string>>): string | null`

알고리즘(설계 §5.3.1): 낱말 나누기 문자 `/[\s,·/()\-~&+]+/`; 낱말마다 [그대로, 끝말 하나를 뗀 것(긴 것부터 `특별자치도` `특별자치시` `특별시` `광역시` `여행` `시` `도` `섬`, 뗀 뒤 2글자 이상일 때만)]을 `names` 에서 통째로 찾는다; 나온 나라가 정확히 하나면 그 코드, 아니면 null.

- [ ] **Step 1: 실패하는 시험** — 작은 `names` 표 `{ 오사카: "JP", 교토: "JP", 부산: "KR", 제주: "KR", 일본: "JP", 서울: "KR", 도쿄: "JP", 빈: "AT" }` 로:
  `"오사카 교토"`→JP, `"부산여행"`→KR, `"제주도"`→KR, `"일본 일주"`→JP, `"서울 도쿄"`→null, `"유럽 일주"`→null, `"빈티지 숍"`→null, `"빈"`→AT, `""`→null, `"  부산 , 제주 "`→KR, `"오사카(교토)"`→JP.
- [ ] **Step 2: 실패 확인** — `npm test`.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat: 여행지로 나라 짐작 (#100)`.

### Task 3: GeoNames 지명 표

**Files:**
- Create: `scripts/build-place-names.mjs`
- Create (생성물): `src/lib/place-names.ts`
- Test: `src/lib/place-names.test.mjs`

**Interfaces:**
- Consumes: `isCountryCode` (Task 1, 스크립트가 `../src/lib/countries.ts` import).
- Produces: `PLACE_NAMES: Readonly<Record<string, string>>` (`src/lib/place-names.ts`).

스크립트: `node scripts/build-place-names.mjs <cities15000.txt 경로>`. 줄마다 탭으로 나눠 이름 칸 4번째(alternatenames, 인덱스 3), 나라 9번째(인덱스 8), 인구 15번째(인덱스 14). 한글만(`/^[가-힣][가-힣 ]*$/`)인 이름 → 키 = 빈칸 뺀 이름, 그리고 끝 "시"를 뗀 것(2글자 이상). 같은 키는 인구 큰 쪽. 손으로 더하는 목록(설계 §5.3.2: 규슈·홋카이도·오키나와·혼슈·시코쿠 JP, 하와이 US, 사이판 MP, 발리·롬복 ID, 보라카이·보홀·팔라완 PH, 푸꾸옥·푸꼭 VN, 푸껫·코사무이 TH)은 스크립트 안 상수로, 도시 값보다 이긴다. `isCountryCode` 가 아닌 나라는 버린다. 출력은 키 정렬, 맨 위 주석(만든 파일·손으로 고치지 않음·출처 GeoNames `cities15000.zip` CC BY 4.0·받은 날짜·다시 만드는 명령). 생성 뒤 `npx biome format --write src/lib/place-names.ts`.

- [ ] **Step 1: 실패하는 시험** — `place-names.test.mjs`: 모든 값 `isCountryCode`, 키에 빈칸 없음, `부산`→KR, `도쿄`→JP, `오사카`→JP, `다낭`→VN, `방콕`→TH, `파리`→FR, `런던`→GB, `시드니`→AU, `규슈`→JP, `발리`→ID, 키 개수 > 6000.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 스크립트 쓰고 scratchpad 의 `cities15000.txt` 로 생성, biome format.**
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run lint`(큰 파일로 느리거나 실패하면 그때만 `biome.json` 제외 검토).
- [ ] **Step 5: 커밋** — `feat: GeoNames 지명 표 (#100)`.

### Task 4: DB 칸·검증·저장

**Files:**
- Modify: `src/db/schema.ts` (trips: `countryCode` 칸 + `trips_country_code_check`)
- Create: `drizzle/0010_*.sql` (`npm run db:generate`)
- Modify: `src/lib/trip-input.ts`, `src/lib/trip-input.test.mjs`
- Modify: `src/app/trips/actions.ts` (`readTripFields`, `parseTripInput` 호출)
- Modify: `src/app/trips/[id]/edit/page.tsx` (`initialValues.countryCode`)

**Interfaces:**
- Consumes: `isCountryCode` (Task 1).
- Produces:
  - `TripFields.countryCode: string`, `TripInput.countryCode: string | null`, `EMPTY_TRIP_FIELDS.countryCode = ""`.
  - `parseTripInput(raw: TripFields, isCountry: (code: string) => boolean): TripInputResult`.
  - `TripRow.countryCode: string | null` (스키마에서 저절로).

- [ ] **Step 1: 실패하는 시험** — `trip-input.test.mjs` 의 `valid` 에 `countryCode: ""` 를 넣고 모든 호출에 `isCountry` 두 번째 인자(`(c) => c === "JP" || c === "KR"`)를 준다. 새 시험: 빈칸 → `countryCode: null`, `" JP "` → `"JP"`, `"jp"`·`"ZZ"` → `errors.countryCode === "나라를 목록에서 다시 골라 주세요."`.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 스키마 칸 주석은 설계 §5.1 그대로. `actions.ts` 는 `parseTripInput(values, isCountryCode)`.
- [ ] **Step 4: `npm run db:generate`** — 생성 SQL 이 설계 §5.1 예상과 같은지(ADD COLUMN + CHECK 두 문, 파괴적 아님) 확인.
- [ ] **Step 5: 마이그레이션 확인** — scratchpad PGlite 로 `drizzle/*.sql` 을 journal 순서로 적용, `country_code` 에 `'JP'` 통과·`'jp'`·`'JPN'` 거절, 기존 행 null.
- [ ] **Step 6: `npm test`·`npm run typecheck` 통과.**
- [ ] **Step 7: 커밋** — `feat: 여행 나라 칸과 검증 (#100)`.

### Task 5: 여행 양식의 나라 칸

**Files:**
- Create: `src/app/trips/country-field.tsx` (클라이언트)
- Modify: `src/app/trips/trip-form.tsx` (여행지 값 상태, 나라 칸 배치, `countries` prop)
- Modify: `src/app/trips/new/page.tsx`, `src/app/trips/[id]/edit/page.tsx` (`countries={countryOptions()}`)

**Interfaces:**
- Consumes: `CountryOption`, `countryOptions`, `countryNameIndex` (Task 1), `matchCountry` (Task 2), `PLACE_NAMES` (Task 3, `import("@/lib/place-names")` 로만), `TripFields.countryCode` (Task 4).
- Produces: `TripForm` prop `countries: { frequent: CountryOption[]; all: CountryOption[] }`; `CountryField({ countries, destination, initialValue, error })`.

동작(설계 §5.3·5.3.1): 제어 `<select name="countryCode">`; `touched` 는 처음 값이 비어 있지 않으면 true, 사용자가 select 를 바꾸면 true; `touched` 가 false 인 동안 `destination` 또는 표 도착 때마다 `matchCountry(destination, { ...PLACE_NAMES, ...countryNameIndex(countries.all) }) ?? ""` 로 값을 맞추고, 결과가 있을 때만 "여행지를 보고 골랐어요…" 줄. 표는 `useEffect` 에서 한 번 동적 import(실패하면 짐작 없음). 안내 두 줄과 출처 줄(GeoNames `https://www.geonames.org/`, 라이선스 `https://creativecommons.org/licenses/by/4.0/`, 새 탭). 여행지 input 은 `defaultValue` 그대로 두고 `onChange` 로 상태만 갱신.

- [ ] **Step 1: 구현.**
- [ ] **Step 2: `npm run lint`·`npm run typecheck`.**
- [ ] **Step 3: 화면 확인** — 마이그레이션 전이라 실제 페이지는 DB 칸이 없어 못 띄운다. 커밋하지 않는 임시 라우트(`src/app/e2e-country/page.tsx`, 가짜 action)에 `TripForm` 을 그려 Playwright 로: "오사카" 입력 → 일본, 지우면 선택 안 함, 직접 고른 뒤 여행지 바꿔도 유지, 처음 값 있는 양식은 그대로, 처음 값 없고 여행지 "부산" 인 양식은 대한민국, 390px, 다크 모드. 확인 뒤 임시 라우트와 `.next/dev/types` 지움.
- [ ] **Step 4: `npm run build` 뒤 지명 표 청크가 `/trips/[id]` 에 실리지 않는지**(빌드 출력 또는 `.next` 의 페이지 매니페스트에서 표 문자열 검색).
- [ ] **Step 5: 커밋** — `feat: 여행 양식에 나라 칸·저절로 고르기 (#100)`.

### Task 6: 예산 처음 값

**Files:**
- Modify: `src/lib/budget.ts` (+ `src/lib/budget.test.mjs`)
- Modify: `src/app/trips/[id]/budget-section.tsx`, `budget-area.tsx`, `budget-sheet.tsx`, `budget-card.tsx`, `budget-forms.tsx`

**Interfaces:**
- Consumes: `countryCurrency` (Task 1), `TripRow.countryCode` (Task 4), `getEcbRate(date, from, to)` (`src/lib/fx-api.ts`), `todayInSeoul()`.
- Produces:
  - `type BudgetStartValues = { localCurrency: string; plannedRate: string }`
  - `budgetStartValues(localCurrency: string | null, ecbRate: string | null): BudgetStartValues | null` (`src/lib/budget.ts`) — null 이면 처음 값 없음. `localCurrency` 가 null·"KRW"·`currencyInfo` 없음 → null. 아니면 `{ localCurrency, plannedRate: info.ecb && ecbRate ? rateInputValue(ecbRate, info.rateUnit) : "" }`.
  - 새 prop `startValues: BudgetStartValues | null` 를 `BudgetArea` → `BudgetSheet` → `BudgetCards` → `CardsBody` → `BudgetSettingsForm`(config null 일 때만 씀).

- [ ] **Step 1: 실패하는 시험** (`budget.test.mjs`): `budgetStartValues(null, null)`→null, `("KRW","1")`→null, `("XXX","1")`→null, `("JPY","8.4523")`→`{ localCurrency: "JPY", plannedRate: "845.23" }`, `("JPY", null)`→`{ "JPY", "" }`, `("VND","0.055")`→`{ "VND", "" }`(ecb 아님), `("USD","1450.5")`→`{ "USD", "1450.5" }`.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — `BudgetSection`: `local = trip.countryCode ? countryCurrency(trip.countryCode) : null`; `currencyInfo(local)?.ecb && local !== "KRW"` 이면 `getEcbRate(todayInSeoul(), local, "KRW")` 를 `loadBudget` 과 동시에 시작; 예산이 null 일 때만 기다려 `budgetStartValues(local, rate?.rate ?? null)`, 아니면 null. `BudgetSettingsForm` 처음 값: `config ? settingsFields(config) : { ...EMPTY_BUDGET_SETTINGS_FIELDS, ...startValues }`. 환율 칸: `key={`${local}|${currency}`}`, 처음 값 조건 `local === values.localCurrency && currency === values.currency`.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run lint`, `npm run typecheck`.
- [ ] **Step 5: 커밋** — `feat: 나라에 맞춘 예산 처음 값, 예산 통화 바꾸면 환율 비우기 (#100)`.

### Task 7: 마무리 확인과 PR

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` 통과.
- [ ] `/code-review`(`/security-review` 는 인증·소유권 코드를 바꾸지 않으면 생략, 이유를 PR 에).
- [ ] draft PR: `Closes #100`, 맨 위 "사람 확인 필요"(마이그레이션·위험 경로), SQL 전문·파괴적 아님, "옛 코드와 새 DB" 두 판정(설계 §5.1), 남은 지적.
- [ ] `human-approved` 뒤 `npm run db:migrate`(실행 직전 사람 확인) → 실제 페이지로 브라우저 확인(만들기·고치기·예산 처음 값 두 길·환율 비우기) → 자동 머지.
