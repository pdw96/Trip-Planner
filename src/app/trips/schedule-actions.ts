"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  actualOf,
  estimateOf,
  getScheduleBudgetRows,
  getTripBudget,
  setScheduleItemAmounts,
  type TripBudgetConfig,
} from "@/db/queries/budget";
import {
  countPlaces,
  findPlaceIdByGoogleId,
  MAX_PLACES_PER_TRIP,
} from "@/db/queries/places";
import {
  createScheduleItem,
  createScheduleItemWithNewPlace,
  deleteScheduleItem,
  getScheduleItem,
  listDayOrder,
  setScheduleItemDone,
  updateScheduleItem,
  updateScheduleItemWithNewPlace,
  writeDayOrder,
} from "@/db/queries/schedule-items";
import { listTripPeople } from "@/db/queries/trip-members";
import { getTrip } from "@/db/queries/trips";
import type { BudgetItem } from "@/db/schema";
import type { ActualMoney, Money } from "@/lib/budget";
import {
  type AmountFields,
  type ParsedAmounts,
  parseAmountFields,
  parseSide,
} from "@/lib/budget-input";
import type { Side } from "@/lib/budget-wallets";
import { fetchPlaceCoords } from "@/lib/google-maps-server";
import { isUuid } from "@/lib/ids";
import {
  EMPTY_SCHEDULE_FIELDS,
  FOR_USER_INVALID,
  type GooglePlacePick,
  parseScheduleInput,
  type ScheduleFieldErrors,
  type ScheduleFields,
  type ScheduleFormState,
  type ScheduleInput,
} from "@/lib/schedule-input";
import {
  isReorderOf,
  keepsTimeOrder,
  type OrderItem,
  orderWithItem,
} from "@/lib/schedule-order";
import { getCurrentUser } from "@/lib/session";
import { isValidIsoDate } from "@/lib/trip-input";
import { moneyParsers, resolveActualRate } from "./budget-rate";
import {
  MONEY_SAVE_FAILED,
  PLACE_LIMIT,
  PLACE_NOT_FOUND,
  SAVE_FAILED,
} from "./messages";

// tripId·itemId·date 는 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위), 입력 검증의 날짜 규칙이 막는다.
// Google 장소(#35)는 여행(·일정) 접근을 확인한 뒤에만 Google 을 부르고, 좌표는 서버가 직접 받는다.
// "누구"(forUserId, #90)는 쓰는 문이 같은 문 안에서 여행 사람인지 확인한다. 액션의 사전 확인은 쓰기 전에
// 필드 오류로 돌려주고, 쓰기가 0행일 때 까닭을 가리는 데만 쓴다.

// 고른 장소가 이 여행의 장소가 아니어서(그 사이 지워짐 등) 쓰기가 걸리지 않았을 때의 문구.
const PLACE_GONE = "장소를 다시 골라 주세요.";

// FormData 를 통째로 넘기지 않고 필요한 필드만 문자열로 꺼낸다. 추가는 날짜를 bind 값으로 받는다.
function readScheduleFields(
  formData: FormData,
  date: string | null,
): ScheduleFields {
  const field = (name: keyof ScheduleFields) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    // bind 값도 클라이언트가 바꿀 수 있으므로 문자열이 아니면 빈 값(→ 날짜 오류)으로 본다.
    date: date === null ? field("date") : typeof date === "string" ? date : "",
    time: field("time"),
    title: field("title"),
    place: field("place"),
    placeId: field("placeId"),
    memo: field("memo"),
    googlePlaceId: field("googlePlaceId"),
    googleLabel: field("googleLabel"),
    googleCategory: field("googleCategory"),
    estimateAmount: field("estimateAmount"),
    estimateCurrency: field("estimateCurrency"),
    actualAmount: field("actualAmount"),
    actualCurrency: field("actualCurrency"),
    actualPaidOn: field("actualPaidOn"),
    actualRate: field("actualRate"),
    mineEstimateAmount: field("mineEstimateAmount"),
    mineEstimateCurrency: field("mineEstimateCurrency"),
    mineActualAmount: field("mineActualAmount"),
    mineActualCurrency: field("mineActualCurrency"),
    mineActualPaidOn: field("mineActualPaidOn"),
    mineActualRate: field("mineActualRate"),
    // 칸이 없으면 빈 값(모두). 고치기는 칸이 없을 때 지금 값을 그대로 둔다(updateScheduleItemAction).
    forUserId: field("forUserId"),
  };
}

// "누구" 값이 이 여행 사람인지(#90). null(모두)이나 keep(고치기에서 그 일정의 지금 값, 나간 사람이어도 그대로 저장할
// 수 있다, 설계 §5.6)이면 묻지 않고 ok. 사람 목록을 읽을 수 없으면(여행에 접근할 수 없음) gone.
async function checkForUser(
  userId: string,
  tripId: string,
  forUserId: string | null,
  keep: string | null,
): Promise<"ok" | "invalid" | "gone"> {
  if (forUserId === null || forUserId === keep) return "ok";
  const people = await listTripPeople(userId, tripId);
  if (people === null) return "gone";
  return people.some((p) => p.userId === forUserId) ? "ok" : "invalid";
}

// 양식이 금액 칸을 그린 쪽(hidden "sides", 예 "shared,mine", #89). 모르는 글자는 버린다.
// 칸이 없으면(그 칸이 생기기 전의 낡은 양식) 모임 쪽만 그린 것으로 본다. 그린 쪽만 읽고 쓴다
// (그리지 않은 쪽을 빈 값으로 읽어 저장된 금액을 지우지 않게).
function readSides(formData: FormData): Side[] {
  const raw = formData.get("sides");
  if (typeof raw !== "string") return ["shared"];
  const sides: Side[] = [];
  for (const token of raw.split(",")) {
    const side = parseSide(token.trim());
    if (side !== null && !sides.includes(side)) sides.push(side);
  }
  return sides;
}

// --- 예산 금액 (#14, 쪽별 #89) ---
// 예산 설정이 있는 여행에서만 일정 양식의 금액 칸을 읽는다. 일정 쓰기(이미 데이터를 바꾸는 CTE)와 한 문에 합치지 않고,
// 일정을 저장한 뒤 금액이 바뀐 쪽만 쓴다. 금액만 실패하면 일정은 남기고 알린다(설계 §5.7.2).
// 쪽(모임 / 내 돈)마다 6칸이 따로 있다. 내 돈 칸은 mine* 이름으로 오고, 오류도 mine* 키로 돌려준다.
// 서버는 두 쪽 모두 받는다(어느 쪽을 보일지는 화면이 정함). 내 돈 행의 주인은 쿼리가 userId 로 정한다.

const MINE_FIELD: Record<keyof AmountFields, keyof ScheduleFields> = {
  estimateAmount: "mineEstimateAmount",
  estimateCurrency: "mineEstimateCurrency",
  actualAmount: "mineActualAmount",
  actualCurrency: "mineActualCurrency",
  actualPaidOn: "mineActualPaidOn",
  actualRate: "mineActualRate",
};

const AMOUNT_KEYS = Object.keys(MINE_FIELD) as (keyof AmountFields)[];

// 그 쪽 칸을 AmountFields 모양으로 꺼낸다.
function amountFieldsOf(values: ScheduleFields, side: Side): AmountFields {
  const out = {} as AmountFields;
  for (const key of AMOUNT_KEYS) {
    out[key] = side === "mine" ? values[MINE_FIELD[key]] : values[key];
  }
  return out;
}

type SideAmounts = {
  side: Side;
  amounts: ParsedAmounts & { actualTouched: boolean };
};

type MoneyPlan = {
  settings: TripBudgetConfig;
  sides: SideAmounts[];
} | null;

type PreviousRows = Awaited<ReturnType<typeof getScheduleBudgetRows>>;

// actualShown: 쪽마다 실제 칸을 읽을지(그 칸을 실제로 그린 양식이 보낸 표시가 있을 때만).
async function parseMoney(
  userId: string,
  tripId: string,
  values: ScheduleFields,
  sides: Side[],
  opts: { actualShown: Record<Side, boolean>; defaultPaidOn: string },
): Promise<
  { ok: true; plan: MoneyPlan } | { ok: false; errors: ScheduleFieldErrors }
> {
  const settings = await getTripBudget(userId, tripId);
  if (!settings) return { ok: true, plan: null };
  const allowed = {
    currency: settings.currency,
    localCurrency: settings.localCurrency,
  };
  const errors: ScheduleFieldErrors = {};
  const parsedSides: SideAmounts[] = [];
  for (const side of sides) {
    const parsed = parseAmountFields(
      amountFieldsOf(values, side),
      allowed,
      moneyParsers,
      {
        actualShown: opts.actualShown[side],
        defaultPaidOn: opts.defaultPaidOn,
      },
    );
    if (parsed.ok) {
      parsedSides.push({ side, amounts: parsed.value });
      continue;
    }
    for (const key of AMOUNT_KEYS) {
      const message = parsed.errors[key];
      if (message !== undefined) {
        errors[side === "mine" ? MINE_FIELD[key] : key] = message;
      }
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, plan: { settings, sides: parsedSides } };
}

function sameMoney(a: Money | null, b: Money | null): boolean {
  if (a === null || b === null) return a === b;
  return a.amount === b.amount && a.currency === b.currency;
}

function sameActual(a: ActualMoney | null, b: ActualMoney | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    sameMoney(a, b) &&
    a.paidOn === b.paidOn &&
    a.rate === b.rate &&
    a.rateSource === b.rateSource
  );
}

// 한 쪽의 금액이 그 쪽 처음 값(previous)과 다르면 쓴다. 실패하면 false.
async function writeSide(
  userId: string,
  tripId: string,
  itemId: string,
  settings: TripBudgetConfig,
  { side, amounts }: SideAmounts,
  previous: BudgetItem | null,
): Promise<boolean> {
  const prevEstimate = previous ? estimateOf(previous) : null;
  const prevActual = previous ? actualOf(previous) : null;
  try {
    let actual: ActualMoney | null = prevActual;
    if (amounts.actualTouched) {
      actual = amounts.actual
        ? await resolveActualRate(amounts.actual, prevActual, settings)
        : null;
    }
    if (
      sameMoney(prevEstimate, amounts.estimate) &&
      sameActual(prevActual, actual)
    ) {
      return true;
    }
    return await setScheduleItemAmounts(userId, tripId, itemId, side, {
      estimate: amounts.estimate,
      actual,
    });
  } catch {
    return false;
  }
}

// 바뀐 쪽만 쓴다. 한 쪽이라도 실패하면 false(일정은 이미 저장됨). 다른 쪽은 그대로 시도한다.
async function writeMoney(
  userId: string,
  tripId: string,
  itemId: string,
  plan: MoneyPlan,
  previous: PreviousRows | null,
): Promise<boolean> {
  if (!plan) return true;
  const results = await Promise.all(
    plan.sides.map((entry) =>
      writeSide(
        userId,
        tripId,
        itemId,
        plan.settings,
        entry,
        previous?.[entry.side] ?? null,
      ),
    ),
  );
  return results.every(Boolean);
}

function tripPath(tripId: string): string {
  return `/trips/${tripId}`;
}

// 고른 Google 장소 값을 비운다(장소를 다시 고르게 할 때).
function withoutGoogle(values: ScheduleFields): ScheduleFields {
  return { ...values, googlePlaceId: "", googleLabel: "", googleCategory: "" };
}

// --- 그날 순서 (#41) ---

// 한 번에 저장하는 하루 일정 수 상한(요청 크기 상한).
const MAX_ITEMS_PER_DAY = 200;

// 쓰기 전 그날 순서. 읽지 못하면 null(자리 정하기를 건너뛴다. 일정 저장은 그대로 한다).
async function dayOrderBeforeWrite(
  userId: string,
  tripId: string,
  date: string,
): Promise<OrderItem[] | null> {
  try {
    return await listDayOrder(userId, tripId, date);
  } catch {
    return null;
  }
}

// 넣기·고치기가 성공한 뒤 그날 순서를 규칙대로 다시 쓴다(설계 §5.2). 실패해도 일정은 저장됐으므로 오류로
// 돌려주지 않는다. 그 줄은 맨 뒤나 옛 자리에 보일 수 있고, 끌어 옮기면 다시 맞춰진다.
async function settleDayOrder(
  userId: string,
  tripId: string,
  date: string,
  before: OrderItem[] | null,
  item: OrderItem,
): Promise<void> {
  if (before === null) return;
  const ids = orderWithItem(before, item);
  if (ids === null) return;
  try {
    if (!(await writeDayOrder(userId, tripId, date, ids))) {
      console.warn("[schedule-order] 그날 순서를 모두 쓰지 못했어요.");
    }
  } catch {
    console.warn("[schedule-order] 그날 순서를 쓰지 못했어요.");
  }
}

type GoogleResolution =
  | { kind: "existing"; placeId: string }
  | { kind: "new"; coords: { lat: number; lng: number } }
  | { kind: "error"; message: string };

// 같은 Google 장소가 이 여행에 이미 있으면 그 장소로(Google 을 부르지 않음).
// 없으면 장소 수 상한을 먼저 확인하고(호출 비용 상한, place-actions 와 같은 이유) 서버 키로 좌표를 받는다.
// 호출하는 쪽이 여행(·일정) 접근을 이미 확인했다.
async function resolveGooglePlace(
  userId: string,
  tripId: string,
  googlePlaceId: string,
): Promise<GoogleResolution> {
  try {
    const existing = await findPlaceIdByGoogleId(userId, tripId, googlePlaceId);
    if (existing) return { kind: "existing", placeId: existing };
    if ((await countPlaces(userId, tripId)) >= MAX_PLACES_PER_TRIP) {
      return { kind: "error", message: PLACE_LIMIT };
    }
  } catch {
    return { kind: "error", message: SAVE_FAILED };
  }
  const coords = await fetchPlaceCoords(googlePlaceId);
  if (!coords.ok) {
    return {
      kind: "error",
      message: coords.notFound ? PLACE_NOT_FOUND : SAVE_FAILED,
    };
  }
  return { kind: "new", coords: { lat: coords.lat, lng: coords.lng } };
}

// 쓰기 결과. placeLinked: 장소를 이으려 했는가(0행일 때 "장소를 다시 골라 주세요"로 돌려줄지 정한다).
type WriteOutcome =
  | { kind: "written" }
  | { kind: "missed"; placeLinked: boolean }
  | { kind: "error"; message: string };

// Google 장소가 있으면 기존 장소 경로 또는 장소+일정 한 문 쓰기로, 없으면 지금 쓰기로.
async function writeWithPlace(
  userId: string,
  tripId: string,
  input: ScheduleInput,
  write: (input: ScheduleInput) => Promise<boolean>,
  writeWithNewPlace: (
    input: ScheduleInput & { google: GooglePlacePick },
    coords: { lat: number; lng: number },
  ) => Promise<boolean>,
): Promise<WriteOutcome> {
  const { google } = input;
  let resolution: GoogleResolution | null = null;
  if (google) {
    resolution = await resolveGooglePlace(userId, tripId, google.googlePlaceId);
    if (resolution.kind === "error") return resolution;
  }
  let written: boolean;
  try {
    if (google && resolution?.kind === "new") {
      written = await writeWithNewPlace(
        { ...input, google },
        resolution.coords,
      );
    } else if (resolution?.kind === "existing") {
      written = await write({
        ...input,
        google: null,
        placeId: resolution.placeId,
      });
    } else {
      written = await write(input);
    }
  } catch {
    return { kind: "error", message: SAVE_FAILED };
  }
  if (written) return { kind: "written" };
  return {
    kind: "missed",
    placeLinked: google !== null || input.placeId !== null,
  };
}

export async function createScheduleItemAction(
  tripId: string,
  date: string,
  prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readScheduleFields(formData, date);
  const trip = await getTrip(user.id, tripId);
  if (!trip) notFound();
  const parsed = parseScheduleInput(values, trip);
  // 추가 양식에는 실제 지출 칸이 없다(실제는 완료 체크칸이나 고치기 양식에서, §5.7.3).
  const money = await parseMoney(user.id, tripId, values, readSides(formData), {
    actualShown: { shared: false, mine: false },
    defaultPaidOn: values.date,
  });
  const person = parsed.ok
    ? await checkForUser(user.id, tripId, parsed.value.forUserId, null)
    : "ok";
  if (person === "gone") notFound();
  if (!parsed.ok || !money.ok || person === "invalid") {
    return {
      values,
      errors: {
        ...(parsed.ok ? {} : parsed.errors),
        ...(money.ok ? {} : money.errors),
        ...(person === "invalid" ? { forUserId: FOR_USER_INVALID } : {}),
      },
      formError: null,
      savedAt: prev.savedAt,
    };
  }

  const before = await dayOrderBeforeWrite(user.id, tripId, parsed.value.date);
  // 콜백 안에서 새 일정 id 를 받아 둔다(그 뒤 그날 순서에 넣는다).
  const created: { id: string | null } = { id: null };
  const outcome = await writeWithPlace(
    user.id,
    tripId,
    parsed.value,
    async (input) => {
      created.id = await createScheduleItem(user.id, tripId, input);
      return created.id !== null;
    },
    async (input, coords) => {
      created.id = await createScheduleItemWithNewPlace(
        user.id,
        tripId,
        input,
        coords,
      );
      return created.id !== null;
    },
  );
  if (outcome.kind === "error") {
    return {
      values,
      errors: parsed.value.google ? { place: outcome.message } : {},
      formError: parsed.value.google ? null : outcome.message,
      savedAt: prev.savedAt,
    };
  }
  if (outcome.kind === "missed") {
    // "누구"로 고른 사람이 그 사이 여행을 나갔으면 사람을 다시 고르게 한다(사람 목록이 바뀌었으니 새로 그린다).
    // 사람 확인은 다시 읽어 확실히 가릴 수 있으므로 장소보다 먼저 본다.
    if (
      (await checkForUser(user.id, tripId, parsed.value.forUserId, null)) ===
      "invalid"
    ) {
      revalidatePath(tripPath(tripId));
      return {
        values,
        errors: { forUserId: FOR_USER_INVALID },
        formError: null,
        savedAt: prev.savedAt,
      };
    }
    // 장소를 골랐는데 쓰기가 걸리지 않았고 여행은 여전히 보이면, 고른 장소가 그 사이 지워진 것이다
    // (Google 장소면 넣는 사이 다른 쪽에서 같은 장소가 들어온 경우 등).
    // 내 여행 안의 일이므로 notFound 대신 장소를 다시 고르게 한다. 여행이 안 보이면 지금처럼 찾을 수 없음.
    if (outcome.placeLinked && (await getTrip(user.id, tripId))) {
      revalidatePath(tripPath(tripId));
      return {
        values: { ...withoutGoogle(values), placeId: "" },
        errors: { place: PLACE_GONE },
        formError: null,
        savedAt: prev.savedAt,
      };
    }
    notFound();
  }

  let moneySaved = true;
  if (created.id !== null) {
    await settleDayOrder(user.id, tripId, parsed.value.date, before, {
      id: created.id,
      time: parsed.value.time,
    });
    moneySaved = await writeMoney(
      user.id,
      tripId,
      created.id,
      money.plan,
      null,
    );
  }
  revalidatePath(tripPath(tripId));
  return {
    values: { ...EMPTY_SCHEDULE_FIELDS, date },
    errors: {},
    formError: null,
    savedAt: Date.now(),
    notice: moneySaved ? null : MONEY_SAVE_FAILED,
  };
}

export async function updateScheduleItemAction(
  tripId: string,
  itemId: string,
  prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const read = readScheduleFields(formData, null);
  const [trip, item, budgetRows] = await Promise.all([
    getTrip(user.id, tripId),
    getScheduleItem(user.id, tripId, itemId),
    getScheduleBudgetRows(user.id, tripId, itemId),
  ]);
  if (!trip || !item) notFound();
  // "누구" 칸이 없으면(칸이 생기기 전의 낡은 양식, 칸을 숨긴 양식) 지금 값을 그대로 둔다(몰래 모두로 바뀌지 않게, #90).
  const values: ScheduleFields = formData.has("forUserId")
    ? read
    : { ...read, forUserId: item.forUserId ?? "" };
  const parsed = parseScheduleInput(values, {
    startDate: trip.startDate,
    endDate: trip.endDate,
    currentDate: item.date,
  });
  // 고치기 양식은 완료와 상관없이 실제 지출 칸을 보인다(미리 결제, #89 §5.6).
  // 그 쪽 실제 칸은 그 칸을 실제로 그린 양식이 보낸 표시(모임 actualShown=1, 내 돈 mineActualShown=1)가 있을 때만 읽는다.
  // 표시가 없으면 칸이 없던 낡은 양식이 다른 탭에서 적은 실제를 지우지 않게 저장된 실제를 그대로 둔다.
  // (완료 풀기가 더는 실제를 지우지 않으므로 "지금도 완료됐거나 실제가 있는가" 검사는 없앴다.)
  const money = await parseMoney(user.id, tripId, values, readSides(formData), {
    actualShown: {
      shared: formData.get("actualShown") === "1",
      mine: formData.get("mineActualShown") === "1",
    },
    defaultPaidOn: parsed.ok ? parsed.value.date : item.date,
  });
  const person = parsed.ok
    ? await checkForUser(
        user.id,
        tripId,
        parsed.value.forUserId,
        item.forUserId,
      )
    : "ok";
  if (person === "gone") notFound();
  if (!parsed.ok || !money.ok || person === "invalid") {
    return {
      values,
      errors: {
        ...(parsed.ok ? {} : parsed.errors),
        ...(money.ok ? {} : money.errors),
        ...(person === "invalid" ? { forUserId: FOR_USER_INVALID } : {}),
      },
      formError: null,
      savedAt: prev.savedAt,
    };
  }

  // 옮겨 갈(또는 그대로인) 날의 고치기 전 순서. 같은 날이면 이 일정의 고치기 전 자리가 들어 있다.
  const before = await dayOrderBeforeWrite(user.id, tripId, parsed.value.date);
  const outcome = await writeWithPlace(
    user.id,
    tripId,
    parsed.value,
    (input) => updateScheduleItem(user.id, tripId, itemId, input),
    (input, coords) =>
      updateScheduleItemWithNewPlace(user.id, tripId, itemId, input, coords),
  );
  if (outcome.kind === "error") {
    return {
      values,
      errors: parsed.value.google ? { place: outcome.message } : {},
      formError: parsed.value.google ? null : outcome.message,
      savedAt: prev.savedAt,
    };
  }
  if (outcome.kind === "missed") {
    // 추가와 같다. 일정이 여전히 보이면 먼저 "누구"를 다시 확인하고(그 사이 사람이 나갔거나, 다른 창에서 이 일정의
    // "누구"가 바뀌어 지금 값과 달라짐), 아니면 고른 장소가 그 사이 지워진 것이므로 장소를 다시 고르게 한다.
    // 글자 칸은 지금 일정의 장소 글자(이어졌던 장소의 이름표)로 채워 돌려준다.
    const current = await getScheduleItem(user.id, tripId, itemId);
    if (current) {
      const person = await checkForUser(
        user.id,
        tripId,
        parsed.value.forUserId,
        current.forUserId,
      );
      if (person === "invalid") {
        revalidatePath(tripPath(tripId));
        return {
          values,
          errors: { forUserId: FOR_USER_INVALID },
          formError: null,
          savedAt: prev.savedAt,
        };
      }
      if (outcome.placeLinked) {
        revalidatePath(tripPath(tripId));
        return {
          values: {
            ...withoutGoogle(values),
            placeId: "",
            place: current.place ?? "",
          },
          errors: { place: PLACE_GONE },
          formError: null,
          savedAt: prev.savedAt,
        };
      }
    }
    notFound();
  }

  await settleDayOrder(user.id, tripId, parsed.value.date, before, {
    id: itemId,
    time: parsed.value.time,
  });
  const moneySaved = await writeMoney(
    user.id,
    tripId,
    itemId,
    money.plan,
    budgetRows,
  );
  revalidatePath(tripPath(tripId));
  if (!moneySaved) {
    // 일정은 저장됐다. 양식을 연 채 알리고, 다시 저장하면 같은 일정에 금액만 다시 쓴다.
    return {
      values,
      errors: {},
      formError: MONEY_SAVE_FAILED,
      savedAt: prev.savedAt,
    };
  }
  return { values, errors: {}, formError: null, savedAt: Date.now() };
}

// 끌어 놓은 그날 순서를 저장한다(#41). 완료 체크처럼 대상 없음·검증 실패·저장 실패를 똑같이 { ok: false } 로
// 돌려준다(남의 일정이 있는지 드러나지 않게). 보낸 목록이 그날 지금 일정과 다르면(그 사이 다른 창에서 넣거나
// 지움) 저장하지 않는다.
export async function reorderScheduleItemsAction(
  tripId: string,
  date: string,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (
    typeof tripId !== "string" ||
    typeof date !== "string" ||
    !isValidIsoDate(date) ||
    !Array.isArray(orderedIds) ||
    orderedIds.length === 0 ||
    orderedIds.length > MAX_ITEMS_PER_DAY ||
    !orderedIds.every((id) => typeof id === "string" && isUuid(id)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return { ok: false };
  }

  try {
    const current = await listDayOrder(user.id, tripId, date);
    const byId = new Map(current.map((item) => [item.id, item]));
    if (
      !isReorderOf(
        orderedIds,
        current.map((item) => item.id),
      )
    ) {
      return { ok: false };
    }
    const next = orderedIds.map((id) => byId.get(id) as OrderItem);
    if (!keepsTimeOrder(next)) return { ok: false };
    if (!(await writeDayOrder(user.id, tripId, date, orderedIds))) {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  revalidatePath(tripPath(tripId));
  return { ok: true };
}

// 줄에서 바로 부르는 낙관적 갱신이라, 대상 없음과 저장 실패를 똑같이 { ok: false } 로 돌려준다
// (반응이 같으므로 남의 일정이 있는지 드러나지 않는다).
export async function setScheduleItemDoneAction(
  tripId: string,
  itemId: string,
  done: boolean,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (typeof done !== "boolean") return { ok: false };

  let updated: boolean;
  try {
    // 완료를 풀어도 실제 지출은 지우지 않는다(#89 §5.6: 미리 결제한 일정, 사람마다인 실제).
    updated = await setScheduleItemDone(user.id, tripId, itemId, done);
  } catch {
    return { ok: false };
  }
  if (!updated) return { ok: false };

  revalidatePath(tripPath(tripId));
  return { ok: true };
}

export async function deleteScheduleItemAction(
  tripId: string,
  itemId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!(await deleteScheduleItem(user.id, tripId, itemId))) notFound();

  revalidatePath(tripPath(tripId));
}
