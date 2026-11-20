import "server-only";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
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
  trips,
} from "@/db/schema";
import {
  type ActualMoney,
  type BudgetSettings,
  type Money,
  normalizeRate,
  type RateSource,
} from "@/lib/budget";
import { isUuid } from "@/lib/ids";
import { accessibleTrips } from "./trips";

// 예산 쿼리(#14). 여행 접근은 trips.ts 의 accessibleTrips 조건 하나로만 판단하고, 같은 SQL 문 안에 넣는다.
// neon-http 는 대화형 트랜잭션이 없으므로 조건 확인과 쓰기를 한 문(조건부 insert/update, 데이터를 바꾸는 CTE)으로 한다.
// 금액의 통화는 그 여행 설정의 예산·현지 통화여야 한다(쓰기 문이 trip_budgets 와 함께 확인).

// 한 여행에 넣을 수 있는 예산 행 수(일정에 붙은 행 포함). 넣기 전에 센다(장소 상한과 같은 방식).
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

// 한 화면 요청 안에서 지도 칸과 일정 칸이 같은 결과를 나눠 쓰도록 cache 로 감싼다.
export const getTripBudget = cache(
  async (userId: string, tripId: string): Promise<BudgetSettings | null> => {
    if (!validIds(tripId)) return null;
    const [row] = await db
      .select()
      .from(tripBudgets)
      .where(
        and(
          eq(tripBudgets.tripId, tripId),
          inArray(tripBudgets.tripId, accessibleTripIds(userId)),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      currency: row.currency,
      totalAmount: row.totalAmount,
      localCurrency: row.localCurrency,
      plannedRate:
        row.plannedRate === null ? null : normalizeRate(row.plannedRate),
    };
  },
);

export const listBudgetItems = cache(
  async (userId: string, tripId: string): Promise<BudgetItem[]> => {
    if (!validIds(tripId)) return [];
    return db
      .select()
      .from(budgetItems)
      .where(itemInAccessibleTrip(userId, tripId))
      .orderBy(asc(budgetItems.createdAt), asc(budgetItems.id));
  },
);

export async function getBudgetItemForSchedule(
  userId: string,
  tripId: string,
  scheduleItemId: string,
): Promise<BudgetItem | null> {
  if (!validIds(tripId, scheduleItemId)) return null;
  const [row] = await db
    .select()
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.scheduleItemId, scheduleItemId),
        itemInAccessibleTrip(userId, tripId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// 일정 밖 행만.
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
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function countBudgetItems(
  userId: string,
  tripId: string,
): Promise<number> {
  if (!validIds(tripId)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(budgetItems)
    .where(itemInAccessibleTrip(userId, tripId));
  return row?.n ?? 0;
}

// 설정을 넣거나 고친다. 바꾼 설정에서 이미 적은 금액의 통화가 사라지면 쓰지 않는다(설계 §5.2):
// 예산 통화는 금액 행이 하나도 없을 때만, 현지 통화 바꾸기·없애기는 그 통화로 적은 금액이 없을 때만.
export async function upsertTripBudget(
  userId: string,
  tripId: string,
  settings: BudgetSettings,
): Promise<"ok" | "locked" | "missing"> {
  if (!validIds(tripId)) return "missing";
  const { currency, totalAmount, localCurrency, plannedRate } = settings;
  const kept = localCurrency ?? currency;
  const result = await db.execute<{ trip_id: string }>(sql`
    WITH t AS (
      SELECT ${trips.id} AS id FROM ${trips}
      WHERE ${trips.id} = ${tripId}::uuid AND ${accessibleTrips(userId)}
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
    INSERT INTO ${tripBudgets} (trip_id, currency, total_amount, local_currency, planned_rate)
    SELECT id, ${currency}::text, ${totalAmount}::bigint, ${localCurrency}::text, ${plannedRate}::numeric
    FROM t WHERE NOT EXISTS (SELECT 1 FROM blocked)
    ON CONFLICT (trip_id) DO UPDATE SET
      currency = EXCLUDED.currency,
      total_amount = EXCLUDED.total_amount,
      local_currency = EXCLUDED.local_currency,
      planned_rate = EXCLUDED.planned_rate,
      updated_at = now()
    RETURNING trip_id`);
  if (result.rows.length > 0) return "ok";
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), accessibleTrips(userId)))
    .limit(1);
  return trip ? "locked" : "missing";
}

// 이 사용자가 접근할 수 있는 여행 tripId 의 일정인가.
async function scheduleItemVisible(
  userId: string,
  tripId: string,
  scheduleItemId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: scheduleItems.id })
    .from(scheduleItems)
    .where(
      and(
        eq(scheduleItems.id, scheduleItemId),
        eq(scheduleItems.tripId, tripId),
        inArray(scheduleItems.tripId, accessibleTripIds(userId)),
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

// 일정의 예상·실제를 모두 쓴다(일정 양식). 둘 다 null 이면 그 일정의 행을 지운다.
// 일정이 접근 가능한 여행 tripId 의 것이고 그 여행에 예산 설정이 있으며 통화가 맞을 때만 true.
export async function setScheduleItemAmounts(
  userId: string,
  tripId: string,
  scheduleItemId: string,
  amounts: AmountWrite,
): Promise<boolean> {
  if (!validIds(tripId, scheduleItemId)) return false;
  if (amounts.estimate === null && amounts.actual === null) {
    await db
      .delete(budgetItems)
      .where(
        and(
          eq(budgetItems.scheduleItemId, scheduleItemId),
          itemInAccessibleTrip(userId, tripId),
        ),
      );
    return scheduleItemVisible(userId, tripId, scheduleItemId);
  }
  const e = amounts.estimate;
  const a = actualValues(amounts.actual);
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO ${budgetItems} (trip_id, schedule_item_id, estimate_amount, estimate_currency,
      actual_amount, actual_currency, actual_paid_on, actual_rate, actual_rate_source)
    SELECT si.trip_id, si.id, ${e?.amount ?? null}::bigint, ${e?.currency ?? null}::text,
      ${a.amount}::bigint, ${a.currency}::text, ${a.paidOn}::date, ${a.rate}::numeric, ${a.source}::text
    FROM ${scheduleItems} si JOIN ${tripBudgets} tb ON tb.trip_id = si.trip_id
    WHERE si.id = ${scheduleItemId}::uuid AND si.trip_id = ${tripId}::uuid
      AND si.trip_id IN ${accessibleTripIdsSql(userId)}
      AND ${currencyAllowed(e?.currency ?? null)} AND ${currencyAllowed(a.currency)}
    ON CONFLICT (schedule_item_id) DO UPDATE SET
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

// 실제만 쓴다(완료 체크칸의 실제 지출 칸). null 이면 실제를 비우고, 예상도 없으면 행을 지운다.
export async function setScheduleItemActual(
  userId: string,
  tripId: string,
  scheduleItemId: string,
  actual: ActualMoney | null,
): Promise<boolean> {
  if (!validIds(tripId, scheduleItemId)) return false;
  if (actual === null) {
    await db.execute(sql`
      WITH target AS (
        SELECT b.id, b.estimate_amount FROM ${budgetItems} b
        WHERE b.schedule_item_id = ${scheduleItemId}::uuid AND b.trip_id = ${tripId}::uuid
          AND b.trip_id IN ${accessibleTripIdsSql(userId)}
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
    return scheduleItemVisible(userId, tripId, scheduleItemId);
  }
  const a = actualValues(actual);
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO ${budgetItems} (trip_id, schedule_item_id,
      actual_amount, actual_currency, actual_paid_on, actual_rate, actual_rate_source)
    SELECT si.trip_id, si.id,
      ${a.amount}::bigint, ${a.currency}::text, ${a.paidOn}::date, ${a.rate}::numeric, ${a.source}::text
    FROM ${scheduleItems} si JOIN ${tripBudgets} tb ON tb.trip_id = si.trip_id
    WHERE si.id = ${scheduleItemId}::uuid AND si.trip_id = ${tripId}::uuid
      AND si.trip_id IN ${accessibleTripIdsSql(userId)}
      AND ${currencyAllowed(a.currency)}
    ON CONFLICT (schedule_item_id) DO UPDATE SET
      actual_amount = EXCLUDED.actual_amount,
      actual_currency = EXCLUDED.actual_currency,
      actual_paid_on = EXCLUDED.actual_paid_on,
      actual_rate = EXCLUDED.actual_rate,
      actual_rate_source = EXCLUDED.actual_rate_source,
      updated_at = now()
    RETURNING id`);
  return result.rows.length > 0;
}

// 완료를 풀고 그 일정의 실제를 지운다(한 문). 예상이 없는 행은 지우고, 있는 행은 실제 칸만 비운다.
// 두 쓰기가 같은 행을 건드리지 않도록 조건이 겹치지 않는다. 일정이 바뀌었으면 true.
export async function undoScheduleItemAndClearActual(
  userId: string,
  tripId: string,
  scheduleItemId: string,
): Promise<boolean> {
  if (!validIds(tripId, scheduleItemId)) return false;
  const result = await db.execute<{ id: string }>(sql`
    WITH s AS (
      UPDATE ${scheduleItems} SET done = false, updated_at = now()
      WHERE ${scheduleItems.id} = ${scheduleItemId}::uuid AND ${scheduleItems.tripId} = ${tripId}::uuid
        AND ${scheduleItems.tripId} IN ${accessibleTripIdsSql(userId)}
      RETURNING ${scheduleItems.id} AS id
    ),
    removed AS (
      DELETE FROM ${budgetItems}
      WHERE schedule_item_id IN (SELECT id FROM s) AND estimate_amount IS NULL
      RETURNING id
    ),
    cleared AS (
      UPDATE ${budgetItems} SET actual_amount = NULL, actual_currency = NULL,
        actual_paid_on = NULL, actual_rate = NULL, actual_rate_source = NULL, updated_at = now()
      WHERE schedule_item_id IN (SELECT id FROM s) AND estimate_amount IS NOT NULL
      RETURNING id
    )
    SELECT id FROM s`);
  return result.rows.length > 0;
}

export type ExtraItemWrite = {
  title: string;
  date: string | null;
} & AmountWrite;

// 일정 밖 항목 넣기. 예산 설정이 있는 접근 가능한 여행일 때만. 없으면 null.
export async function createExtraItem(
  userId: string,
  tripId: string,
  input: ExtraItemWrite,
): Promise<string | null> {
  if (!validIds(tripId)) return null;
  const e = input.estimate;
  const a = actualValues(input.actual);
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO ${budgetItems} (trip_id, title, date, estimate_amount, estimate_currency,
      actual_amount, actual_currency, actual_paid_on, actual_rate, actual_rate_source)
    SELECT tb.trip_id, ${input.title}::text, ${input.date}::date,
      ${e?.amount ?? null}::bigint, ${e?.currency ?? null}::text,
      ${a.amount}::bigint, ${a.currency}::text, ${a.paidOn}::date, ${a.rate}::numeric, ${a.source}::text
    FROM ${tripBudgets} tb
    WHERE tb.trip_id = ${tripId}::uuid AND tb.trip_id IN ${accessibleTripIdsSql(userId)}
      AND ${currencyAllowed(e?.currency ?? null)} AND ${currencyAllowed(a.currency)}
    RETURNING id`);
  return result.rows[0]?.id ?? null;
}

// 일정 밖 항목 고치기. 항목 id·여행 id·접근 조건·통화를 한 문에서 확인한다.
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
      AND b.trip_id IN ${accessibleTripIdsSql(userId)} AND tb.trip_id = b.trip_id
      AND ${currencyAllowed(e?.currency ?? null)} AND ${currencyAllowed(a.currency)}
    RETURNING b.id`);
  return result.rows.length > 0;
}

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
      ),
    )
    .returning({ id: budgetItems.id });
  return rows.length > 0;
}
