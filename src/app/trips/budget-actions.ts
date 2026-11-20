"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  actualOf,
  countBudgetItems,
  createExtraItem,
  deleteExtraItem,
  getBudgetItemForSchedule,
  getExtraItem,
  getTripBudget,
  MAX_BUDGET_ITEMS_PER_TRIP,
  setScheduleItemActual,
  undoScheduleItemAndClearActual,
  updateExtraItem,
  upsertTripBudget,
} from "@/db/queries/budget";
import { getScheduleItem } from "@/db/queries/schedule-items";
import { getTrip } from "@/db/queries/trips";
import type { ActualMoney, BudgetSettings } from "@/lib/budget";
import {
  type BudgetSettingsFields,
  EMPTY_AMOUNT_FIELDS,
  EMPTY_EXTRA_ITEM_FIELDS,
  type ExtraItemFields,
  parseAmountFields,
  parseBudgetSettings,
  parseExtraItem,
} from "@/lib/budget-input";
import { tripDays } from "@/lib/schedule";
import { getCurrentUser } from "@/lib/session";
import { todayInSeoul } from "@/lib/trip-dates";
import { moneyParsers, resolveActualRate } from "./budget-rate";
import {
  BUDGET_CURRENCY_LOCKED,
  BUDGET_ITEM_LIMIT,
  BUDGET_NOT_SET,
  SAVE_FAILED,
} from "./messages";

// 예산 Server Action(#14). tripId·itemId 는 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위)이 막는다. 남의 것과 없는 것은 똑같이 찾을 수 없음.

type Errors<T> = Partial<Record<keyof T, string>>;

export type BudgetSettingsFormState = {
  values: BudgetSettingsFields;
  errors: Errors<BudgetSettingsFields>;
  formError: string | null;
  savedAt: number | null;
};

export type ExtraItemFormState = {
  values: ExtraItemFields;
  errors: Errors<ExtraItemFields>;
  formError: string | null;
  savedAt: number | null;
};

function tripPath(tripId: string): string {
  return `/trips/${tripId}`;
}

// FormData 를 통째로 넘기지 않고 필요한 필드만 문자열로 꺼낸다.
function readFields<K extends string>(
  formData: FormData,
  names: readonly K[],
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const name of names) {
    const value = formData.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

const SETTINGS_FIELDS = [
  "totalAmount",
  "currency",
  "localCurrency",
  "plannedRate",
] as const;

const EXTRA_FIELDS = [
  "title",
  "date",
  "estimateAmount",
  "estimateCurrency",
  "actualAmount",
  "actualCurrency",
  "actualPaidOn",
  "actualRate",
] as const;

function allowedOf(settings: BudgetSettings) {
  return {
    currency: settings.currency,
    localCurrency: settings.localCurrency,
  };
}

export async function saveBudgetSettingsAction(
  tripId: string,
  prev: BudgetSettingsFormState,
  formData: FormData,
): Promise<BudgetSettingsFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readFields(formData, SETTINGS_FIELDS);
  const fail = (formError: string | null, errors = {}) => ({
    values,
    errors,
    formError,
    savedAt: prev.savedAt,
  });
  const parsed = parseBudgetSettings(values, moneyParsers);
  if (!parsed.ok) return fail(null, parsed.errors);

  let result: Awaited<ReturnType<typeof upsertTripBudget>>;
  try {
    result = await upsertTripBudget(user.id, tripId, parsed.value);
  } catch {
    return fail(SAVE_FAILED);
  }
  if (result === "missing") notFound();
  if (result === "locked") return fail(BUDGET_CURRENCY_LOCKED);

  revalidatePath(tripPath(tripId));
  return { values, errors: {}, formError: null, savedAt: Date.now() };
}

// 여행 날짜 목록과(고치기면) 그 항목의 지금 날짜. 기간 밖으로 밀려난 항목도 날짜를 그대로 두고 고칠 수 있게.
function allowedDates(
  trip: { startDate: string; endDate: string },
  current: string | null,
): string[] {
  const dates = tripDays(trip.startDate, trip.endDate).map((d) => d.date);
  return current && !dates.includes(current) ? [...dates, current] : dates;
}

export async function createExtraItemAction(
  tripId: string,
  prev: ExtraItemFormState,
  formData: FormData,
): Promise<ExtraItemFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readFields(formData, EXTRA_FIELDS);
  const fail = (formError: string | null, errors = {}) => ({
    values,
    errors,
    formError,
    savedAt: prev.savedAt,
  });
  const [trip, settings] = await Promise.all([
    getTrip(user.id, tripId),
    getTripBudget(user.id, tripId),
  ]);
  if (!trip) notFound();
  if (!settings) return fail(BUDGET_NOT_SET);
  const parsed = parseExtraItem(values, allowedOf(settings), moneyParsers, {
    defaultPaidOn: todayInSeoul(),
    tripDates: allowedDates(trip, null),
  });
  if (!parsed.ok) return fail(null, parsed.errors);

  let id: string | null;
  try {
    if (
      (await countBudgetItems(user.id, tripId)) >= MAX_BUDGET_ITEMS_PER_TRIP
    ) {
      return fail(BUDGET_ITEM_LIMIT);
    }
    const actual = parsed.value.actual
      ? await resolveActualRate(parsed.value.actual, null, settings)
      : null;
    id = await createExtraItem(user.id, tripId, {
      title: parsed.value.title,
      date: parsed.value.date,
      estimate: parsed.value.estimate,
      actual,
    });
  } catch {
    return fail(SAVE_FAILED);
  }
  // 확인과 넣기 사이에 설정 통화가 바뀌는 등으로 걸리지 않음.
  if (id === null) return fail(SAVE_FAILED);

  revalidatePath(tripPath(tripId));
  return {
    values: { ...EMPTY_EXTRA_ITEM_FIELDS, date: values.date },
    errors: {},
    formError: null,
    savedAt: Date.now(),
  };
}

export async function updateExtraItemAction(
  tripId: string,
  itemId: string,
  prev: ExtraItemFormState,
  formData: FormData,
): Promise<ExtraItemFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readFields(formData, EXTRA_FIELDS);
  const fail = (formError: string | null, errors = {}) => ({
    values,
    errors,
    formError,
    savedAt: prev.savedAt,
  });
  const [trip, settings, current] = await Promise.all([
    getTrip(user.id, tripId),
    getTripBudget(user.id, tripId),
    getExtraItem(user.id, tripId, itemId),
  ]);
  if (!trip || !current) notFound();
  if (!settings) return fail(BUDGET_NOT_SET);
  const parsed = parseExtraItem(values, allowedOf(settings), moneyParsers, {
    defaultPaidOn: todayInSeoul(),
    tripDates: allowedDates(trip, current.date),
  });
  if (!parsed.ok) return fail(null, parsed.errors);

  let updated: boolean;
  try {
    const actual = parsed.value.actual
      ? await resolveActualRate(
          parsed.value.actual,
          actualOf(current),
          settings,
        )
      : null;
    updated = await updateExtraItem(user.id, tripId, itemId, {
      title: parsed.value.title,
      date: parsed.value.date,
      estimate: parsed.value.estimate,
      actual,
    });
  } catch {
    return fail(SAVE_FAILED);
  }
  if (!updated) return fail(SAVE_FAILED);

  revalidatePath(tripPath(tripId));
  return { values, errors: {}, formError: null, savedAt: Date.now() };
}

export async function deleteExtraItemAction(
  tripId: string,
  itemId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!(await deleteExtraItem(user.id, tripId, itemId))) notFound();

  revalidatePath(tripPath(tripId));
}

// 완료 체크칸을 켠 뒤 열리는 실제 지출 칸(설계 §5.7.3). 빈칸이면 실제를 지운다.
// 결제일은 이미 적어 둔 같은 통화의 결제일, 없으면 그 일정 날짜. 환율은 자동(직접 고치기는 일정 고치기 양식).
export async function setScheduleItemActualAction(
  tripId: string,
  itemId: string,
  amountText: string,
  currency: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (typeof amountText !== "string" || typeof currency !== "string") {
    return { ok: false, error: SAVE_FAILED };
  }

  try {
    const [settings, item, row] = await Promise.all([
      getTripBudget(user.id, tripId),
      getScheduleItem(user.id, tripId, itemId),
      getBudgetItemForSchedule(user.id, tripId, itemId),
    ]);
    if (!item) return { ok: false, error: SAVE_FAILED };
    if (!settings) return { ok: false, error: BUDGET_NOT_SET };
    const previous = row ? actualOf(row) : null;
    const parsed = parseAmountFields(
      {
        ...EMPTY_AMOUNT_FIELDS,
        actualAmount: amountText,
        actualCurrency: currency,
      },
      allowedOf(settings),
      moneyParsers,
      { actualShown: true, defaultPaidOn: item.date },
    );
    if (!parsed.ok) {
      const error =
        parsed.errors.actualAmount ??
        parsed.errors.actualCurrency ??
        SAVE_FAILED;
      return { ok: false, error };
    }

    let actual: ActualMoney | null = null;
    const input = parsed.value.actual;
    if (input) {
      const paidOn =
        previous && previous.currency === input.currency && previous.paidOn
          ? previous.paidOn
          : input.paidOn;
      actual = await resolveActualRate(
        { ...input, paidOn, rateField: undefined },
        previous,
        settings,
      );
    }
    if (!(await setScheduleItemActual(user.id, tripId, itemId, actual))) {
      return { ok: false, error: SAVE_FAILED };
    }
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }

  revalidatePath(tripPath(tripId));
  return { ok: true };
}

// 실제 지출을 적은 일정의 완료를 풀고 실제도 지운다(확인 창 뒤, 설계 §5.7.3). 대상 없음·실패는 똑같이 { ok: false }.
export async function undoScheduleItemWithActualAction(
  tripId: string,
  itemId: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  try {
    if (!(await undoScheduleItemAndClearActual(user.id, tripId, itemId))) {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  revalidatePath(tripPath(tripId));
  return { ok: true };
}
