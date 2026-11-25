import "server-only";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import {
  type BudgetItem,
  budgetItems,
  scheduleItems,
  tripBudgets,
  tripPersonalBudgets,
  trips,
} from "@/db/schema";
import {
  type ActualMoney,
  type CurrencySettings,
  type Money,
  normalizeRate,
  type RateSource,
} from "@/lib/budget";
import { type BudgetMode, isBudgetMode, type Side } from "@/lib/budget-wallets";
import { isUuid } from "@/lib/ids";
import { accessibleTrips, editableTrips, isRecordTripSql } from "./trips";

// 예산 쿼리(#14). 여행 접근은 trips.ts 의 accessibleTrips 조건 하나로만 판단하고, 같은 SQL 문 안에 넣는다.
// neon-http 는 대화형 트랜잭션이 없으므로 조건 확인과 쓰기를 한 문(조건부 insert/update, 데이터를 바꾸는 CTE)으로 한다.
// 금액의 통화는 그 여행 설정의 예산·현지 통화여야 한다(쓰기 문이 trip_budgets 와 함께 확인).

// 예산 행 상한(일정에 붙은 행 포함). 넣기 전에 센다(장소 상한과 같은 방식).
// 여행 전체 행 수가 아니라 넣는 사람에게 보이는 행(모임 행 + 본인 행)만 센다(countBudgetItems, #89 §5.3).
// 그래서 여러 사람이 각자 내 돈 행을 적으면 여행 전체로는 300행을 넘을 수 있다.
export const MAX_BUDGET_ITEMS_PER_TRIP = 300;

export type AmountWrite = {
  estimate: Money | null;
  actual: ActualMoney | null;
};

function validIds(...ids: string[]): boolean {
  return ids.every((id) => typeof id === "string" && isUuid(id));
}

function accessibleTripIds(userId: string) {
  return db.select({ id: trips.id }).from(trips).where(accessibleTrips(userId));
}

function itemInAccessibleTrip(userId: string, tripId: string): SQL {
  return and(
    eq(budgetItems.tripId, tripId),
    inArray(budgetItems.tripId, accessibleTripIds(userId)),
  ) as SQL;
}

// 지출 행이 이 사용자에게 보이는가(#89, 설계 §5.3): 모임 행(owner_user_id null)이거나 내 행.
// 지출 행을 읽거나 쓰는 모든 쿼리가 itemInAccessibleTrip 과 함께 건다. 보이는 행 = 쓸 수 있는 행.
// 여행 주인도 남의 내 돈 행은 보지도 고치지도 못한다. 예외는 upsertTripBudget 의 통화 잠금 검사 하나(그곳 주석).
function visibleToUser(userId: string): SQL {
  return or(
    isNull(budgetItems.ownerUserId),
    eq(budgetItems.ownerUserId, userId),
  ) as SQL;
}

// visibleToUser 의 원시 SQL 조각. alias 는 이 파일 안의 고정 별칭만 넘긴다(입력값 아님).
function visibleToUserSql(alias: string, userId: string): SQL {
  const b = sql.raw(alias);
  return sql`(${b}.owner_user_id IS NULL OR ${b}.owner_user_id = ${userId}::text)`;
}

// 쓰는 쪽의 owner_user_id. 폼 입력이 아니라 서버가 정한다: 모임이면 null, 내 돈이면 본인.
function ownerFor(userId: string, side: Side): string | null {
  return side === "mine" ? userId : null;
}

// 이 쪽(owner)의 행만. owner 는 ownerFor 가 정한 값(null 또는 본인)이라 visibleToUser 보다 좁다.
function sameOwner(owner: string | null): SQL {
  return sql`${budgetItems.ownerUserId} IS NOT DISTINCT FROM ${owner}::text`;
}

function sameOwnerSql(alias: string, owner: string | null): SQL {
  return sql`${sql.raw(alias)}.owner_user_id IS NOT DISTINCT FROM ${owner}::text`;
}

// 일정에 붙은 행의 INSERT … ON CONFLICT 대상. 부분 고유 색인(0008)을 고르려면 색인의 조건을 함께 적어야 한다.
// 충돌하는 기존 행은 일정 id 와 owner_user_id 가 같은 행뿐이라, DO UPDATE 는 이 쪽(모임 또는 본인) 행만 고친다.
function scheduleConflictTarget(owner: string | null): SQL {
  return owner === null
    ? sql`(schedule_item_id) WHERE owner_user_id IS NULL`
    : sql`(schedule_item_id, owner_user_id) WHERE owner_user_id IS NOT NULL`;
}

// 기록 여행(#103)에서 모임 쪽(owner null) 쓰기를 막는 조건. 기록의 모임 지출은 사본이라 읽기만 한다.
// owner 는 ownerFor 가 정한 값(null 또는 본인), tripId 는 validIds 를 거친 값이다.
function sideWritable(owner: string | null, tripId: string): SQL {
  return sql`(${owner}::text IS NOT NULL OR NOT ${isRecordTripSql(tripId)})`;
}

// 이미 있는 지출 행(alias)이 기록 여행(#103)의 모임 행이 아닌가.
function rowWritableSql(alias: string, tripId: string): SQL {
  return sql`(${sql.raw(alias)}.owner_user_id IS NOT NULL OR NOT ${isRecordTripSql(tripId)})`;
}

// 접근 가능한 여행 id 서브쿼리(원시 SQL 문 안에서 쓴다).
function accessibleTripIdsSql(userId: string): SQL {
  return sql`(SELECT ${trips.id} FROM ${trips} WHERE ${accessibleTrips(userId)})`;
}

// 이 통화가 비었거나 tb(그 여행의 trip_budgets)의 예산·현지 통화인가.
function currencyAllowed(currency: string | null): SQL {
  return sql`(${currency}::text IS NULL OR ${currency}::text IN (tb.currency, tb.local_currency))`;
}

export function estimateOf(row: BudgetItem): Money | null {
  if (row.estimateAmount === null || row.estimateCurrency === null) return null;
  return { amount: row.estimateAmount, currency: row.estimateCurrency };
}

export function actualOf(row: BudgetItem): ActualMoney | null {
  if (row.actualAmount === null || row.actualCurrency === null) return null;
  return {
    amount: row.actualAmount,
    currency: row.actualCurrency,
    paidOn: row.actualPaidOn,
    rate: row.actualRate === null ? null : normalizeRate(row.actualRate),
    rateSource: row.actualRateSource as RateSource | null,
  };
}

export type TripBudgetConfig = CurrencySettings & {
  mode: BudgetMode;
  sharedTotal: number | null;
  // 내 예산(본인 행만). currency 는 정할 때의 예산 통화.
  myBudget: { totalAmount: number; currency: string } | null;
  // 화면이 방식 고르기를 보일지 정하는 데만 쓴다. 권한 판단은 upsertTripBudget 의 조건이 한다.
  isOwner: boolean;
};

// 한 화면 요청 안에서 지도 칸과 일정 칸이 같은 결과를 나눠 쓰도록 cache 로 감싼다.
// 여행 설정 + 주인인가 + 내 예산(user_id = userId 행만)을 한 문으로 읽는다.
export const getTripBudget = cache(
  async (userId: string, tripId: string): Promise<TripBudgetConfig | null> => {
    if (!validIds(tripId)) return null;
    const [row] = await db
      .select({
        currency: tripBudgets.currency,
        totalAmount: tripBudgets.totalAmount,
        mode: tripBudgets.mode,
        localCurrency: tripBudgets.localCurrency,
        plannedRate: tripBudgets.plannedRate,
        isOwner: sql<boolean>`${trips.userId} = ${userId}`,
        myTotal: tripPersonalBudgets.totalAmount,
        myCurrency: tripPersonalBudgets.currency,
      })
      .from(tripBudgets)
      .innerJoin(trips, eq(trips.id, tripBudgets.tripId))
      .leftJoin(
        tripPersonalBudgets,
        and(
          eq(tripPersonalBudgets.tripId, tripBudgets.tripId),
          eq(tripPersonalBudgets.userId, userId),
        ),
      )
      .where(and(eq(tripBudgets.tripId, tripId), accessibleTrips(userId)))
      .limit(1);
    if (!row) return null;
    return {
      currency: row.currency,
      localCurrency: row.localCurrency,
      plannedRate:
        row.plannedRate === null ? null : normalizeRate(row.plannedRate),
      mode: isBudgetMode(row.mode) ? row.mode : "shared",
      sharedTotal: row.totalAmount,
      myBudget:
        row.myTotal === null || row.myCurrency === null
          ? null
          : { totalAmount: row.myTotal, currency: row.myCurrency },
      isOwner: row.isOwner === true,
    };
  },
);

// 모임 행 + 내 행. 남의 내 돈 행은 오지 않는다.
export const listBudgetItems = cache(
  async (userId: string, tripId: string): Promise<BudgetItem[]> => {
    if (!validIds(tripId)) return [];
    return db
      .select()
      .from(budgetItems)
      .where(and(itemInAccessibleTrip(userId, tripId), visibleToUser(userId)))
      .orderBy(asc(budgetItems.createdAt), asc(budgetItems.id));
  },
);

// 한 일정의 모임 행과 내 행(고유 색인 때문에 쪽마다 많아야 하나).
export async function getScheduleBudgetRows(
  userId: string,
  tripId: string,
  scheduleItemId: string,
): Promise<{ shared: BudgetItem | null; mine: BudgetItem | null }> {
  const none = { shared: null, mine: null };
  if (!validIds(tripId, scheduleItemId)) return none;
  const rows = await db
    .select()
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.scheduleItemId, scheduleItemId),
        itemInAccessibleTrip(userId, tripId),
        visibleToUser(userId),
      ),
    );
  return {
    shared: rows.find((r) => r.ownerUserId === null) ?? null,
    mine: rows.find((r) => r.ownerUserId === userId) ?? null,
  };
}

// 일정 밖 행만. 모임 행이거나 내 행일 때만.
export async function getExtraItem(
  userId: string,
  tripId: string,
  itemId: string,
): Promise<BudgetItem | null> {
  if (!validIds(tripId, itemId)) return null;
  const [row] = await db
    .select()
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.id, itemId),
        isNull(budgetItems.scheduleItemId),
        itemInAccessibleTrip(userId, tripId),
        visibleToUser(userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// 상한(MAX_BUDGET_ITEMS_PER_TRIP)용 수. "모임 행 + 내 행"만 센다(설계 §5.3):
// 남의 숨은 행 때문에 막히거나 그 수를 짐작하지 않게.
export async function countBudgetItems(
  userId: string,
  tripId: string,
): Promise<number> {
  if (!validIds(tripId)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(budgetItems)
    .where(and(itemInAccessibleTrip(userId, tripId), visibleToUser(userId)));
  return row?.n ?? 0;
}

// 설정을 넣거나 고친다. 바꾼 설정에서 이미 적은 금액의 통화가 사라지면 쓰지 않는다(설계 §5.2):
// 예산 통화는 금액 행이 하나도 없을 때만, 현지 통화 바꾸기·없애기는 그 통화로 적은 금액이 없을 때만.
// 모임 예산 총액(sharedTotal)은 함께하는 사람 누구나 고친다(비울 수 있음). 방식(mode)은 여행 주인만 바꾼다(#89):
// 처음 넣을 때 주인이 아니면 'shared', 고칠 때 주인이 아니면 기존 값을 그대로 둔다.
// 기록 여행(#103)에서는 예산 설정이 사본이라 쓰지 않는다(t 와 뒤의 확인 모두 editableTrips, "missing").
export async function upsertTripBudget(
  userId: string,
  tripId: string,
  input: CurrencySettings & { sharedTotal: number | null; mode: BudgetMode },
): Promise<"ok" | "locked" | "missing"> {
  if (!validIds(tripId)) return "missing";
  const { currency, sharedTotal, localCurrency, plannedRate, mode } = input;
  const kept = localCurrency ?? currency;
  // blocked 는 visibleToUser 를 걸지 않고 그 여행의 모든 행(남의 내 돈 포함)을 본다(설계 §5.3).
  // 남의 숨은 금액도 그 통화가 설정에서 사라지면 읽을 수 없게 되므로 지켜야 하고,
  // 막혔을 때 문구("이미 적은 금액이 있어 통화를 바꿀 수 없어요.")는 누가·얼마·몇 건인지 드러내지 않는다.
  const result = await db.execute<{ trip_id: string }>(sql`
    WITH t AS (
      SELECT ${trips.id} AS id, ${trips.userId} = ${userId}::text AS is_owner FROM ${trips}
      WHERE ${trips.id} = ${tripId}::uuid AND ${editableTrips(userId)}
    ),
    blocked AS (
      SELECT 1 FROM ${budgetItems} b
      WHERE b.trip_id IN (SELECT id FROM t) AND (
        EXISTS (
          SELECT 1 FROM ${tripBudgets} old
          WHERE old.trip_id = b.trip_id AND old.currency <> ${currency}::text
        )
        OR (b.estimate_currency IS NOT NULL AND b.estimate_currency NOT IN (${currency}::text, ${kept}::text))
        OR (b.actual_currency IS NOT NULL AND b.actual_currency NOT IN (${currency}::text, ${kept}::text))
      )
      LIMIT 1
    )
    INSERT INTO ${tripBudgets} (trip_id, currency, total_amount, mode, local_currency, planned_rate)
    SELECT id, ${currency}::text, ${sharedTotal}::bigint,
      CASE WHEN is_owner THEN ${mode}::text ELSE 'shared' END,
      ${localCurrency}::text, ${plannedRate}::numeric
    FROM t WHERE NOT EXISTS (SELECT 1 FROM blocked)
    ON CONFLICT (trip_id) DO UPDATE SET
      currency = EXCLUDED.currency,
      total_amount = EXCLUDED.total_amount,
      mode = CASE
        WHEN EXISTS (
          SELECT 1 FROM ${trips} o WHERE o.id = trip_budgets.trip_id AND o.user_id = ${userId}::text
        ) THEN EXCLUDED.mode
        ELSE trip_budgets.mode
      END,
      local_currency = EXCLUDED.local_currency,
      planned_rate = EXCLUDED.planned_rate,
      updated_at = now()
    RETURNING trip_id`);
  if (result.rows.length > 0) return "ok";
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), editableTrips(userId)))
    .limit(1);
  return trip ? "locked" : "missing";
}

export type PersonalBudgetResult = "ok" | "currency-changed" | "missing";

// 내 예산을 정하거나(total) 지운다(null). 언제나 user_id = userId 행만 읽고 쓴다.
// 정할 때는 예산 설정이 있는 접근 가능한 여행이고 그 예산 통화가 currency(금액을 읽은 통화)와 같을 때만이다.
// 양식을 연 뒤 다른 사람이 통화를 바꿨으면 금액을 새 통화로 읽어 저장하지 않고 "currency-changed"(설계 §5.5).
// 통화 확인과 넣기는 한 문이다. 넣지 못했을 때 둘을 가르는 두 번째 읽기는 알림 문구만 정한다.
// 지울 때는 통화와 상관없이 접근 가능한 여행이면 "ok"(지울 행이 없었어도). 그 밖은 "missing".
export async function setPersonalBudget(
  userId: string,
  tripId: string,
  total: number | null,
  currency: string,
): Promise<PersonalBudgetResult> {
  if (!validIds(tripId)) return "missing";
  if (total === null) {
    const result = await db.execute<{ id: string }>(sql`
      WITH removed AS (
        DELETE FROM ${tripPersonalBudgets} p
        WHERE p.trip_id = ${tripId}::uuid AND p.user_id = ${userId}::text
          AND p.trip_id IN ${accessibleTripIdsSql(userId)}
        RETURNING p.trip_id
      )
      SELECT ${trips.id} AS id FROM ${trips}
      WHERE ${trips.id} = ${tripId}::uuid AND ${accessibleTrips(userId)}`);
    return result.rows.length > 0 ? "ok" : "missing";
  }
  const result = await db.execute<{ trip_id: string }>(sql`
    INSERT INTO ${tripPersonalBudgets} (trip_id, user_id, total_amount, currency)
    SELECT tb.trip_id, ${userId}::text, ${total}::bigint, tb.currency
    FROM ${tripBudgets} tb
    WHERE tb.trip_id = ${tripId}::uuid AND tb.trip_id IN ${accessibleTripIdsSql(userId)}
      AND tb.currency = ${currency}::text
    ON CONFLICT (trip_id, user_id) DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      currency = EXCLUDED.currency,
      updated_at = now()
    RETURNING trip_id`);
  if (result.rows.length > 0) return "ok";
  const [settings] = await db
    .select({ tripId: tripBudgets.tripId })
    .from(tripBudgets)
    .where(
      and(
        eq(tripBudgets.tripId, tripId),
        inArray(tripBudgets.tripId, accessibleTripIds(userId)),
      ),
    )
    .limit(1);
  return settings ? "currency-changed" : "missing";
}

// 이 사용자가 접근할 수 있는 여행 tripId 의 일정이고, 이 쪽(owner)을 쓸 수 있는가(기록 여행(#103)의 모임 쪽은 아님).
async function scheduleSideWritable(
  userId: string,
  tripId: string,
  scheduleItemId: string,
  owner: string | null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: scheduleItems.id })
    .from(scheduleItems)
    .where(
      and(
        eq(scheduleItems.id, scheduleItemId),
        eq(scheduleItems.tripId, tripId),
        inArray(scheduleItems.tripId, accessibleTripIds(userId)),
        sideWritable(owner, tripId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

function actualValues(actual: ActualMoney | null) {
  return {
    amount: actual?.amount ?? null,
    currency: actual?.currency ?? null,
    paidOn: actual?.paidOn ?? null,
    rate: actual?.rate ?? null,
    source: actual?.rateSource ?? null,
  };
}

// 일정의 한 쪽(side: 모임 / 내 돈) 예상·실제를 모두 쓴다(일정 양식). 둘 다 null 이면 그 쪽 행을 지운다.
// 일정이 접근 가능한 여행 tripId 의 것이고 그 여행에 예산 설정이 있으며 통화가 맞을 때만 true.
// 내 돈 쪽은 owner_user_id = userId 행만 넣고 고치고 지운다.
// 기록 여행(#103)에서는 모임 쪽을 넣지도 지우지도 않는다(sideWritable, false). 모두 일정 사본에 내 돈은 붙인다.
export async function setScheduleItemAmounts(
  userId: string,
  tripId: string,
  scheduleItemId: string,
  side: Side,
  amounts: AmountWrite,
): Promise<boolean> {
  if (!validIds(tripId, scheduleItemId)) return false;
  const owner = ownerFor(userId, side);
  if (amounts.estimate === null && amounts.actual === null) {
    await db
      .delete(budgetItems)
      .where(
        and(
          eq(budgetItems.scheduleItemId, scheduleItemId),
          itemInAccessibleTrip(userId, tripId),
          visibleToUser(userId),
          sameOwner(owner),
          sideWritable(owner, tripId),
        ),
      );
    return scheduleSideWritable(userId, tripId, scheduleItemId, owner);
  }
  const e = amounts.estimate;
  const a = actualValues(amounts.actual);
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO ${budgetItems} (trip_id, schedule_item_id, owner_user_id, estimate_amount, estimate_currency,
      actual_amount, actual_currency, actual_paid_on, actual_rate, actual_rate_source)
    SELECT si.trip_id, si.id, ${owner}::text, ${e?.amount ?? null}::bigint, ${e?.currency ?? null}::text,
      ${a.amount}::bigint, ${a.currency}::text, ${a.paidOn}::date, ${a.rate}::numeric, ${a.source}::text
    FROM ${scheduleItems} si JOIN ${tripBudgets} tb ON tb.trip_id = si.trip_id
    WHERE si.id = ${scheduleItemId}::uuid AND si.trip_id = ${tripId}::uuid
      AND si.trip_id IN ${accessibleTripIdsSql(userId)} AND ${sideWritable(owner, tripId)}
      AND ${currencyAllowed(e?.currency ?? null)} AND ${currencyAllowed(a.currency)}
    ON CONFLICT ${scheduleConflictTarget(owner)} DO UPDATE SET
      estimate_amount = EXCLUDED.estimate_amount,
      estimate_currency = EXCLUDED.estimate_currency,
      actual_amount = EXCLUDED.actual_amount,
      actual_currency = EXCLUDED.actual_currency,
      actual_paid_on = EXCLUDED.actual_paid_on,
      actual_rate = EXCLUDED.actual_rate,
      actual_rate_source = EXCLUDED.actual_rate_source,
      updated_at = now()
    RETURNING id`);
  return result.rows.length > 0;
}

// 한 쪽(side)의 실제만 쓴다(완료 체크칸의 실제 지출 칸). null 이면 그 쪽 실제를 비우고, 예상도 없으면 그 행을 지운다.
// 기록 여행(#103)에서는 모임 쪽을 쓰지 않는다(sideWritable, false).
export async function setScheduleItemActual(
  userId: string,
  tripId: string,
  scheduleItemId: string,
  side: Side,
  actual: ActualMoney | null,
): Promise<boolean> {
  if (!validIds(tripId, scheduleItemId)) return false;
  const owner = ownerFor(userId, side);
  if (actual === null) {
    await db.execute(sql`
      WITH target AS (
        SELECT b.id, b.estimate_amount FROM ${budgetItems} b
        WHERE b.schedule_item_id = ${scheduleItemId}::uuid AND b.trip_id = ${tripId}::uuid
          AND b.trip_id IN ${accessibleTripIdsSql(userId)}
          AND ${visibleToUserSql("b", userId)} AND ${sameOwnerSql("b", owner)}
          AND ${sideWritable(owner, tripId)}
      ),
      removed AS (
        DELETE FROM ${budgetItems}
        WHERE id IN (SELECT id FROM target WHERE estimate_amount IS NULL)
        RETURNING id
      ),
      cleared AS (
        UPDATE ${budgetItems} SET actual_amount = NULL, actual_currency = NULL,
          actual_paid_on = NULL, actual_rate = NULL, actual_rate_source = NULL, updated_at = now()
        WHERE id IN (SELECT id FROM target WHERE estimate_amount IS NOT NULL)
        RETURNING id
      )
      SELECT id FROM removed UNION ALL SELECT id FROM cleared`);
    return scheduleSideWritable(userId, tripId, scheduleItemId, owner);
  }
  const a = actualValues(actual);
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO ${budgetItems} (trip_id, schedule_item_id, owner_user_id,
      actual_amount, actual_currency, actual_paid_on, actual_rate, actual_rate_source)
    SELECT si.trip_id, si.id, ${owner}::text,
      ${a.amount}::bigint, ${a.currency}::text, ${a.paidOn}::date, ${a.rate}::numeric, ${a.source}::text
    FROM ${scheduleItems} si JOIN ${tripBudgets} tb ON tb.trip_id = si.trip_id
    WHERE si.id = ${scheduleItemId}::uuid AND si.trip_id = ${tripId}::uuid
      AND si.trip_id IN ${accessibleTripIdsSql(userId)} AND ${sideWritable(owner, tripId)}
      AND ${currencyAllowed(a.currency)}
    ON CONFLICT ${scheduleConflictTarget(owner)} DO UPDATE SET
      actual_amount = EXCLUDED.actual_amount,
      actual_currency = EXCLUDED.actual_currency,
      actual_paid_on = EXCLUDED.actual_paid_on,
      actual_rate = EXCLUDED.actual_rate,
      actual_rate_source = EXCLUDED.actual_rate_source,
      updated_at = now()
    RETURNING id`);
  return result.rows.length > 0;
}

export type ExtraItemWrite = {
  title: string;
  date: string | null;
} & AmountWrite;

// 일정 밖 항목 넣기. 예산 설정이 있는 접근 가능한 여행일 때만. 없으면 null.
// owner_user_id 는 side 로 서버가 정한다(모임 null, 내 돈 본인).
// 기록 여행(#103)에서는 모임 쪽을 넣지 않는다(sideWritable, null).
export async function createExtraItem(
  userId: string,
  tripId: string,
  side: Side,
  input: ExtraItemWrite,
): Promise<string | null> {
  if (!validIds(tripId)) return null;
  const owner = ownerFor(userId, side);
  const e = input.estimate;
  const a = actualValues(input.actual);
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO ${budgetItems} (trip_id, owner_user_id, title, date, estimate_amount, estimate_currency,
      actual_amount, actual_currency, actual_paid_on, actual_rate, actual_rate_source)
    SELECT tb.trip_id, ${owner}::text, ${input.title}::text, ${input.date}::date,
      ${e?.amount ?? null}::bigint, ${e?.currency ?? null}::text,
      ${a.amount}::bigint, ${a.currency}::text, ${a.paidOn}::date, ${a.rate}::numeric, ${a.source}::text
    FROM ${tripBudgets} tb
    WHERE tb.trip_id = ${tripId}::uuid AND tb.trip_id IN ${accessibleTripIdsSql(userId)}
      AND ${sideWritable(owner, tripId)}
      AND ${currencyAllowed(e?.currency ?? null)} AND ${currencyAllowed(a.currency)}
    RETURNING id`);
  return result.rows[0]?.id ?? null;
}

// 일정 밖 항목 고치기. 항목 id·여행 id·접근 조건·보이는 범위(모임 행 또는 내 행)·통화를 한 문에서 확인한다.
// 쪽(owner_user_id)은 바꾸지 않는다.
// 기록 여행(#103)에서는 모임 행을 고치지 않는다(rowWritableSql, false). 내 돈 행은 고친다.
export async function updateExtraItem(
  userId: string,
  tripId: string,
  itemId: string,
  input: ExtraItemWrite,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  const e = input.estimate;
  const a = actualValues(input.actual);
  const result = await db.execute<{ id: string }>(sql`
    UPDATE ${budgetItems} b SET
      title = ${input.title}::text, date = ${input.date}::date,
      estimate_amount = ${e?.amount ?? null}::bigint, estimate_currency = ${e?.currency ?? null}::text,
      actual_amount = ${a.amount}::bigint, actual_currency = ${a.currency}::text,
      actual_paid_on = ${a.paidOn}::date, actual_rate = ${a.rate}::numeric,
      actual_rate_source = ${a.source}::text, updated_at = now()
    FROM ${tripBudgets} tb
    WHERE b.id = ${itemId}::uuid AND b.trip_id = ${tripId}::uuid AND b.schedule_item_id IS NULL
      AND b.trip_id IN ${accessibleTripIdsSql(userId)} AND ${visibleToUserSql("b", userId)}
      AND ${rowWritableSql("b", tripId)}
      AND tb.trip_id = b.trip_id
      AND ${currencyAllowed(e?.currency ?? null)} AND ${currencyAllowed(a.currency)}
    RETURNING b.id`);
  return result.rows.length > 0;
}

// 일정 밖 항목 지우기. 모임 행이거나 내 행일 때만.
// 기록 여행(#103)에서는 모임 행을 지우지 않는다(false). 내 돈 행은 지운다.
export async function deleteExtraItem(
  userId: string,
  tripId: string,
  itemId: string,
): Promise<boolean> {
  if (!validIds(tripId, itemId)) return false;
  const rows = await db
    .delete(budgetItems)
    .where(
      and(
        eq(budgetItems.id, itemId),
        isNull(budgetItems.scheduleItemId),
        itemInAccessibleTrip(userId, tripId),
        visibleToUser(userId),
        sql`(${budgetItems.ownerUserId} IS NOT NULL OR NOT ${isRecordTripSql(tripId)})`,
      ),
    )
    .returning({ id: budgetItems.id });
  return rows.length > 0;
}
