# 여행별 예산과 지출 (#14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행마다 총 예산을 정하고, 일정마다 예상·실제 금액(현지 통화는 결제일 기준환율)을 적어, 지도 [전체]·[N일차] 탭 카드에서 예상 총지출과 초과·여유를 본다.

**Architecture:** 새 테이블 `trip_budgets`(설정)·`budget_items`(일정에 붙은 금액 또는 일정 밖 항목). 돈 계산·입력 해석은 순수 모듈(`src/lib/budget.ts`, `budget-input.ts`, `fx.ts`)에, DB 는 `src/db/queries/budget.ts`, 쓰기는 `src/app/trips/budget-actions.ts` 와 기존 `schedule-actions.ts`. 화면은 지도 패널 탭 아래 카드(`budget-card.tsx`), 일정 양식의 금액 칸, 완료 체크칸 뒤 실제 지출 칸.

**Tech Stack:** Next.js 16 App Router(`cacheComponents`), React 19, Drizzle ORM + neon-http, Tailwind 4, `node --test`(타입 제거로 `.ts` 직접 import).

**Spec:** `docs/superpowers/specs/2026-11-20-trip-budget-design.md` — 실행자는 이 계획과 함께 읽는다. 절 번호(§)는 설계 문서의 것.

## Global Constraints

- 금액은 통화 최소 단위 정수(DB `bigint`, JS `number`), 상한 `< 10^12`. 계산에 부동소수점을 쓰지 않는다(환율 곱은 BigInt).
- 환율은 `numeric(20,10)` 문자열, 뜻은 "현지 통화 1 = 예산 통화 몇". 소수 10자리 넘는 값은 거절.
- 여행 접근은 `accessibleTrips(userId)` 를 **같은 SQL 문 안에** 넣는다. 하위 id 는 여행 id 와 함께 묶는다. uuid 형식이 틀리면 쿼리 없이 `null`/`false`.
- neon-http 는 트랜잭션이 없다. 조건부·여러 행 쓰기는 한 문(조건부 insert/update, 데이터를 바꾸는 CTE).
- Server Action 순서: `getCurrentUser()`(없으면 `redirect("/")`) → 필드별 검증(`FormData` 통째로 넘기지 않음) → `userId` 범위 쿼리 → `revalidatePath(`/trips/${tripId}`)`. 남의 것·없는 것은 똑같이 `notFound()` 또는 `{ ok: false }`.
- 사용자 문구는 한국어, 공통 문구는 `src/app/trips/messages.ts`.
- `src/lib/*.ts` 중 시험 대상 순수 모듈은 다른 모듈을 import 하지 않는다(필요한 값은 인자로 받는다).
- 위험 경로 중 이 작업이 바꾸는 것은 `src/db/schema.ts`·`drizzle/**` 뿐. `package.json` 은 바꾸지 않는다(새 의존성 없음). `drizzle/` 생성 파일은 손으로 고치지 않는다.
- 일정 줄(`ScheduleItemRow` 의 보기 상태)에는 금액을 보이지 않는다(§5.7).
- 커밋 전 `npm run lint`·`npm run typecheck`·`node --test 'src/**/*.test.mjs'` 통과.

## Review Focus

1. **환율 API 가 느리거나 막힘**(클라우드 세션은 403): 실제 지출 저장이 5초 안에 예정 환율(`planned`)로 끝나야 한다 → Task 1 `decideRate` 시험(미래·미지원 → planned), Task 10 Step 3 에서 막힌 상태로 현지 통화 실제 지출을 저장해 출처 "예정 환율"로 저장되는지 확인.
2. **통화 설정을 바꿔 기존 금액이 고아가 됨**: 예산 통화 변경·현지 통화 변경/제거가 금액이 있으면 거절 → Task 4 `upsertTripBudget` 의 `locked` 경로, Task 9 브라우저 확인.
3. **남의 일정·항목 id 섞기**: 내 여행 id + 남의 일정 id 로 금액 쓰기, 남의 여행 항목 고치기·지우기 → Task 4 쿼리 조건, Task 10 소유권 확인.
4. **일정 저장 성공 + 금액 저장 실패**: 조용히 빠지지 않고 `MONEY_SAVE_FAILED` 가 보인다(추가는 새 양식 위 안내, 고치기는 양식이 열린 채) → Task 8.
5. **완료 체크 해제 시 실제 지출**: 실제가 있으면 확인 창, 확인이면 완료 해제와 실제 삭제가 한 문, 취소면 그대로. 실제 없으면 확인 없이 → Task 9.

---

### Task 1: 돈 계산 순수 모듈

**Files:**
- Create: `src/lib/budget.ts`
- Test: `src/lib/budget.test.mjs`

**Interfaces:**
- Produces (모두 `src/lib/budget.ts` 에서 export):
  - `type CurrencyInfo = { code: string; label: string; symbol: string; digits: number; ecb: boolean; rateUnit: 1 | 100 }`
  - `CURRENCIES: readonly CurrencyInfo[]`, `currencyInfo(code: string): CurrencyInfo | null`
  - `MAX_AMOUNT_MINOR = 10 ** 12` (이 값 미만만 허용)
  - `type Money = { amount: number; currency: string }` (amount = 최소 단위)
  - `type RateSource = "ecb" | "manual" | "planned"`
  - `type ActualMoney = Money & { paidOn: string | null; rate: string | null; rateSource: RateSource | null }`
  - `type BudgetSettings = { currency: string; totalAmount: number; localCurrency: string | null; plannedRate: string | null }`
  - `type BudgetLine = { id: string; scheduleItemId: string | null; title: string | null; date: string | null; estimate: Money | null; actual: ActualMoney | null }` (date = 그 행의 날짜: 일정에 붙은 행은 일정 날짜, 일정 밖 행은 `date`)
  - `parseAmount(text: string, currency: string): { ok: true; minor: number | null } | { ok: false; error: string }` (빈칸·공백 → `minor: null`)
  - `formatMoney(minor: number, currency: string): string`
  - `amountInputValue(minor: number, currency: string): string` (양식 기본값, 쉼표 없음: 1250 USD → `"12.50"`, 1200 JPY → `"1200"`)
  - `parseRateInput(text: string, unit: 1 | 100): { ok: true; rate: string } | { ok: false; error: string }`
  - `rateInputValue(rate: string, unit: 1 | 100): string`
  - `normalizeRate(text: string): string | null` (DB 문자열 `"9.2000000000"` → `"9.2"`, 양수 아님·10자리 초과 → `null`)
  - `toBudgetMinor(money: Money, rate: string | null, budgetCurrency: string): number`
  - `type BudgetSummary = { total: number; planned: number; actual: number; actualOverPlan: number; unplanned: number; remaining: number; projected: number; balance: number; hasActual: boolean }`
  - `summarizeBudget(lines: BudgetLine[], settings: BudgetSettings): BudgetSummary`
  - `type PeriodTotal = { estimate: number; actual: number; diff: number | null; native: { currency: string; estimate: number; actual: number; diff: number | null } | null }`
  - `totalsByPeriod(lines: BudgetLine[], settings: BudgetSettings, tripStart: string, tripEnd: string): { tripWide: PeriodTotal; byDate: Record<string, PeriodTotal>; outside: PeriodTotal | null }`
  - `type RateDecision = { kind: "none" } | { kind: "keep"; rate: string; source: RateSource } | { kind: "manual"; rate: string } | { kind: "planned" } | { kind: "fetch" }`
  - `decideRate(input: { currency: string; paidOn: string; rateField: string | undefined; previous: ActualMoney | null; settings: BudgetSettings; today: string }): RateDecision` — `rateField` 는 `parseRateInput` 로 이미 정규화된 값(빈칸 = `""`), `undefined` = 칸이 없던 입력(체크칸 빠른 입력)

- [ ] **Step 1: 실패하는 시험 쓰기** — `src/lib/budget.test.mjs`, 아래 단언을 각각 `test(...)` 로:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { CURRENCIES, currencyInfo, parseAmount, formatMoney, amountInputValue,
  parseRateInput, rateInputValue, normalizeRate, toBudgetMinor,
  summarizeBudget, totalsByPeriod, decideRate } from "./budget.ts";

const KRW = { currency: "KRW", totalAmount: 1_000_000, localCurrency: null, plannedRate: null };
const KRW_JPY = { currency: "KRW", totalAmount: 1_000_000, localCurrency: "JPY", plannedRate: "9.2" };
const line = (o) => ({ id: o.id ?? "x", scheduleItemId: null, title: "t", date: null, estimate: null, actual: null, ...o });
const act = (amount, currency, extra = {}) => ({ amount, currency, paidOn: null, rate: null, rateSource: null, ...extra });

// 통화 표
assert.deepEqual(CURRENCIES.map((c) => c.code), ["KRW","JPY","USD","EUR","CNY","HKD","TWD","THB","VND","SGD","PHP","MYR","IDR","GBP","AUD","CAD","CHF"]);
assert.equal(currencyInfo("KRW").digits, 0); assert.equal(currencyInfo("USD").digits, 2);
assert.equal(currencyInfo("TWD").ecb, false); assert.equal(currencyInfo("VND").ecb, false);
assert.equal(currencyInfo("JPY").rateUnit, 100); assert.equal(currencyInfo("USD").rateUnit, 1);
assert.equal(currencyInfo("XXX"), null);
// 금액 해석
assert.deepEqual(parseAmount("12,000", "KRW"), { ok: true, minor: 12000 });
assert.deepEqual(parseAmount("  ", "KRW"), { ok: true, minor: null });
assert.deepEqual(parseAmount("12.5", "USD"), { ok: true, minor: 1250 });
assert.deepEqual(parseAmount("0", "JPY"), { ok: true, minor: 0 });
for (const bad of ["12.5", "-1", "1e3", "abc", "1,2,3.4"]) assert.equal(parseAmount(bad, "KRW").ok, false);
assert.equal(parseAmount("12.345", "USD").ok, false);
assert.deepEqual(parseAmount("999999999999", "KRW"), { ok: true, minor: 999999999999 });
assert.equal(parseAmount("1000000000000", "KRW").ok, false);
assert.equal(parseAmount("10000000000", "USD").ok, false); // 10^12 최소 단위
// 표시
assert.equal(formatMoney(1_000_000, "KRW"), "₩1,000,000");
assert.equal(formatMoney(1200, "JPY"), "¥1,200");
assert.equal(formatMoney(1250, "USD"), "$12.50");
assert.equal(amountInputValue(1250, "USD"), "12.50"); assert.equal(amountInputValue(1200, "JPY"), "1200");
// 환율
assert.deepEqual(parseRateInput("920", 100), { ok: true, rate: "9.2" });
assert.deepEqual(parseRateInput("1,380.5", 1), { ok: true, rate: "1380.5" });
for (const bad of ["0", "-3", "abc", "", "0.000000001"]) assert.equal(parseRateInput(bad, 100).ok, false);
assert.equal(rateInputValue("9.2", 100), "920");
assert.equal(normalizeRate("9.2000000000"), "9.2"); assert.equal(normalizeRate("0"), null);
assert.equal(normalizeRate("1.12345678901"), null);
// 바꾸기(행마다 반올림, 0.5 는 올림)
assert.equal(toBudgetMinor({ amount: 1200, currency: "JPY" }, "9.2", "KRW"), 11040);
assert.equal(toBudgetMinor({ amount: 1250, currency: "USD" }, "1380.5", "KRW"), 17256);
assert.equal(toBudgetMinor({ amount: 1000, currency: "JPY" }, "0.0067", "USD"), 670);
assert.equal(toBudgetMinor({ amount: 1, currency: "JPY" }, "0.5", "KRW"), 1);
assert.equal(toBudgetMinor({ amount: 5000, currency: "KRW" }, null, "KRW"), 5000);
// 요약(설계 §5.7.1 예시 숫자)
const s = summarizeBudget([
  line({ id: "a", estimate: { amount: 430_000, currency: "KRW" }, actual: act(502_000, "KRW") }),
  line({ id: "b", actual: act(50_000, "KRW") }),
  line({ id: "c", estimate: { amount: 620_000, currency: "KRW" } }),
], KRW);
assert.deepEqual(s, { total: 1_000_000, planned: 1_050_000, actual: 552_000, actualOverPlan: 122_000,
  unplanned: 50_000, remaining: 620_000, projected: 1_172_000, balance: -172_000, hasActual: true });
// 현지 통화: 예상은 예정 환율, 실제는 행의 환율
const j = summarizeBudget([line({ estimate: { amount: 1000, currency: "JPY" }, actual: act(1000, "JPY", { rate: "9.5", rateSource: "ecb", paidOn: "2026-11-21" }) })], KRW_JPY);
assert.equal(j.planned, 9200); assert.equal(j.actual, 9500); assert.equal(j.actualOverPlan, 300);
// 기간별
const t = totalsByPeriod([
  line({ id: "p", date: null, estimate: { amount: 420_000, currency: "KRW" }, actual: act(420_000, "KRW") }),
  line({ id: "q", date: "2026-11-21", estimate: { amount: 5000, currency: "JPY" }, actual: act(6800, "JPY", { rate: "9.2", rateSource: "planned", paidOn: "2026-11-21" }) }),
  line({ id: "r", date: "2026-11-21", actual: act(900, "JPY", { rate: "9.2", rateSource: "planned", paidOn: "2026-11-21" }) }),
  line({ id: "o", date: "2026-12-30", estimate: { amount: 12_000, currency: "KRW" } }),
], KRW_JPY, "2026-11-21", "2026-11-23");
assert.deepEqual(t.tripWide, { estimate: 420_000, actual: 420_000, diff: 0, native: { currency: "KRW", estimate: 420_000, actual: 420_000, diff: 0 } });
assert.deepEqual(t.byDate["2026-11-21"], { estimate: 46_000, actual: 70_840, diff: 24_840, native: { currency: "JPY", estimate: 5000, actual: 7700, diff: 2700 } });
assert.equal(t.byDate["2026-11-22"], undefined);
assert.deepEqual(t.outside, { estimate: 12_000, actual: 0, diff: null, native: { currency: "KRW", estimate: 12_000, actual: 0, diff: null } });
// 환율 결정
const base = { currency: "JPY", paidOn: "2026-11-20", rateField: "", previous: null, settings: KRW_JPY, today: "2026-11-20" };
assert.deepEqual(decideRate({ ...base, currency: "KRW" }), { kind: "none" });
assert.deepEqual(decideRate(base), { kind: "fetch" });
assert.deepEqual(decideRate({ ...base, paidOn: "2026-11-21" }), { kind: "planned" });
assert.deepEqual(decideRate({ ...base, rateField: "9.4" }), { kind: "manual", rate: "9.4" });
const prev = act(1000, "JPY", { paidOn: "2026-11-20", rate: "9.31", rateSource: "ecb" });
assert.deepEqual(decideRate({ ...base, previous: prev, rateField: "9.31" }), { kind: "keep", rate: "9.31", source: "ecb" });
assert.deepEqual(decideRate({ ...base, previous: prev, rateField: undefined }), { kind: "keep", rate: "9.31", source: "ecb" });
assert.deepEqual(decideRate({ ...base, previous: prev, paidOn: "2026-11-19", rateField: "9.31" }), { kind: "fetch" });
assert.deepEqual(decideRate({ ...base, previous: { ...prev, rateSource: "planned", rate: "9.2" }, rateField: "9.2" }), { kind: "fetch" });
assert.deepEqual(decideRate({ ...base, settings: { ...KRW_JPY, localCurrency: "TWD" }, currency: "TWD" }), { kind: "planned" });
```

- [ ] **Step 2: 실패 확인** — `node --test src/lib/budget.test.mjs` → `Cannot find module './budget.ts'` 로 FAIL.

- [ ] **Step 3: `src/lib/budget.ts` 구현** — 맨 위 주석: 순수 모듈이라 다른 모듈을 import 하지 않는다. 값:
  - 통화 표(순서 그대로): KRW 원 ₩ 0 ecb · JPY 엔 ¥ 0 ecb rateUnit 100 · USD 미국 달러 $ 2 ecb · EUR 유로 € 2 ecb · CNY 위안 CN¥ 2 ecb · HKD 홍콩 달러 HK$ 2 ecb · TWD 대만 달러 NT$ 2 **ecb false** · THB 바트 ฿ 2 ecb · VND 동 ₫ 0 **ecb false** rateUnit 100 · SGD 싱가포르 달러 S$ 2 ecb · PHP 필리핀 페소 ₱ 2 ecb · MYR 링깃 RM 2 ecb · IDR 루피아 Rp 0 ecb rateUnit 100 · GBP 파운드 £ 2 ecb · AUD 호주 달러 A$ 2 ecb · CAD 캐나다 달러 C$ 2 ecb · CHF 스위스 프랑 CHF 2 ecb. (rateUnit 100 은 설계 §5.7.1 "엔·동 등은 100 단위"를 통화별로 고정한 것)
  - `parseAmount` 오류 문구: 형식 `"금액을 숫자로 적어 주세요."`, 자릿수 0 → `"소수점 없이 적어 주세요."`, 2 → `"소수점 아래는 2자리까지 적을 수 있어요."`, 상한 → `"금액이 너무 커요."`. 쉼표는 지우고 `^\d+(\.\d+)?$` 만 받는다. 정수 변환은 글자 이어 붙이기로(부동소수점 곱 금지).
  - `formatMoney`: `symbol + 정수부 천 단위 쉼표 + (digits>0 ? "." + 소수부 : "")`. `Intl` 의 통화 기호·자릿수에 기대지 않는다(§5.3).
  - `parseRateInput` 오류 문구 `"환율을 0보다 큰 숫자로 적어 주세요."`. unit 100 이면 소수점을 두 칸 왼쪽으로 옮긴 글자. 결과가 10자리 초과면 같은 문구로 거절.
  - `toBudgetMinor`: 환율 글자를 `(정수 BigInt, 10^소수자리)` 비율로 바꿔 `round(amount × rateNum × 10^toDigits / (rateDen × 10^fromDigits))`, 반올림은 `(2n·num + den) / (2n·den)` 식(음수 없음).
  - `summarizeBudget`: 정의는 §5.3. 예상은 `currency === settings.currency ? 그대로 : toBudgetMinor(e, settings.plannedRate, …)`, 실제는 `actual.rate`. `hasActual` = 실제가 하나라도.
  - `totalsByPeriod`: `date === null` → `tripWide`, 기간 안 → `byDate[date]`(금액 있는 날만 키), 기간 밖 → `outside`(없으면 `null`). `diff` = 실제가 있는 행의 Σ(실제 − (예상 ?? 0)), 실제 있는 행이 없으면 `null`. `native` = 그 기간 모든 금액(예상·실제)이 한 통화면 그 통화 합계, 아니면 `null`.
  - `decideRate` 순서: 예산 통화 → `none` / `rateField` 가 비지 않고 `previous?.rate` 와 다르면 → `manual` / `previous` 가 같은 통화·같은 `paidOn`·출처 `ecb`|`manual` 이고 (`rateField === undefined` 또는 `rateField === previous.rate`) → `keep` / `paidOn > today` 또는 두 통화 중 하나가 `ecb: false` → `planned` / 그 밖 → `fetch`.

- [ ] **Step 4: 통과 확인** — `node --test src/lib/budget.test.mjs` → 모두 PASS.

- [ ] **Step 5: 커밋** — `git add src/lib/budget.ts src/lib/budget.test.mjs && git commit -m "예산: 돈 계산 순수 모듈 (#14)"`

---

### Task 2: 입력 검증·환율 응답 해석 순수 모듈

**Files:**
- Create: `src/lib/budget-input.ts`, `src/lib/fx.ts`
- Test: `src/lib/budget-input.test.mjs`, `src/lib/fx.test.mjs`

**Interfaces:**
- Consumes: 없음(순수 규칙). 금액·환율 해석 함수는 **인자로** 받는다 — `type MoneyParsers = { parseAmount: typeof parseAmount; parseRateInput: typeof parseRateInput; currencyInfo: typeof currencyInfo }` (Task 1 의 것을 부르는 쪽이 넘긴다. 시험도 Task 1 모듈을 import 해서 넘긴다.)
- Produces (`src/lib/budget-input.ts`):
  - `type BudgetSettingsFields = { totalAmount: string; currency: string; localCurrency: string; plannedRate: string }` (`localCurrency` 빈칸 = 없음, `plannedRate` 는 rateUnit 단위 글자)
  - `parseBudgetSettings(f: BudgetSettingsFields, p: MoneyParsers): { ok: true; value: { currency: string; totalAmount: number; localCurrency: string | null; plannedRate: string | null } } | { ok: false; errors: Partial<Record<keyof BudgetSettingsFields, string>> }`
  - `type AmountFields = { estimateAmount: string; estimateCurrency: string; actualAmount: string; actualCurrency: string; actualPaidOn: string; actualRate: string }` 와 `EMPTY_AMOUNT_FIELDS`
  - `type ParsedAmounts = { estimate: { amount: number; currency: string } | null; actual: { amount: number; currency: string; paidOn: string | null; rateField: string | undefined } | null }`
  - `parseAmountFields(f: AmountFields, allowed: { currency: string; localCurrency: string | null }, p: MoneyParsers, opts: { actualShown: boolean; defaultPaidOn: string }): { ok: true; value: ParsedAmounts & { actualTouched: boolean } } | { ok: false; errors: Partial<Record<keyof AmountFields, string>> }` — `actualShown: false`(실제 칸이 없던 양식)면 실제 칸을 읽지 않고 `actual: null, actualTouched: false`(부르는 쪽이 이전 실제를 그대로 둔다). 실제가 현지 통화가 아니면 `paidOn: null`, `rateField: undefined`. 현지 통화면 `paidOn` = `actualPaidOn`(빈칸이면 `defaultPaidOn`), `rateField` = 빈칸이면 `""`, 아니면 `parseRateInput(actualRate, 현지 rateUnit)` 결과.
  - `type ExtraItemFields = AmountFields & { title: string; date: string }` (`date` 빈칸 = 여행 전체)
  - `parseExtraItem(f: ExtraItemFields, allowed, p, opts: { tripDates: string[] }): { ok: true; value: { title: string; date: string | null } & ParsedAmounts } | { ok: false; errors: Partial<Record<keyof ExtraItemFields, string>> }`
  - `EXTRA_TITLE_MAX = 100`
- Produces (`src/lib/fx.ts`):
  - `frankfurterUrl(date: string, from: string, to: string): string` → `https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`
  - `parseFrankfurterRate(body: unknown, to: string): { rate: string; rateDate: string } | null`

- [ ] **Step 1: 실패하는 시험 쓰기**

```js
// src/lib/budget-input.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyInfo, parseAmount, parseRateInput } from "./budget.ts";
import { EMPTY_AMOUNT_FIELDS, parseAmountFields, parseBudgetSettings, parseExtraItem } from "./budget-input.ts";
const p = { currencyInfo, parseAmount, parseRateInput };
const allowed = { currency: "KRW", localCurrency: "JPY" };
const opts = { actualShown: true, defaultPaidOn: "2026-11-21" };

assert.deepEqual(parseBudgetSettings({ totalAmount: "1,000,000", currency: "KRW", localCurrency: "JPY", plannedRate: "920" }, p),
  { ok: true, value: { currency: "KRW", totalAmount: 1_000_000, localCurrency: "JPY", plannedRate: "9.2" } });
assert.deepEqual(parseBudgetSettings({ totalAmount: "80000", currency: "JPY", localCurrency: "", plannedRate: "" }, p),
  { ok: true, value: { currency: "JPY", totalAmount: 80000, localCurrency: null, plannedRate: null } });
assert.equal(parseBudgetSettings({ totalAmount: "", currency: "KRW", localCurrency: "", plannedRate: "" }, p).errors.totalAmount, "총 예산을 적어 주세요.");
assert.equal(parseBudgetSettings({ totalAmount: "1", currency: "XXX", localCurrency: "", plannedRate: "" }, p).errors.currency, "통화를 다시 골라 주세요.");
assert.equal(parseBudgetSettings({ totalAmount: "1", currency: "KRW", localCurrency: "KRW", plannedRate: "1" }, p).errors.localCurrency, "현지 통화는 예산 통화와 달라야 해요.");
assert.equal(parseBudgetSettings({ totalAmount: "1", currency: "KRW", localCurrency: "JPY", plannedRate: "" }, p).errors.plannedRate, "현지 통화를 쓰려면 예정 환율을 적어 주세요.");

const amt = (o) => ({ ...EMPTY_AMOUNT_FIELDS, ...o });
assert.deepEqual(parseAmountFields(amt({ estimateAmount: "5,000", estimateCurrency: "JPY" }), allowed, p, opts),
  { ok: true, value: { estimate: { amount: 5000, currency: "JPY" }, actual: null, actualTouched: true } });
assert.deepEqual(parseAmountFields(amt({ actualAmount: "6800", actualCurrency: "JPY" }), allowed, p, opts).value.actual,
  { amount: 6800, currency: "JPY", paidOn: "2026-11-21", rateField: "" });
assert.deepEqual(parseAmountFields(amt({ actualAmount: "6800", actualCurrency: "JPY", actualPaidOn: "2026-11-01", actualRate: "931" }), allowed, p, opts).value.actual,
  { amount: 6800, currency: "JPY", paidOn: "2026-11-01", rateField: "9.31" });
assert.deepEqual(parseAmountFields(amt({ actualAmount: "9000", actualCurrency: "KRW", actualRate: "1" }), allowed, p, opts).value.actual,
  { amount: 9000, currency: "KRW", paidOn: null, rateField: undefined });
assert.equal(parseAmountFields(amt({ actualAmount: "1", actualCurrency: "JPY" }), allowed, p, { ...opts, actualShown: false }).value.actualTouched, false);
assert.equal(parseAmountFields(amt({ estimateAmount: "1", estimateCurrency: "USD" }), allowed, p, opts).errors.estimateCurrency, "통화를 다시 골라 주세요.");
assert.equal(parseAmountFields(amt({ estimateAmount: "1.5", estimateCurrency: "KRW" }), allowed, p, opts).errors.estimateAmount, "소수점 없이 적어 주세요.");
assert.equal(parseAmountFields(amt({ actualAmount: "1", actualCurrency: "JPY", actualPaidOn: "2026-13-01" }), allowed, p, opts).errors.actualPaidOn, "결제일을 다시 골라 주세요.");

const extra = (o) => ({ ...EMPTY_AMOUNT_FIELDS, title: "항공권 왕복", date: "", ...o });
const days = { tripDates: ["2026-11-21", "2026-11-22"] };
assert.equal(parseExtraItem(extra({ estimateAmount: "420000", estimateCurrency: "KRW" }), allowed, p, { ...opts, ...days }).value.date, null);
assert.equal(parseExtraItem(extra({ title: " ", estimateAmount: "1", estimateCurrency: "KRW" }), allowed, p, { ...opts, ...days }).errors.title, "이름을 적어 주세요.");
assert.equal(parseExtraItem(extra({ title: "a".repeat(101), estimateAmount: "1", estimateCurrency: "KRW" }), allowed, p, { ...opts, ...days }).errors.title, "이름은 100자까지 적을 수 있어요.");
assert.equal(parseExtraItem(extra({}), allowed, p, { ...opts, ...days }).errors.estimateAmount, "예상이나 실제 중 하나는 적어 주세요.");
assert.equal(parseExtraItem(extra({ date: "2026-12-01", estimateAmount: "1", estimateCurrency: "KRW" }), allowed, p, { ...opts, ...days }).errors.date, "날짜를 다시 골라 주세요.");
```

```js
// src/lib/fx.test.mjs
import assert from "node:assert/strict";
import { frankfurterUrl, parseFrankfurterRate } from "./fx.ts";
assert.equal(frankfurterUrl("2026-11-14", "JPY", "KRW"), "https://api.frankfurter.dev/v1/2026-11-14?base=JPY&symbols=KRW");
assert.deepEqual(parseFrankfurterRate({ amount: 1, base: "JPY", date: "2026-11-13", rates: { KRW: 9.2345 } }, "KRW"), { rate: "9.2345", rateDate: "2026-11-13" });
assert.deepEqual(parseFrankfurterRate({ amount: 1, base: "KRW", date: "2026-11-13", rates: { IDR: 1.5e-7 } }, "IDR"), { rate: "0.00000015", rateDate: "2026-11-13" });
for (const bad of [null, {}, { date: "2026-11-13", rates: {} }, { date: "x", rates: { KRW: 9 } }, { date: "2026-11-13", rates: { KRW: 0 } }, { date: "2026-11-13", rates: { KRW: "9" } }])
  assert.equal(parseFrankfurterRate(bad, "KRW"), null);
```

- [ ] **Step 2: 실패 확인** — `node --test src/lib/budget-input.test.mjs src/lib/fx.test.mjs` → 모듈 없음 FAIL.
- [ ] **Step 3: 구현** — 위 문구 그대로. 날짜 형식 검사는 `isValidIsoDate` 와 같은 규칙을 이 파일에 다시 둔다(순수 모듈 규칙). 실제 금액이 빈칸이면 `actual: null`(통화·결제일·환율 칸은 무시). 통화 칸이 빈칸이면 현지 통화가 있으면 현지, 없으면 예산 통화로 본다. `parseFrankfurterRate` 는 `toFixed(10)` 뒤 끝 0 제거로 지수 표기를 푼다.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS.
- [ ] **Step 5: 커밋** — `git commit -m "예산: 입력 검증과 환율 응답 해석 (#14)"`

---

### Task 3: 스키마와 마이그레이션 0006 (사람 승인 시작)

**Files:**
- Modify: `src/db/schema.ts` (맨 아래에 `trip_budgets`·`budget_items`)
- Create: `drizzle/0006_*.sql`, `drizzle/meta/*` (생성됨)

**Interfaces:**
- Produces: `tripBudgets`, `budgetItems` 테이블 객체와 `type TripBudget = typeof tripBudgets.$inferSelect`, `type BudgetItem = typeof budgetItems.$inferSelect`. 칸 이름(JS): `tripId, currency, totalAmount, localCurrency, plannedRate` / `id, tripId, scheduleItemId, title, date, estimateAmount, estimateCurrency, actualAmount, actualCurrency, actualPaidOn, actualRate, actualRateSource, createdAt, updatedAt`.

- [ ] **Step 1: `schema.ts` 에 테이블 추가** — 칸·타입·제약은 설계 §5.1 표 그대로. `bigint(…, { mode: "number" })`, `numeric(…, { precision: 20, scale: 10 })`. check 이름과 조건:
  - `trip_budgets_currency_check`: `currency ~ '^[A-Z]{3}$'`, `trip_budgets_local_currency_check`: `local_currency is null or (local_currency ~ '^[A-Z]{3}$' and local_currency <> currency)`, `trip_budgets_total_check`: `total_amount >= 0 and total_amount < 1000000000000`, `trip_budgets_rate_check`: `(local_currency is null and planned_rate is null) or (local_currency is not null and planned_rate > 0)`
  - `budget_items_link_check`: `(schedule_item_id is not null and title is null and date is null) or (schedule_item_id is null and title is not null)`
  - `budget_items_estimate_check`: `(estimate_amount is null and estimate_currency is null) or (estimate_amount >= 0 and estimate_amount < 1000000000000 and estimate_currency ~ '^[A-Z]{3}$')`
  - `budget_items_actual_check`: 같은 모양으로 `actual_amount`·`actual_currency`
  - `budget_items_rate_check`: `(actual_rate is null and actual_rate_source is null and actual_paid_on is null) or (actual_amount is not null and actual_rate > 0 and actual_rate_source in ('ecb','manual','planned') and actual_paid_on is not null)`
  - `budget_items_some_amount_check`: `estimate_amount is not null or actual_amount is not null`
  - 인덱스: `budget_items_trip_id_idx (trip_id)`, 유니크 `budget_items_schedule_item_idx (schedule_item_id)`(on conflict 대상).
  - 테이블 위 주석: 금액은 최소 단위, 환율은 "현지 1 = 예산 몇", 일정이 지워지면 금액도 지운다(§5.1).
- [ ] **Step 2: 생성** — `npm run db:generate` → `drizzle/0006_*.sql` 에 `CREATE TABLE` 두 개, FK, 인덱스, check 만 있고 기존 테이블 `ALTER`/`DROP` 이 없는지 확인.
- [ ] **Step 3: 확인** — `npm run lint && npm run typecheck` → 통과.
- [ ] **Step 4: 커밋·push·승인 요청** — `git add src/db/schema.ts drizzle && git commit -m "예산 테이블 trip_budgets·budget_items (마이그레이션 0006, #14)"` → push. PR #50 본문 맨 위에 "사람 확인 필요: 마이그레이션 0006(새 테이블 둘, 파괴적 아님)"과 SQL 전문을 넣고, 사용자에게 SQL 확인과 `human-approved` 라벨을 요청한다. 라벨이 붙으면 **실행 직전 사용자 확인** 뒤 `npm run db:migrate`(새 테이블만 생겨 지금 배포된 코드에 영향 없음). 이후 작업은 `schema.ts`·`drizzle/` 를 바꾸지 않는다(바꾸면 게이트가 라벨을 뗀다). 승인을 기다리는 동안 Task 4 부터 계속한다.

---

### Task 4: 예산 쿼리

**Files:**
- Create: `src/db/queries/budget.ts`

**Interfaces:**
- Consumes: Task 3 테이블, `accessibleTrips(userId)`(`./trips`), `isUuid`, Task 1 타입 `BudgetSettings`, `ActualMoney`, `Money`.
- Produces (모두 `import "server-only"`, 첫 인자 `userId`):
  - `getTripBudget = cache(async (userId, tripId) => BudgetSettings | null)`
  - `listBudgetItems = cache(async (userId, tripId) => BudgetItem[])` (만든 순서, id 순)
  - `getBudgetItemForSchedule(userId, tripId, scheduleItemId): Promise<BudgetItem | null>`
  - `getExtraItem(userId, tripId, itemId): Promise<BudgetItem | null>` (일정 밖 행만)
  - `countBudgetItems(userId, tripId): Promise<number>`, `MAX_BUDGET_ITEMS_PER_TRIP = 300`
  - `upsertTripBudget(userId, tripId, settings: BudgetSettings): Promise<"ok" | "locked" | "missing">`
  - `type AmountWrite = { estimate: Money | null; actual: ActualMoney | null }`
  - `setScheduleItemAmounts(userId, tripId, scheduleItemId, amounts: AmountWrite): Promise<boolean>`
  - `setScheduleItemActual(userId, tripId, scheduleItemId, actual: ActualMoney | null): Promise<boolean>`
  - `undoScheduleItemAndClearActual(userId, tripId, scheduleItemId): Promise<boolean>`
  - `createExtraItem(userId, tripId, input: { title: string; date: string | null } & AmountWrite): Promise<string | null>`
  - `updateExtraItem(userId, tripId, itemId, input: same): Promise<boolean>`
  - `deleteExtraItem(userId, tripId, itemId): Promise<boolean>`

- [ ] **Step 1: 읽기 쿼리** — `places.ts` 의 `accessibleTripIds`·`placeInAccessibleTrip` 모양을 따른다. `getTripBudget` 의 `plannedRate` 는 `normalizeRate` 로 정리한다.
- [ ] **Step 2: `upsertTripBudget`** — 한 문(`db.execute(sql\`…\`)`): 접근 가능한 여행 행을 고르는 CTE → `INSERT INTO trip_budgets … SELECT … WHERE NOT EXISTS (막는 행)` `ON CONFLICT (trip_id) DO UPDATE SET …, updated_at = now()` `RETURNING trip_id`. 막는 행(설계 §5.2): 같은 여행의 `budget_items` 중 (지금 저장된 `trip_budgets.currency` ≠ 새 `currency`) 이거나 (`estimate_currency` 또는 `actual_currency` 가 새 `{currency, localCurrency}` 에 없음). 0행이면 `getTrip` 으로 여행이 보이면 `"locked"`, 아니면 `"missing"`.
- [ ] **Step 3: 일정 금액 쓰기** — `setScheduleItemAmounts`: 둘 다 null 이면 그 일정의 행을 지운다(일정이 접근 가능한 여행 `tripId` 의 것일 때만, 지울 행이 없어도 일정이 보이면 true). 아니면 `INSERT … SELECT FROM schedule_items si JOIN trip_budgets tb ON tb.trip_id = si.trip_id WHERE si.id = $sid AND si.trip_id = $trip AND <접근 조건> AND <각 통화 ∈ (tb.currency, tb.local_currency)>` `ON CONFLICT (schedule_item_id) DO UPDATE SET` 예상·실제 칸 모두 `RETURNING id`. `setScheduleItemActual` 은 같은 조건으로 실제 칸만 upsert, `null` 이면 데이터를 바꾸는 CTE 로 "예상이 있으면 실제 칸만 비우고, 없으면 행을 지움". `undoScheduleItemAndClearActual`: `WITH s AS (UPDATE schedule_items SET done = false WHERE <itemCondition> RETURNING id), d AS (DELETE FROM budget_items WHERE schedule_item_id IN (SELECT id FROM s) AND estimate_amount IS NULL), u AS (UPDATE budget_items SET actual_* = NULL WHERE schedule_item_id IN (SELECT id FROM s) AND estimate_amount IS NOT NULL) SELECT id FROM s` → 행이 있으면 true. (같은 행을 두 번 바꾸지 않도록 d·u 조건이 겹치지 않는다.)
- [ ] **Step 4: 일정 밖 항목** — 넣기는 `trip_budgets` 가 있는 접근 가능한 여행에서만, 통화 조건 같음. 고치기·지우기는 `id`·`trip_id`·`schedule_item_id IS NULL`·접근 조건을 한 where 에.
- [ ] **Step 5: 확인** — `npm run typecheck && npm run lint`. 쿼리는 Task 3 마이그레이션이 적용된 뒤 Task 10 에서 실제 DB 로 확인한다(적용 전이면 시험 행 스크립트를 미룬다).
- [ ] **Step 6: 커밋** — `git commit -m "예산 쿼리 (#14)"`

---

### Task 5: 결제일 환율 받기

**Files:**
- Create: `src/lib/fx-api.ts`

**Interfaces:**
- Consumes: Task 2 `frankfurterUrl`, `parseFrankfurterRate`.
- Produces: `getEcbRate(date: string, from: string, to: string): Promise<{ rate: string; rateDate: string } | null>` — 절대 reject 하지 않는다.

- [ ] **Step 1: 구현** — `holidays-api.ts` 구조 그대로: 안쪽 `async function ecbRate(date, from, to)` 에 `"use cache"` + `cacheLife("max")`(지난 날짜 환율은 바뀌지 않음), `fetch(url, { signal: AbortSignal.timeout(5000) })`, 응답이 아니거나 해석 실패면 `console.warn("[fx] …")` 후 throw(실패는 캐시하지 않기 위해). 바깥 `getEcbRate` 가 잡아 `null`.
- [ ] **Step 2: 실패 경로 확인** — 클라우드 세션에서 `npm run dev` 로 띄우지 않고 확인할 방법이 없으므로 Task 6 시험과 Task 10 브라우저(403 → 예정 환율)로 확인한다. 여기서는 `npm run typecheck`.
- [ ] **Step 3: 커밋** — `git commit -m "결제일 기준환율 받기 (#14)"`

---

### Task 6: 예산 Server Action

**Files:**
- Create: `src/app/trips/budget-actions.ts`, `src/app/trips/budget-rate.ts`
- Modify: `src/app/trips/messages.ts`

**Interfaces:**
- Consumes: Task 1·2 순수 함수, Task 4 쿼리, Task 5 `getEcbRate`, `todayInSeoul()`(`@/lib/trip-dates`).
- Produces:
  - `messages.ts`: `BUDGET_CURRENCY_LOCKED = "이미 적은 금액이 있어 통화를 바꿀 수 없어요."`, `BUDGET_ITEM_LIMIT = "항목은 한 여행에 300개까지 넣을 수 있어요."`, `MONEY_SAVE_FAILED = "일정은 저장했지만 금액은 저장하지 못했어요."`, `BUDGET_NOT_SET = "예산을 먼저 정해 주세요."`
  - `budget-rate.ts`(server-only): `resolveActualRate(actual: { amount: number; currency: string; paidOn: string | null; rateField: string | undefined }, previous: ActualMoney | null, settings: BudgetSettings): Promise<ActualMoney>` — `decideRate` 결과대로: `none` → 환율·결제일·출처 null, `keep`/`manual` → 그 값, `planned` → `settings.plannedRate`·`planned`, `fetch` → `getEcbRate(paidOn, local, budget)` 성공이면 `ecb`, 실패면 `planned`. `paidOn` 이 null 인 현지 통화(체크칸 빠른 입력)는 부르는 쪽이 일정 날짜를 넣는다.
  - `budgetActionMoneyParsers: MoneyParsers`(같은 파일, Task 1 함수 묶음)
  - `budget-actions.ts`("use server"):
    - `type BudgetSettingsFormState = { values: BudgetSettingsFields; errors: Partial<Record<keyof BudgetSettingsFields, string>>; formError: string | null; savedAt: number | null }`
    - `saveBudgetSettingsAction(tripId: string, prev: BudgetSettingsFormState, formData: FormData): Promise<BudgetSettingsFormState>` — `"locked"` → `formError: BUDGET_CURRENCY_LOCKED`, `"missing"` → `notFound()`
    - `type ExtraItemFormState = { values: ExtraItemFields; errors: …; formError: string | null; savedAt: number | null }`
    - `createExtraItemAction(tripId: string, prev: ExtraItemFormState, formData: FormData)`, `updateExtraItemAction(tripId: string, itemId: string, prev, formData)`, `deleteExtraItemAction(tripId: string, itemId: string): Promise<void>`
    - `setScheduleItemActualAction(tripId: string, itemId: string, amountText: string, currency: string): Promise<{ ok: true } | { ok: false; error: string }>` — 검증 오류는 그 문구, 대상 없음·저장 실패는 `SAVE_FAILED`
    - `undoScheduleItemWithActualAction(tripId: string, itemId: string): Promise<{ ok: boolean }>`

- [ ] **Step 1: `messages.ts` 상수 추가**, **Step 2: `budget-rate.ts`**, **Step 3: `budget-actions.ts`** — 각 action 은 Global Constraints 순서. 일정 밖 항목 넣기는 `countBudgetItems ≥ 300` 이면 `formError: BUDGET_ITEM_LIMIT`(쓰기 전에). 고치기의 `previous` 는 `getExtraItem`, 실제 지출 칸의 `previous` 는 `getBudgetItemForSchedule`. 설정이 없으면 `formError: BUDGET_NOT_SET`. 문자열 아닌 bind 값은 빈 값으로 본다(`schedule-actions.ts` 의 `readScheduleFields` 방식). 성공하면 `revalidatePath`.
- [ ] **Step 4: 확인** — `npm run typecheck && npm run lint && node --test 'src/**/*.test.mjs'`.
- [ ] **Step 5: 커밋** — `git commit -m "예산 설정·일정 밖 항목·실제 지출 Server Action (#14)"`

---

### Task 7: 지도 탭 예산 카드

**Files:**
- Create: `src/app/trips/[id]/budget-data.ts`(server-only), `src/app/trips/[id]/budget-card.tsx`("use client"), `src/app/trips/[id]/budget-forms.tsx`("use client")
- Modify: `src/app/trips/[id]/map-section.tsx`, `src/app/trips/[id]/trip-map-panel.tsx`, `src/app/trips/[id]/page.tsx`(`예산(#14)` 주석 삭제)

**Interfaces:**
- Consumes: Task 1 `summarizeBudget`·`totalsByPeriod`·`formatMoney`, Task 4 `getTripBudget`·`listBudgetItems`, `listScheduleItems`, Task 6 actions.
- Produces:
  - `budget-data.ts`: `loadBudget(userId: string, trip: Trip): Promise<LoadedBudget | null>` — `type LoadedBudget = { settings: BudgetSettings; lines: BudgetLine[]; bySchedule: Map<string, BudgetLine> }`. 설정이 없으면 `null`. 일정에 붙은 행의 `date` 는 `listScheduleItems` 의 그 일정 날짜(일정 칸과 같은 cache 결과).
  - `type PanelBudget = { settings: BudgetSettings; summary: BudgetSummary; periods: ReturnType<typeof totalsByPeriod>; extras: { id: string; title: string; date: string | null; estimate: Money | null; actual: ActualMoney | null }[] } | null` (`map-types.ts` 에 둔다) — `TripMapPanel` 의 새 prop `budget: PanelBudget`, `tripStart`·`tripEnd` 는 이미 `days` 에 있음.
  - `BudgetCard({ tripId, budget, tab, days, onSelectTab })`

- [ ] **Step 1: `budget-data.ts`·`map-section.tsx`** — `map-section` 이 `loadBudget` 로 `PanelBudget` 을 만들어 넘긴다(돈 계산은 서버에서, 카드는 받은 숫자만 그린다).
- [ ] **Step 2: `trip-map-panel.tsx`** — `DayTabs` 바로 아래(지도 유무와 관계없이) `<BudgetCard … tab={day?.date ?? "all"} onSelectTab={selectTab} />`.
- [ ] **Step 3: `budget-card.tsx`** — 설계 §5.7.1 의 세 상태 그대로: 예산 없음([전체]만 안내+[예산 정하기], N일차는 아무것도 없음) / [전체](총 예산, 예상 총지출과 초과(빨강 `text-red-600`)·여유(초록 `text-emerald-600`), "실제 적은 것 … (그 항목들 예상보다 X 더 · 계획에 없던 지출 Y 포함)", 남은 예상, 계획 합계, 날짜별 표(누르면 `onSelectTab(date)`), 여행 기간 밖, 여행 전체 항목 + "+ 항목 추가", "설정") / [N일차](§5.7.1 의 두 줄, 일정 밖 지출 + "+ 지출 추가"). `hasActual` 이 false 면 "계획 합계 … · 총 예산보다 X 초과/여유" 한 줄이 맨 위. "더/덜"·"초과/여유"는 부호로 정한다(0 이면 "예상대로", 잔액 0 이면 "딱 맞아요"). 카드 안 열린 양식은 한 번에 하나.
- [ ] **Step 4: `budget-forms.tsx`** — `BudgetSettingsForm`(총 예산·예산 통화 select·현지 통화 select "없음"+목록·예정 환율 "¥100 = ₩[ ]"(현지 rateUnit 기준, 현지 통화가 있을 때만)), `ExtraItemForm`(이름·날짜 select("여행 전체"+여행 날짜, N일차에서 열면 그날 기본)·예상·실제·(실제가 현지 통화면) 결제일·환율 칸, 고치기는 "삭제"). `ScheduleItemForm` 처럼 `useActionState` + 오류 문구, 열 때 첫 칸 초점, 저장하면 닫힘. 통화 select 는 예산·현지 둘 중 하나(현지 없으면 select 없이 숨은 값).
- [ ] **Step 5: 확인** — `npm run typecheck && npm run lint`. 화면은 Task 10 에서.
- [ ] **Step 6: 커밋** — `git commit -m "지도 탭 예산 카드 (#14)"`

---

### Task 8: 일정 양식의 예상·실제 칸

**Files:**
- Modify: `src/lib/schedule-input.ts`(필드·상태 형만), `src/lib/schedule-input.test.mjs`, `src/app/trips/schedule-actions.ts`, `src/app/trips/[id]/schedule-item-form.tsx`, `src/app/trips/[id]/schedule-editor.tsx`, `src/app/trips/[id]/schedule-section.tsx`

**Interfaces:**
- Consumes: Task 2 `parseAmountFields`·`AmountFields`, Task 4 `setScheduleItemAmounts`·`getBudgetItemForSchedule`·`getTripBudget`, Task 6 `resolveActualRate`, `MONEY_SAVE_FAILED`, Task 7 `loadBudget`.
- Produces:
  - `ScheduleFields` 에 `AmountFields` 의 여섯 칸 추가(`EMPTY_SCHEDULE_FIELDS` 는 빈칸). `parseScheduleInput` 은 이 칸을 읽지 않는다.
  - `ScheduleFormState` 에 `notice: string | null`(저장은 됐지만 알릴 것).
  - `RowItem` 에 `estimate: Money | null`, `actual: ActualMoney | null`.
  - `ScheduleEditorProvider` 새 prop `budget: { currency: string; localCurrency: string | null } | null` → context `budget`.

- [ ] **Step 1: 시험 고치기** — `schedule-input.test.mjs` 의 `valid` 에 여섯 칸 `""` 추가, 새 시험: `parseScheduleInput({ ...valid, estimateAmount: "abc" }, range).ok === true`(일정 검증은 금액을 보지 않는다). `node --test src/lib/schedule-input.test.mjs` → 새 필드 없어서 typecheck 는 아직 실패할 수 있음, 시험은 PASS 여야 한다.
- [ ] **Step 2: `schedule-input.ts` 형 추가** → typecheck 로 고칠 곳 찾기.
- [ ] **Step 3: `schedule-actions.ts`** — `readScheduleFields` 가 여섯 칸도 읽는다. 추가·고치기 모두: 일정 검증 뒤 `getTripBudget` 이 있으면 `parseAmountFields(…, { actualShown: <고치기에서 그 일정이 완료됐거나 실제가 있음>, defaultPaidOn: 일정 날짜 })` — 오류가 있으면 일정도 저장하지 않고 errors 에 합쳐 돌려준다. 일정 쓰기가 끝난 뒤, 금액이 이전 행(`getBudgetItemForSchedule`, 고치기만)과 다를 때만 `resolveActualRate` → `setScheduleItemAmounts`(`actualTouched` 가 false 면 이전 실제를 그대로 넘긴다). 금액 쓰기가 throw 하거나 false 면: 추가 → 지금처럼 빈 양식(`savedAt: Date.now()`)에 `notice: MONEY_SAVE_FAILED`, 고치기 → `savedAt: prev.savedAt`(양식 열린 채), `formError: MONEY_SAVE_FAILED`, values 그대로(다시 저장해도 같은 결과). 설정이 없으면 금액 칸을 무시한다.
- [ ] **Step 4: 양식** — `schedule-item-form.tsx` 에 `budget` 과 `showActual: boolean` prop. 예산 있으면 메모 칸 위에 "예상 비용 [금액] [통화]", `showActual` 이면 "실제 지출 [금액] [통화]" 와 (현지 통화 고르면) 작게 결제일·환율(빈칸 placeholder "결제일 기준환율로 자동", 저장된 값이 있으면 그 값과 출처 문구 "기준환율"/"직접 넣은 환율"/"예정 환율"). 예산 없으면 그 자리에 "예산을 정하면 예상 비용을 적을 수 있어요" 한 줄. `ScheduleItemForm` 바깥 컴포넌트가 추가 모드에서 직전 `notice` 를 들고 새 양식 위에 보인다(`role="status"`).
- [ ] **Step 5: 데이터 넘기기** — `schedule-section.tsx` 가 `loadBudget` 으로 `RowItem.estimate/actual` 과 provider `budget` 을 채운다. 고치기 양식 기본값은 `amountInputValue`·`rateInputValue`.
- [ ] **Step 6: 확인** — `node --test 'src/**/*.test.mjs' && npm run typecheck && npm run lint`.
- [ ] **Step 7: 커밋** — `git commit -m "일정 양식에서 예상·실제 금액 (#14)"`

---

### Task 9: 완료 체크칸 → 실제 지출 칸, 해제 확인

**Files:**
- Modify: `src/app/trips/[id]/schedule-editor.tsx`

**Interfaces:**
- Consumes: Task 6 `setScheduleItemActualAction`, `undoScheduleItemWithActualAction`, Task 8 context `budget`·`RowItem.estimate/actual`, Task 1 `formatMoney`·`amountInputValue`.
- Produces: `ActualEntry({ tripId, item, onClose })`(같은 파일 안 컴포넌트), openKey `"actual:<일정 id>"`.

- [ ] **Step 1: 켜기** — `toggleDone` 에서 `next === true` 이고 `budget !== null` 이면 지금 낙관 저장을 그대로 하고 `setOpenKey("actual:" + id)`. 줄 아래(이름·장소·메모 칸 안, 오류 문구 위)에 `ActualEntry`: "실제 지출" 라벨 + 금액 칸(처음 값: `actual` → `estimate` → 빈칸, `amountInputValue`) + 통화 select(현지 통화 있을 때만, 처음 값 같은 순서, 없으면 현지 우선) + "저장"·"건너뛰기". 저장은 `setScheduleItemActualAction` → 성공이면 닫힘, 실패면 칸 아래 오류. 건너뛰기·다른 칸 열기는 닫기만. 금액 칸에 초점.
- [ ] **Step 2: 끄기** — `next === false` 이고 `item.actual !== null` 이면 `window.confirm(\`완료를 풀면 적어 둔 실제 지출 ${formatMoney(item.actual.amount, item.actual.currency)}도 지워져요. 계속할까요?\`)`. 취소면 아무것도 안 함. 확인이면 낙관 갱신으로 `setOptimisticDone(false)` + `undoScheduleItemWithActualAction`, 실패면 지금과 같은 `SAVE_FAILED`. 실제가 없으면 지금 코드 그대로.
- [ ] **Step 3: 확인** — `npm run typecheck && npm run lint`.
- [ ] **Step 4: 커밋** — `git commit -m "완료 체크로 실제 지출 적기, 해제 확인 (#14)"`

---

### Task 10: 확인·리뷰·PR

**Files:**
- Modify: `docs/status.md`(머지·배포 확인 뒤), PR #50 본문

- [ ] **Step 1: 정적 확인** — `npm run lint && npm run typecheck && node --test 'src/**/*.test.mjs'` → 모두 통과(출력 붙여 둔다).
- [ ] **Step 2: 환율 호스트** — `get_environment` 로 환경을 보고, 성공 경로 확인을 위해 `api.frankfurter.dev` 허용을 사용자에게 한 번 요청(`update_environment` 또는 설명에 따라 `create_environment`). 거절하면 실패 → 예정 환율 경로만 확인하고 성공 경로는 프로덕션 확인으로 남긴다.
- [ ] **Step 3: 브라우저(마이그레이션 적용 뒤)** — `status.md` '로그인한 화면의 브라우저 확인' 방법(테스트 계정 넣기·지우기 SQL 은 각각 사용자 확인). `NODE_USE_ENV_PROXY=1 npm run dev`. 확인 목록: [전체] 예산 정하기(원화+엔화, 예정 환율 ¥100=₩920) → 일정 추가 양식에서 예상 ¥5,000 → 체크칸 켜서 실제 ¥6,800 저장 / 건너뛰기 / 실제 있는 일정 끄기(취소·확인) → 고치기 양식에서 결제일·환율 직접 → [전체] 숫자(예상 총지출·초과/여유·날짜별 표·누르면 탭 이동)·[N일차] 숫자·일정 밖 지출 넣기·고치기·지우기 → 통화 바꾸기 거절 문구 → 휴대폰 너비(iPhone 13) → 일정 줄에 금액이 없는지. 지도 키 없는 환경 변수로도 카드가 보이는지.
- [ ] **Step 4: 소유권** — `status.md` '소유권 브라우저 확인' 방법으로 `setScheduleItemActualAction`·`updateExtraItemAction`·`deleteExtraItemAction`·`saveBudgetSettingsAction`·일정 고치기(금액 칸)의 id 를 다른 테스트 사용자 B 의 것으로 바꿔 보내 실패 반응과 B 행 그대로를 DB 로 확인.
- [ ] **Step 5: 리뷰** — `/code-review`, `/security-review`(소유권 쿼리). 막는 지적 기준은 CLAUDE.md '리뷰 종료 기준'.
- [ ] **Step 6: PR** — 본문: "사람 확인 필요"(마이그레이션 0006, SQL 전문, 파괴적 아님), 바뀐 것, 확인한 것, 남은 지적, `Closes #14`. draft 해제 → Codex 리뷰 → 막는 지적 0 이면 (마이그레이션 적용 확인 뒤) 자동 머지(squash). 배포 뒤 사용자 프로덕션 확인, `docs/status.md` 갱신 PR.
