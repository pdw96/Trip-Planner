"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  actualOf,
  countBudgetItems,
  createExtraItem,
  deleteExtraItem,
  getExtraItem,
  getScheduleBudgetRows,
  getTripBudget,
  MAX_BUDGET_ITEMS_PER_TRIP,
  setPersonalBudget,
  setScheduleItemActual,
  updateExtraItem,
  upsertTripBudget,
} from "@/db/queries/budget";
import { getScheduleItem } from "@/db/queries/schedule-items";
import { getTrip } from "@/db/queries/trips";
import type { ActualMoney, CurrencySettings } from "@/lib/budget";
import {
  type BudgetSettingsFields,
  EMPTY_AMOUNT_FIELDS,
  EMPTY_EXTRA_ITEM_FIELDS,
  type ExtraItemFields,
  parseAmountFields,
  parseBudgetSettings,
  parseExtraItem,
  parseSide,
  writesPersonalBudget,
  writesSharedSettings,
} from "@/lib/budget-input";
import type { Side } from "@/lib/budget-wallets";
import { tripDays } from "@/lib/schedule";
import { getCurrentUser } from "@/lib/session";
import { todayInSeoul } from "@/lib/trip-dates";
import { moneyParsers, resolveActualRate } from "./budget-rate";
import {
  BUDGET_CURRENCY_CHANGED,
  BUDGET_CURRENCY_LOCKED,
  BUDGET_ITEM_LIMIT,
  BUDGET_NOT_SET,
  PERSONAL_BUDGET_SAVE_FAILED,
  SAVE_FAILED,
} from "./messages";

// 예산 Server Action(#14). tripId·itemId 는 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위)이 막는다. 남의 것과 없는 것은 똑같이 찾을 수 없음.
// 금액 검증에는 그 여행의 통화(예산 설정)가 필요해, 설정·일정을 userId 범위 쿼리로 읽은 뒤 필드를 검증한다
// (CLAUDE.md 순서의 예외. 읽기만 하고, 쓰기는 검증 뒤에 한다).
// 예산 설정 저장도 같은 예외다: 방식 검증에 지금 방식(설정)과 주인인지(여행)가 필요해 둘을 먼저 읽는다.

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
  "mode",
  "totalAmount",
  "myTotal",
  "currency",
  "localCurrency",
  "plannedRate",
] as const;

const EXTRA_FIELDS = [
  "side",
  "title",
  "date",
  "estimateAmount",
  "estimateCurrency",
  "actualAmount",
  "actualCurrency",
  "actualPaidOn",
  "actualRate",
] as const;

function allowedOf(settings: CurrencySettings) {
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
  // 방식은 여행 주인만 바꾼다(#89). 주인이 아니면 보낸 mode 를 무시하고 지금 방식으로 검증한다.
  // 이 판단은 검증용이고, 실제로 막는 것은 upsertTripBudget 의 주인 조건이다.
  const [trip, config] = await Promise.all([
    getTrip(user.id, tripId),
    getTripBudget(user.id, tripId),
  ]);
  if (!trip) notFound();
  const parsed = parseBudgetSettings(values, moneyParsers, {
    currentMode: config?.mode ?? "shared",
    canChangeMode: trip.userId === user.id,
  });
  if (!parsed.ok) return fail(null, parsed.errors);
  const { currency, localCurrency, plannedRate, sharedTotal, mode, myTotal } =
    parsed.value;

  // 모임 값은 이 양식에서 고쳤을 때만 쓴다(처음 정하기·낡은 양식은 언제나). 내 예산만 저장하면
  // 양식을 연 뒤 다른 사람이 바꾼 모임 총액·환율을 옛 값으로 되돌리지 않게 설정 쓰기를 건너뛴다.
  const writeShared = writesSharedSettings(
    config !== null,
    formData.get("sharedDirty"),
  );
  // 건너뛰면 방식도 바꾸지 않았으니 내 예산 판단은 지금 방식(config.mode)으로 한다.
  const effectiveMode = writeShared || !config ? mode : config.mode;

  if (writeShared) {
    let result: Awaited<ReturnType<typeof upsertTripBudget>>;
    try {
      result = await upsertTripBudget(user.id, tripId, {
        currency,
        localCurrency,
        plannedRate,
        sharedTotal,
        mode,
      });
    } catch {
      return fail(SAVE_FAILED);
    }
    if (result === "missing") notFound();
    if (result === "locked") return fail(BUDGET_CURRENCY_LOCKED);
  }

  // 내 예산은 내 돈을 쓰는 방식일 때만 쓴다(빈칸이면 지움). 모임 통장으로 바꿀 때는 그대로 둔다.
  // 이 양식에서 내 예산 칸을 고쳤을 때만 쓴다(myDirty). 통화가 바뀌어 빈칸으로 열린 내 예산을 다른 칸만
  // 고친 저장이 지우지 않게(설계 §5.5). 칸이 없던 낡은 양식은 내 예산을 건드리지 않는다.
  if (
    effectiveMode !== "shared" &&
    writesPersonalBudget(formData.get("myDirty"), formData.has("myTotal"))
  ) {
    // 금액은 양식의 통화(currency)로 읽었다. 그 사이 예산 통화가 바뀌었으면 쿼리가 쓰지 않는다.
    let result: Awaited<ReturnType<typeof setPersonalBudget>>;
    try {
      result = await setPersonalBudget(user.id, tripId, myTotal, currency);
    } catch {
      result = "missing";
    }
    if (result !== "ok") {
      // 설정은 이미 저장됐다(모임 값을 고치지 않았으면 그대로다). 화면을 새로 그리고, 내 예산만 못 했다고 알린다.
      revalidatePath(tripPath(tripId));
      return fail(
        result === "currency-changed"
          ? BUDGET_CURRENCY_CHANGED
          : PERSONAL_BUDGET_SAVE_FAILED,
      );
    }
  }

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
    // 서버는 두 쪽 모두 받는다. 어느 쪽 [+ 지출]을 보일지는 화면이 정하고, 내 돈 행의 주인은
    // 쿼리가 user.id 로 정하므로(폼 입력 아님) 남의 내 돈으로 넣을 수 없다. 보안 영향 없음.
    id = await createExtraItem(user.id, tripId, parsed.value.side, {
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
    values: {
      ...EMPTY_EXTRA_ITEM_FIELDS,
      date: values.date,
      side: values.side,
    },
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
  // 고치기는 쪽을 바꾸지 않는다(행의 owner_user_id 유지). 보낸 side 는 무시하고 그 행의 쪽으로 검증한다.
  const side: Side = current.ownerUserId === null ? "shared" : "mine";
  const parsed = parseExtraItem(
    { ...values, side },
    allowedOf(settings),
    moneyParsers,
    {
      defaultPaidOn: todayInSeoul(),
      tripDates: allowedDates(trip, current.date),
    },
  );
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
  return {
    values: { ...values, side },
    errors: {},
    formError: null,
    savedAt: Date.now(),
  };
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

// 완료 체크칸을 켠 뒤 열리는 실제 지출 칸(설계 §5.7.3, #89 §5.6). 빈칸이면 그 쪽 실제를 지운다.
// side: 어느 쪽(모임 / 내 돈) 실제인가. 서버는 두 쪽 모두 받는다(어느 쪽을 보일지는 화면이 정함).
// 완료 여부는 보지 않는다(미리 결제한 일정은 완료 전에도 실제가 있다).
// 결제일은 이미 적어 둔 같은 통화의 결제일, 없으면 그 일정 날짜. 환율은 자동(직접 고치기는 일정 고치기 양식).
export async function setScheduleItemActualAction(
  tripId: string,
  itemId: string,
  side: Side,
  amountText: string,
  currency: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (typeof amountText !== "string" || typeof currency !== "string") {
    return { ok: false, error: SAVE_FAILED };
  }
  const which = typeof side === "string" ? parseSide(side) : null;
  if (which === null) return { ok: false, error: SAVE_FAILED };

  try {
    const [settings, item, rows] = await Promise.all([
      getTripBudget(user.id, tripId),
      getScheduleItem(user.id, tripId, itemId),
      getScheduleBudgetRows(user.id, tripId, itemId),
    ]);
    if (!item) return { ok: false, error: SAVE_FAILED };
    if (!settings) return { ok: false, error: BUDGET_NOT_SET };
    const row = rows[which];
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
    if (
      !(await setScheduleItemActual(user.id, tripId, itemId, which, actual))
    ) {
      return { ok: false, error: SAVE_FAILED };
    }
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }

  revalidatePath(tripPath(tripId));
  return { ok: true };
}
