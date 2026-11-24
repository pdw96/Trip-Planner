# 모임 통장·개인 통장 지출 (#89) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행마다 지출 방식(모임 통장 / 각자 / 둘 다)을 고르고, 지출 행마다 "모임 / 내 돈"을 두어 내 돈 지출·내 예산은 본인만 보게 하며, 완료 전에도 실제 지출을 적을 수 있게 한다.

**Architecture:** 기존 `budget_items` 에 `owner_user_id`(null = 모임)를 더하고, `trip_budgets.mode`, 새 `trip_personal_budgets` 를 둔다(설계 §4 A). 모든 지출 쿼리는 `visibleToUser(userId)` 조건 하나를 함께 건다. 화면 데이터는 "지갑"(모임·내 것) 단위로 나뉘어 기존 카드·막대를 지갑마다 한 번씩 그린다.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + Neon (neon-http, 트랜잭션 없음), Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-budget-wallets-design.md`

## Global Constraints

- 사용자에게 보이는 문구는 한국어.
- `src/lib/*.ts` 순수 모듈은 다른 모듈을 import 하지 않는다. 시험은 `src/lib/*.test.mjs`(`npm test`).
- DB 접근은 `src/db/` 로만, 사용자 데이터 쿼리는 첫 인자 `userId`, uuid 가 틀리면 쿼리 전에 `null`/`false`.
- Server Action 순서: `getCurrentUser()` → 필드별 검증 → `userId` 범위 쿼리 → `revalidatePath`. 남의 것과 없는 것은 똑같이 찾을 수 없음.
- neon-http: 여러 행·조건부 쓰기는 한 SQL 문(조건부 insert/update, 데이터를 바꾸는 CTE).
- `drizzle/` 생성물은 손으로 고치지 않는다. 스키마는 `src/db/schema.ts` 만. 마이그레이션은 `npm run db:generate` 로 만들고 **적용하지 않는다**(사람 승인 뒤 `npm run db:migrate`).
- 커밋 전 `npm run lint`, `npm run typecheck`, `npm test` 통과.
- 모드 값: `'shared' | 'personal' | 'both'`. 기본 `'shared'`.
- 통화 잠금 문구는 그대로: `"이미 적은 금액이 있어 통화를 바꿀 수 없어요."`(누가·얼마·몇 건 말하지 않음).
- 일정 밖 항목 상한 `MAX_BUDGET_ITEMS_PER_TRIP = 300` 은 "모임 행 + 내 행"으로 센다.
- `owner_user_id` 는 폼 입력으로 받지 않는다. 서버가 `side`(`"shared" | "mine"`)로 `null` 또는 `user.id` 를 정한다.

## Review Focus

1. **남의 내 돈 행 id 로 고치기·지우기를 보냄** → 찾을 수 없음/실패, DB 행 그대로. (Task 3 쿼리 조건, Task 8 브라우저 확인에서 `page.route` 로 재전송)
2. **각자 여행에서 A 가 공용 일정을 지움** → B 의 내 돈 금액이 B 의 일정 밖 항목으로 남고, A 화면·응답에는 흔적 없음. (Task 4 SQL, Task 8 확인)
3. **B 가 내 예산만 정한 뒤 A 가 예산 통화를 바꿈** → B 카드에 "예산 통화가 바뀌었어요…", 값이 다른 통화로 읽히지 않음. (Task 2 `personalTotalFor` 시험)
4. **낡은 일정 양식(내 돈 칸이 없던 탭)으로 저장** → 그 쪽 금액을 지우지 않음. (Task 5: 쪽마다 `…Shown` 표시가 있을 때만 그 쪽을 읽음)
5. **모임 통장 여행(기존 모든 여행)** → 화면·숫자·흐름이 완료 풀기 확인 창이 없어진 것 말고 그대로. (Task 7·8 화면 확인)

---

### Task 1: 스키마와 마이그레이션 0008

**Files:**
- Modify: `src/db/schema.ts` (`tripBudgets`, `budgetItems`, 새 `tripPersonalBudgets`)
- Create (생성): `drizzle/0008_*.sql`, `drizzle/meta/*`

**Interfaces:**
- Produces: `tripBudgets.mode`(text, not null, default `'shared'`, check `in ('shared','personal','both')`), `tripBudgets.totalAmount` nullable, `budgetItems.ownerUserId`(text null → `user.id` on delete cascade), `tripPersonalBudgets`(`tripId`, `userId`, `totalAmount` bigint not null, `currency` text not null, `createdAt`, `updatedAt`, pk(tripId,userId), checks), 타입 `TripPersonalBudget`.

- [ ] **Step 1:** 설계 §5.2 대로 `schema.ts` 를 고친다. 고유 색인 `budget_items_schedule_item_idx` 를 지우고 부분 고유 색인 둘로: `budget_items_schedule_shared_idx` on (schedule_item_id) where owner_user_id is null, `budget_items_schedule_owner_idx` on (schedule_item_id, owner_user_id) where owner_user_id is not null(drizzle `uniqueIndex(...).on(...).where(sql\`...\`)`). `trip_budgets_total_check` 는 `total_amount is null or (0 이상 10^12 미만)`. `trip_personal_budgets` checks: total 0 이상 10^12 미만, currency `~ '^[A-Z]{3}$'`. 주석에 #89 와 "owner_user_id null = 모임".
- [ ] **Step 2:** `npm run db:generate` → `drizzle/0008_*.sql` 생성. SQL 을 읽어 DROP 은 색인 하나뿐이고 테이블·칸 DROP, 타입 변경, NOT NULL 추가가 없는지 확인(있으면 멈추고 보고).
- [ ] **Step 3:** `npm run typecheck` — `totalAmount` nullable 때문에 `budget.ts` 의 `getTripBudget` 에서 타입 오류가 나는 것은 Task 3 에서 고친다. 이 단계에서는 오류 목록만 확인하고, 임시로 막지 않는다.
- [ ] **Step 4: Commit** `feat(db): #89 지출 주인·여행 방식·사람별 예산 스키마 (0008)`

### Task 2: 순수 규칙 모듈과 입력 검증

**Files:**
- Create: `src/lib/budget-wallets.ts`, `src/lib/budget-wallets.test.mjs`
- Modify: `src/lib/budget.ts` (타입 `CurrencySettings`), `src/lib/budget-input.ts`, `src/lib/budget-input.test.mjs`, `src/lib/schedule-input.ts` (`ScheduleFields` 에 내 돈 칸)

**Interfaces:**
- Produces (`budget-wallets.ts`):
  ```ts
  export type BudgetMode = "shared" | "personal" | "both";
  export type Side = "shared" | "mine";
  export function isBudgetMode(v: unknown): v is BudgetMode;
  export function defaultSide(mode: BudgetMode): Side;           // personal → "mine", 나머지 "shared"
  export function visibleSides(mode: BudgetMode, has: { shared: boolean; mine: boolean }): Side[];
  // 방식의 쪽 ∪ 행이 있는 쪽, 순서는 늘 shared 먼저. 카드(여행 전체 행 유무)와 일정 양식 전환(그 일정 행 유무)에 같이 쓴다.
  export function splitByOwner<T extends { ownerUserId: string | null }>(rows: T[], userId: string):
    { shared: T[]; mine: T[]; dropped: number };
  export function personalTotalFor(row: { totalAmount: number; currency: string } | null, currency: string):
    { total: number | null; stale: { amount: number; currency: string } | null };
  ```
- Produces (`budget.ts`): `export type CurrencySettings = Omit<BudgetSettings, "totalAmount">;`
- Produces (`budget-input.ts`):
  - `BudgetSettingsFields` 에 `mode: string; myTotal: string` 추가(`EMPTY_…` 는 `mode: "shared"`, `myTotal: ""`).
  - `parseBudgetSettings(f, p, ctx: { currentMode: BudgetMode; canChangeMode: boolean })` → `value: { currency; localCurrency; plannedRate; mode: BudgetMode; sharedTotal: number | null; myTotal: number | null }`. (`budget-input.ts` 는 `budget-wallets.ts` 를 import 하지 않는다 — 모드 문자열 검사는 안에서 직접.)
  - `ExtraItemFields` 에 `side: string`, `parseExtraItem` 결과 `value.side: Side`.
  - `export function parseSide(text: string): Side | null`.
- Produces (`schedule-input.ts`): `ScheduleFields` 에 `mineEstimateAmount`, `mineEstimateCurrency`, `mineActualAmount`, `mineActualCurrency`, `mineActualPaidOn`, `mineActualRate` (모두 string). 검증은 기존 `parseAmountFields` 를 쪽마다 부른다(Task 5).

- [ ] **Step 1: 실패하는 시험 쓰기** (`budget-wallets.test.mjs`)
  ```js
  test("visibleSides: 방식의 쪽과 행이 남은 쪽", () => {
    assert.deepEqual(visibleSides("shared", { shared: false, mine: false }), ["shared"]);
    assert.deepEqual(visibleSides("personal", { shared: false, mine: false }), ["mine"]);
    assert.deepEqual(visibleSides("both", { shared: false, mine: false }), ["shared", "mine"]);
    assert.deepEqual(visibleSides("personal", { shared: true, mine: false }), ["shared", "mine"]);
    assert.deepEqual(visibleSides("shared", { shared: false, mine: true }), ["shared", "mine"]);
  });
  test("splitByOwner: 남의 행은 버리고 센다", () => {
    const r = splitByOwner([{ ownerUserId: null }, { ownerUserId: "me" }, { ownerUserId: "other" }], "me");
    assert.equal(r.shared.length, 1); assert.equal(r.mine.length, 1); assert.equal(r.dropped, 1);
  });
  test("personalTotalFor: 통화가 바뀌면 stale", () => {
    assert.deepEqual(personalTotalFor(null, "KRW"), { total: null, stale: null });
    assert.deepEqual(personalTotalFor({ totalAmount: 1_000_000, currency: "KRW" }, "KRW"), { total: 1_000_000, stale: null });
    assert.deepEqual(personalTotalFor({ totalAmount: 1_000_000, currency: "KRW" }, "USD"),
      { total: null, stale: { amount: 1_000_000, currency: "KRW" } });
  });
  test("defaultSide", () => { assert.equal(defaultSide("personal"), "mine"); assert.equal(defaultSide("both"), "shared"); });
  ```
  `budget-input.test.mjs` 에 더할 것:
  ```js
  // 주인이 아니면 보낸 mode 를 무시하고 지금 방식
  parseBudgetSettings(settings({ mode: "personal" }), p, { currentMode: "shared", canChangeMode: false }).value.mode === "shared"
  // 주인이 틀린 mode → errors.mode === "방식을 골라 주세요."
  // personal: 모임 총액 빈칸 허용 → sharedTotal === null; shared/both: 빈칸 → errors.totalAmount === "총 예산을 적어 주세요."
  // myTotal: shared 방식이면 무시(null), personal/both 빈칸 → null, "50000" → 50000, "abc" → errors.myTotal
  // parseSide("mine") === "mine", parseSide("x") === null
  // parseExtraItem 에 side: "x" → errors.side === "어느 돈인지 골라 주세요."
  ```
- [ ] **Step 2:** `npm test` → 새 시험 FAIL 확인.
- [ ] **Step 3:** 위 시그니처대로 구현. 기존 `parseBudgetSettings` 호출부의 타입 오류는 Task 5 에서 고친다.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(budget): #89 지갑 규칙과 방식·내 예산·쪽 입력 검증`

### Task 3: 예산 쿼리 (`src/db/queries/budget.ts`)

**Files:**
- Modify: `src/db/queries/budget.ts`

**Interfaces:**
- Consumes: Task 1 스키마, Task 2 `BudgetMode`, `Side`, `CurrencySettings`.
- Produces:
  ```ts
  export type TripBudgetConfig = CurrencySettings & {
    mode: BudgetMode; sharedTotal: number | null;
    myBudget: { totalAmount: number; currency: string } | null; isOwner: boolean;
  };
  export const getTripBudget: (userId: string, tripId: string) => Promise<TripBudgetConfig | null>; // cache
  export const listBudgetItems: (userId, tripId) => Promise<BudgetItem[]>;   // cache, visibleToUser
  export function getScheduleBudgetRows(userId, tripId, scheduleItemId): Promise<{ shared: BudgetItem | null; mine: BudgetItem | null }>;
  export function getExtraItem(userId, tripId, itemId): Promise<BudgetItem | null>;   // visibleToUser
  export function countBudgetItems(userId, tripId): Promise<number>;                   // visibleToUser
  export function upsertTripBudget(userId, tripId, input: CurrencySettings & { sharedTotal: number | null; mode: BudgetMode }): Promise<"ok" | "locked" | "missing">;
  export function setPersonalBudget(userId, tripId, total: number | null): Promise<boolean>;
  export function setScheduleItemAmounts(userId, tripId, scheduleItemId, side: Side, amounts: AmountWrite): Promise<boolean>;
  export function setScheduleItemActual(userId, tripId, scheduleItemId, side: Side, actual: ActualMoney | null): Promise<boolean>;
  export function createExtraItem(userId, tripId, side: Side, input: ExtraItemWrite): Promise<string | null>;
  // updateExtraItem, deleteExtraItem: 시그니처 그대로, 조건에 visibleToUser
  // undoScheduleItemAndClearActual: 지운다
  ```
  `getBudgetItemForSchedule` 은 `getScheduleBudgetRows` 로 바뀐다.

- [ ] **Step 1:** `visibleToUser(userId): SQL`(drizzle) 과 `visibleToUserSql(alias: string, userId)`(원시 SQL 조각, 예: `b.owner_user_id IS NULL OR b.owner_user_id = $userId`)을 파일 위쪽에 두고, 주석에 "지출 행을 읽거나 쓰는 모든 쿼리가 건다. 보이는 행 = 쓸 수 있는 행" 을 적는다.
- [ ] **Step 2:** 읽기 쿼리(`listBudgetItems`, `getScheduleBudgetRows`, `getExtraItem`, `countBudgetItems`)에 조건 추가. `getTripBudget` 은 `trip_budgets` + `trips.user_id = userId`(isOwner) + `trip_personal_budgets`(user_id = userId) 를 한 문(left join)으로.
- [ ] **Step 3:** `upsertTripBudget`: 넣을 때 `mode` = 주인이면 입력값, 아니면 `'shared'`; 고칠 때 `mode = CASE WHEN <주인> THEN EXCLUDED.mode ELSE trip_budgets.mode END`. `total_amount = EXCLUDED.total_amount`(null 가능). 잠금 검사 `blocked` CTE 는 **모든 행**을 그대로 본다(visibleToUser 를 걸지 않는다 — 주석으로 이유: 남의 숨은 금액의 통화도 지켜야 함, 문구가 아무것도 드러내지 않음).
- [ ] **Step 4:** `setPersonalBudget`: `total === null` 이면 `user_id = userId` 행 삭제(접근 가능한 여행일 때) 후 여행이 보이면 true. 아니면 `INSERT … SELECT tb.trip_id, $userId, $total, tb.currency FROM trip_budgets tb WHERE tb.trip_id = $tripId AND tb.trip_id IN <accessible> ON CONFLICT (trip_id, user_id) DO UPDATE SET total_amount, currency = EXCLUDED.currency, updated_at = now() RETURNING trip_id`.
- [ ] **Step 5:** 일정 금액 쓰기 두 함수: `owner` 값 = `side === "mine" ? userId : null`. 지우기·비우기 `WHERE` 에 `owner_user_id IS NOT DISTINCT FROM $owner`. INSERT 의 `ON CONFLICT` 대상은 부분 색인에 맞게 `(schedule_item_id) WHERE owner_user_id IS NULL` 또는 `(schedule_item_id, owner_user_id) WHERE owner_user_id IS NOT NULL`. `createExtraItem` 도 `owner_user_id` 를 같은 식으로 넣는다. `updateExtraItem`/`deleteExtraItem` 조건에 visibleToUser.
- [ ] **Step 6:** `undoScheduleItemAndClearActual` 삭제.
- [ ] **Step 7:** `npm run typecheck` — 이 파일의 오류 0 (호출부 오류는 Task 5).
- [ ] **Step 8: Commit** `feat(budget): #89 지출 쿼리에 보이는 범위·쪽·내 예산`

### Task 4: 일정 지우기와 나가기·내보내기

**Files:**
- Modify: `src/db/queries/schedule-items.ts` (`deleteScheduleItem`), `src/db/queries/trip-members.ts` (`removeMember`, `leaveTrip`)

**Interfaces:**
- Produces: 시그니처 그대로(`Promise<boolean>`), 동작만 바뀜.

- [ ] **Step 1:** `deleteScheduleItem` 을 데이터를 바꾸는 CTE 한 문으로:
  ```sql
  WITH s AS (SELECT si.id, si.date, COALESCE(si.title, p.label, '지운 일정') AS title
             FROM schedule_items si LEFT JOIN places p ON p.id = si.place_id
             WHERE <itemCondition: id·trip id·accessibleTrips>),
  moved AS (UPDATE budget_items SET schedule_item_id = NULL, title = s.title, date = s.date, updated_at = now()
            FROM s WHERE budget_items.schedule_item_id = s.id AND budget_items.owner_user_id IS NOT NULL
            RETURNING budget_items.id),
  d AS (DELETE FROM schedule_items WHERE id IN (SELECT id FROM s) RETURNING id)
  SELECT id FROM d
  ```
  주의: 같은 문의 CTE 는 같은 스냅숏을 보므로, `d` 의 cascade 가 `moved` 가 바꾼 행을 지우지 않는지 확인한다. cascade 는 문 끝의 FK 트리거로 돌고 그때는 `moved` 가 `schedule_item_id` 를 이미 null 로 바꾼 뒤다. Neon 에서 바로 실행해 볼 수 없으니(적용 전) Task 9 Step 4 에서 꼭 확인하고, 실패하면 `moved` 를 별도 문으로 먼저 실행하도록 바꾼다(그때는 두 문 사이의 경쟁을 주석으로 남김). 돌려주는 값은 `d` 의 id 뿐(남의 행 정보 없음).
  `title` 칸 길이 제한(`EXTRA_TITLE_MAX = 100`)을 넘는 일정 제목이 있을 수 있으면 `LEFT(…, 100)`.
- [ ] **Step 2:** `removeMember`·`leaveTrip` 을 CTE 한 문으로: 멤버 행을 지우고(`RETURNING trip_id, user_id`), 같은 문에서 `budget_items WHERE trip_id = … AND owner_user_id = 그 사람` 과 `trip_personal_budgets WHERE trip_id = … AND user_id = 그 사람` 을 지운다(멤버 행을 실제로 지웠을 때만 — `IN (SELECT … FROM removed)`). 그 사람이 적은 모임 행은 그대로.
- [ ] **Step 3:** `npm run typecheck && npm run lint`.
- [ ] **Step 4: Commit** `feat(budget): #89 일정을 지우면 내 돈 금액은 일정 밖 항목으로, 나가면 내 돈·내 예산 삭제`

### Task 5: Server Action

**Files:**
- Modify: `src/app/trips/budget-actions.ts`, `src/app/trips/schedule-actions.ts`, `src/app/trips/budget-rate.ts`(매개변수 타입을 `CurrencySettings` 로), `src/app/trips/messages.ts`

**Interfaces:**
- Consumes: Task 2·3.
- Produces:
  ```ts
  saveBudgetSettingsAction(tripId, prev, formData)            // 필드에 mode, myTotal
  createExtraItemAction(tripId, prev, formData)               // 필드에 side
  setScheduleItemActualAction(tripId, itemId, side: Side, amountText: string, currency: string)
  // undoScheduleItemWithActualAction: 삭제
  // setScheduleItemDoneAction: 완료 풀기 거절(실제 있으면) 삭제
  ```
  `messages.ts` 에서 `ACTUAL_NEEDS_DONE` 삭제.

- [ ] **Step 1:** `saveBudgetSettingsAction`: `getTrip` + `getTripBudget` 을 읽어 `ctx = { currentMode: config?.mode ?? "shared", canChangeMode: trip.userId === user.id }`. 파싱 뒤 `upsertTripBudget` → `"ok"` 이고 방식이 `shared` 가 아니면 `setPersonalBudget(user.id, tripId, value.myTotal)`(실패하면 `SAVE_FAILED`). `SETTINGS_FIELDS` 에 `mode`, `myTotal`.
- [ ] **Step 2:** `createExtraItemAction`: `side` 를 읽어 `createExtraItem(user.id, tripId, parsed.value.side, …)`. 서버는 두 쪽 모두 받는다(어느 쪽을 보일지는 화면이 정함, 보안 영향 없음 — 주석). `updateExtraItemAction` 은 쪽을 바꾸지 않는다(행의 `owner_user_id` 유지).
- [ ] **Step 3:** `setScheduleItemActualAction`: `side` 인자 검증(`parseSide`, 아니면 `SAVE_FAILED`), `getScheduleBudgetRows` 의 그 쪽 행을 `previous` 로. 완료 여부 검사 삭제(미리 결제). `undoScheduleItemWithActualAction` 삭제. `setScheduleItemDoneAction` 의 "실제가 있으면 완료 풀기 거절" 삭제.
- [ ] **Step 4:** `schedule-actions.ts`: `readScheduleFields` 에 `mine*` 칸. `parseMoney` → 쪽마다 `{ side, amounts }` 목록을 돌려준다: 양식이 보낸 쪽 표시 `sides`(hidden, 예 `"shared,mine"`)에 든 쪽만, 각 쪽 실제 칸은 그 쪽 표시(`actualShown` / `mineActualShown` = `"1"`)가 있을 때만 읽는다(`actualAllowedNow` 조건 삭제 — 완료 풀기가 더는 실제를 지우지 않으므로). 내 돈 쪽은 `mine*` 칸을 `AmountFields` 모양으로 옮겨 `parseAmountFields` 에 넘기고, 오류 키를 `mine*` 로 되돌려 붙인다. `writeMoney` 는 쪽마다 처음 값(`getScheduleBudgetRows`)과 비교해 바뀐 쪽만 `setScheduleItemAmounts(…, side, …)`. 일정 추가는 예상만(지금처럼 `actualShown: false`).
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test` 통과(UI 호출부 오류는 Task 6–7 에서 고치므로, 이 단계 typecheck 는 `src/app/trips/*.ts` 와 `src/db`·`src/lib` 에서 0 이면 된다).
- [ ] **Step 6: Commit** `feat(budget): #89 Server Action — 방식·내 예산·쪽, 미리 결제한 실제`

### Task 6: 화면 데이터 (지갑)

**Files:**
- Modify: `src/app/trips/[id]/budget-data.ts`, `src/app/trips/[id]/map-types.ts`, `src/app/trips/[id]/schedule-section.tsx`, `src/app/trips/[id]/schedule-editor.tsx`(`RowItem`, provider `budget` 타입)

**Interfaces:**
- Produces:
  ```ts
  // budget-data.ts
  export type LoadedBudget = { config: TripBudgetConfig; shared: BudgetLine[]; mine: BudgetLine[];
    bySchedule: Map<string, { shared: BudgetLine | null; mine: BudgetLine | null }> };
  // map-types.ts
  export type PanelWallet = { side: Side; total: number | null; stale: { amount: number; currency: string } | null;
    summary: BudgetSummary; periods: { tripWide: PeriodTotal; byDate: Record<string, PeriodTotal>; outside: PeriodTotal | null };
    extras: PanelExtra[] };
  export type PanelBudget = { config: CurrencySettings & { mode: BudgetMode; isOwner: boolean; sharedTotal: number | null; myTotal: number | null };
    wallets: PanelWallet[] } | null;
  // schedule-editor.tsx
  RowItem.money: { shared: { estimate: Money | null; actual: ActualMoney | null } | null; mine: { … } | null };
  // provider budget: (BudgetCurrencies & { mode: BudgetMode }) | null
  ```
- [ ] **Step 1:** `loadBudget`: `splitByOwner(rows, userId)`; `dropped > 0` 이면 `console.error("[budget-visibility]", { tripId, dropped })`(id·금액은 남기지 않음). 일정 날짜 붙이기는 지금과 같다.
- [ ] **Step 2:** `toPanelBudget`: `visibleSides(config.mode, { shared: shared.length > 0, mine: mine.length > 0 })` 순서로 지갑을 만든다. 모임 지갑 total = `config.sharedTotal`, 내 지갑은 `personalTotalFor(config.myBudget, config.currency)`. 요약은 `summarizeBudget(lines, { ...config, totalAmount: total ?? 0 })`, 기간 합계도 같은 식.
- [ ] **Step 3:** `schedule-section.tsx` 의 `rowItem` 이 `money` 를 채우고, provider 에 `mode` 를 넘긴다.
- [ ] **Step 4:** `npm run typecheck`(카드·막대 호출부 오류는 Task 7).
- [ ] **Step 5: Commit** `feat(budget): #89 화면 데이터를 모임·내 지갑으로`

### Task 7: 예산 시트·카드·아래 줄·양식

**Files:**
- Modify: `src/app/trips/[id]/budget-card.tsx`, `budget-sheet.tsx`, `budget-dock.tsx`, `budget-area.tsx`, `budget-forms.tsx`, `budget-meter.tsx`(필요하면)

**Interfaces:**
- Consumes: Task 6 `PanelBudget`, `PanelWallet`, Task 5 액션 필드(`mode`, `myTotal`, `side`).
- Produces: `BudgetCard` props 에 `wallet: PanelWallet` 과 `config` (지금의 `budget` 대신). 시트는 `budget.wallets.map` 으로 카드를 그린다.

- [ ] **Step 1:** `BudgetCard`: 제목 — 모임 지갑 "전체 예산"/"N일차 예산"(지금 그대로), 내 지갑 "내 예산"/"N일차 내 예산" + "나만 보여요"(자물쇠 아이콘 + 글자). `total === null` 이면 막대·여유 문구 대신 "모임 예산 정하기"/"내 예산 정하기" 버튼(설정 양식 열기), `stale` 이면 `"예산 통화가 바뀌었어요. 내 예산을 다시 정해 주세요 (전에 정한 값: ${formatMoney(stale.amount, stale.currency)})"`. [설정] 버튼과 설정 양식은 첫 지갑 카드에만. 일정 밖 항목 양식은 그 카드의 `side` 를 hidden `side` 로 보낸다.
- [ ] **Step 2:** `BudgetSettingsForm`: 통화 칸들(지금) + 방식(`config.isOwner` 면 `<select name="mode">` "모임 통장"/"각자"/"둘 다", 아니면 글자 `방식: … · 여행 주인이 정해요` 와 hidden 없음 — 서버가 무시) + 모임 총 예산(방식이 각자가 아닐 때, 지금 `totalAmount` 칸) + 내 예산(`myTotal`, 방식이 모임 통장이 아닐 때, 옆에 "나만 보여요"). 고른 방식에 따라 칸을 바로 보이거나 숨긴다(클라이언트 state).
- [ ] **Step 3:** `BudgetDock`: 지갑마다 막대 하나. 지갑이 둘이면 작은 막대 둘(모임 위, 내 것 아래), 하나면 지금 모양. 휴대폰 너비 배치는 브라우저로 확인(Task 8).
- [ ] **Step 4:** `npm run typecheck && npm run lint`.
- [ ] **Step 5:** 임시 라우트로 화면 확인(커밋하지 않음, `docs/status.md` 'DB 없이 화면 확인(#97)' 방식): `src/app/e2e-wallets/page.tsx` 에 가짜 `PanelBudget` 세 벌(모임 통장 / 각자(내 예산 stale) / 둘 다)로 `BudgetArea` 를 그리고 Playwright 로 390px·1280px 사진. 모임 통장 벌이 `main` 의 지금 화면과 같은지 본다. 확인 뒤 라우트와 `.next/dev/types` 의 흔적을 지운다.
- [ ] **Step 6: Commit** `feat(budget): #89 예산 시트에 모임·내 예산 카드, 아래 줄 막대, 방식 고르기`

### Task 8: 일정 양식 — 쪽 전환과 미리 결제한 실제

**Files:**
- Modify: `src/app/trips/[id]/schedule-editor.tsx`, `src/app/trips/[id]/schedule-item-form.tsx`, `src/app/trips/[id]/money-fields.tsx`(필요하면)

**Interfaces:**
- Consumes: Task 5 액션(`setScheduleItemActualAction(tripId, itemId, side, …)`, 양식 필드 `sides`, `mine*`, `mineActualShown`), Task 6 `RowItem.money`, provider `budget.mode`.

- [ ] **Step 1:** 양식의 쪽 = `visibleSides(mode, { shared: !!item.money.shared, mine: !!item.money.mine })`(추가 양식은 행이 없으니 방식대로). 쪽이 둘이면 예상 칸 위에 `[모임] [내 돈]` 전환(라디오 그룹, 키보드로 움직임). 두 쪽 칸을 모두 그리고 보이지 않는 쪽은 `hidden` 으로 숨긴다(값은 함께 보냄 → 서버가 바뀐 쪽만 씀). hidden `sides` 에 그린 쪽들.
- [ ] **Step 2:** 고치기 양식: 실제 지출 칸을 완료와 상관없이 그린다. 실제가 없으면 접힌 "실제 지출 적기" 버튼을 누르면 펼쳐지고, 펼친 쪽만 `actualShown`/`mineActualShown = "1"`. 실제가 있으면 처음부터 펼침. 전환을 따른다.
- [ ] **Step 3:** 완료 체크칸: 끌 때의 확인 창("완료를 풀면 …지워져요")과 `undoScheduleItemWithActualAction` 호출을 없애고 늘 `setScheduleItemDoneAction`. 켤 때 열리는 실제 칸은 `defaultSide(mode)` 쪽, 그 일정에 반대쪽 행이 남아 있으면 같은 전환을 보인다. `setScheduleItemActualAction` 에 쪽을 넘긴다.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test`, `npm run build`.
- [ ] **Step 5:** 임시 라우트(Task 7 Step 5 와 같은 방식)에 일정 양식을 둘 다 방식 가짜 데이터로 그려 전환·접힘·hidden 값이 보내지는지 Playwright 로 확인(제출 본문을 `page.route` 로 잡아 `sides`, `mine*` 를 본다). 지운다.
- [ ] **Step 6: Commit** `feat(schedule): #89 일정 양식의 모임·내 돈 전환과 미리 결제한 실제 지출`

### Task 9: 리뷰·PR·적용 뒤 확인

**Files:**
- Modify: `docs/status.md`(끝날 때), PR 본문

- [ ] **Step 1:** `/code-review`, `/security-review`(인증·소유권 코드). 막는 지적을 고치고 다시 리뷰(`CLAUDE.md` '리뷰 종료 기준').
- [ ] **Step 2:** draft PR. 본문 맨 위 "사람 확인 필요"(위험 경로 `src/db/schema.ts`, `drizzle/**` — 마이그레이션), `0008` SQL 전문, 파괴적 아님 판정과 근거, `Closes #89`, 남은 지적. 자동 머지 켜지 않음. `subscribe_pr_activity`.
- [ ] **Step 3:** 사람이 `human-approved` 를 붙이면, 실행 직전 사람에게 확인받고 `npm run db:migrate`.
- [ ] **Step 4:** 적용 뒤 로컬 dev + 임시 테스트 계정 둘(사용자 승인 필요, `docs/status.md` '로그인한 화면의 브라우저 확인' 방식)로 Review Focus 1–5 와 설계 §5.8 목록 확인: 세 방식 각각 A 의 내 돈이 B 화면·합계·[N일차]에 없음, B 가 A 의 내 돈 행 id 로 고치기·지우기 → 실패·DB 그대로, 방식 바꾸기 뒤 카드, A 가 공용 일정 삭제 → B 의 일정 밖 항목으로 남음(Task 4 CTE 동작), 나가기 뒤 삭제, 미리 결제한 실제·완료 풀기, 휴대폰 너비 아래 줄. 테스트 계정·행은 끝나면 지운다.
- [ ] **Step 5:** draft 해제 → Codex 결과 확인 → 자동 머지(squash). 배포 확인 뒤 `docs/status.md` 갱신, 사용자에게 새 세션 권함.
