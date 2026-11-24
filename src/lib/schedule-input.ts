// 일정 입력 검증. 서버(Server Action)에서 쓰고, node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 날짜는 여행 기간 안이어야 한다. 단 고치기에서는 이 일정의 원래 날짜(기간 밖일 수 있음)를 그대로 둘 수 있다.
// 제목은 장소(Google 장소·이 여행 장소·글자)가 있으면 비워 둘 수 있다(#35).
// 장소는 셋 중 하나만 쓴다: Google 장소 → 이 여행 장소(placeId) → 글자 순.

// place-input.ts 와 같은 값. 순수 모듈 규칙 때문에 import 하지 않고 다시 둔다(시험이 같은지 확인한다).
export const SCHEDULE_PLACE_CATEGORIES = [
  "lodging",
  "sight",
  "food",
  "cafe",
  "etc",
] as const;

export type SchedulePlaceCategory = (typeof SCHEDULE_PLACE_CATEGORIES)[number];

export const TITLE_OR_PLACE_REQUIRED = "제목이나 장소를 적어 주세요.";

export type ScheduleFields = {
  date: string;
  time: string;
  title: string;
  place: string;
  placeId: string; // 빈 값 = 직접 적기
  memo: string;
  // 일정 양식에서 고른 Google 장소(저장할 때 '가 볼 곳'에도 넣는다). 빈 값 = 고르지 않음.
  googlePlaceId: string;
  googleLabel: string;
  googleCategory: string;
  // 예산 금액 칸(#14). 일정 검증(parseScheduleInput)은 보지 않고, 예산 설정이 있을 때 budget-input 이 검증한다.
  estimateAmount: string;
  estimateCurrency: string;
  actualAmount: string;
  actualCurrency: string;
  actualPaidOn: string;
  actualRate: string;
  // 내 돈 칸(#89). 같은 6칸을 내 돈 쪽으로 따로 둔다.
  mineEstimateAmount: string;
  mineEstimateCurrency: string;
  mineActualAmount: string;
  mineActualCurrency: string;
  mineActualPaidOn: string;
  mineActualRate: string;
  // 이 일정이 누구의 것인지(#90). 빈 값 = 모두, 값 = 그 사람(사용자 id)만.
  forUserId: string;
};

export type GooglePlacePick = {
  googlePlaceId: string;
  label: string;
  category: SchedulePlaceCategory;
};

export type ScheduleInput = {
  date: string;
  time: string | null;
  title: string | null;
  place: string | null;
  placeId: string | null;
  memo: string | null;
  // 있으면 placeId·place 는 null 이다.
  google: GooglePlacePick | null;
  // null = 모두. 여행 사람인지는 쓰는 문 안에서 확인한다(#90).
  forUserId: string | null;
};

export type ScheduleFieldErrors = Partial<Record<keyof ScheduleFields, string>>;

export type ScheduleInputResult =
  | { ok: true; value: ScheduleInput }
  | { ok: false; errors: ScheduleFieldErrors };

// savedAt: 저장에 성공할 때마다 새 값(Date.now()). 클라이언트가 바뀐 것을 보고 입력칸을 비우거나 접는다.
// notice: 저장은 됐지만 알릴 것(예: 일정은 저장했지만 금액은 못 함, #14). 추가 양식이 새 양식 위에 보인다.
export type ScheduleFormState = {
  values: ScheduleFields;
  errors: ScheduleFieldErrors;
  formError: string | null;
  savedAt: number | null;
  notice?: string | null;
};

export const EMPTY_SCHEDULE_FIELDS: ScheduleFields = {
  date: "",
  time: "",
  title: "",
  place: "",
  placeId: "",
  memo: "",
  googlePlaceId: "",
  googleLabel: "",
  googleCategory: "",
  estimateAmount: "",
  estimateCurrency: "",
  actualAmount: "",
  actualCurrency: "",
  actualPaidOn: "",
  actualRate: "",
  mineEstimateAmount: "",
  mineEstimateCurrency: "",
  mineActualAmount: "",
  mineActualCurrency: "",
  mineActualPaidOn: "",
  mineActualRate: "",
  forUserId: "",
};

export type AllowedDates = {
  startDate: string;
  endDate: string;
  currentDate?: string;
};

const TITLE_MAX = 100;
const PLACE_MAX = 200;
const MEMO_MAX = 2000;
// place-input.ts 의 이름표 상한·Google 장소 id 형식과 같다.
export const SCHEDULE_GOOGLE_LABEL_MAX = 100;
export const SCHEDULE_GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,300}$/;
const GOOGLE_PICK_INVALID = "장소를 찾지 못했어요. 다시 검색해 주세요.";
// ids.ts 의 isUuid 와 같은 형식. 순수 모듈 규칙 때문에 import 하지 않고 여기 둔다.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
// Better Auth 사용자 id 는 uuid 가 아니다. 길이와 글자 종류만 거른다(#90).
const FOR_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
export const FOR_USER_INVALID = "함께하는 사람을 다시 골라 주세요.";

// 글자 수는 코드 포인트 기준이다 (이모지 하나 = 1자).
function length(value: string): number {
  return [...value].length;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

function tooLong(value: string, max: number): string | undefined {
  return length(value) > max ? `${max}자 이하로 입력해 주세요.` : undefined;
}

function checkDate(date: string, allowed: AllowedDates): string | undefined {
  if (!isValidIsoDate(date)) return "날짜를 올바르게 입력해 주세요.";
  const inRange = date >= allowed.startDate && date <= allowed.endDate;
  if (!inRange && date !== allowed.currentDate) {
    return "여행 기간 안의 날짜를 골라 주세요.";
  }
  return undefined;
}

export function parseScheduleInput(
  raw: ScheduleFields,
  allowed: AllowedDates,
): ScheduleInputResult {
  const date = raw.date.trim();
  const time = raw.time.trim();
  const title = raw.title.trim();
  const memo = raw.memo.trim();
  const googlePlaceId = raw.googlePlaceId.trim();
  const googleLabel = raw.googleLabel.trim();
  const googleCategory = raw.googleCategory.trim();
  // Google 장소를 골랐으면 placeId·글자는 쓰지 않는다.
  const hasGoogle = googlePlaceId !== "";
  const place = hasGoogle ? "" : raw.place.trim();
  const placeId = hasGoogle ? "" : raw.placeId.trim();
  const forUserId = raw.forUserId.trim();

  const errors: ScheduleFieldErrors = {};
  const dateError = checkDate(date, allowed);
  if (dateError) errors.date = dateError;
  if (time !== "" && !TIME_PATTERN.test(time)) {
    errors.time = "시각을 올바르게 입력해 주세요.";
  }
  const hasPlace = hasGoogle || placeId !== "" || place !== "";
  const titleError =
    title === ""
      ? hasPlace
        ? undefined
        : TITLE_OR_PLACE_REQUIRED
      : tooLong(title, TITLE_MAX);
  if (titleError) errors.title = titleError;
  const google = hasGoogle
    ? parseGooglePick(googlePlaceId, googleLabel, googleCategory)
    : null;
  if (hasGoogle && !google) errors.place = GOOGLE_PICK_INVALID;
  const placeError = tooLong(place, PLACE_MAX);
  if (placeError) errors.place = placeError;
  if (placeId !== "" && !UUID_PATTERN.test(placeId) && !errors.place) {
    errors.place = "장소를 다시 골라 주세요.";
  }
  const memoError = tooLong(memo, MEMO_MAX);
  if (memoError) errors.memo = memoError;
  if (forUserId !== "" && !FOR_USER_ID_PATTERN.test(forUserId)) {
    errors.forUserId = FOR_USER_INVALID;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      date,
      time: time || null,
      title: title || null,
      place: place || null,
      placeId: placeId || null,
      memo: memo || null,
      google,
      forUserId: forUserId || null,
    },
  };
}

function isSchedulePlaceCategory(
  value: string,
): value is SchedulePlaceCategory {
  return (SCHEDULE_PLACE_CATEGORIES as readonly string[]).includes(value);
}

// 셋 중 하나라도 틀리면 null(장소 칸에 "다시 검색" 오류).
function parseGooglePick(
  googlePlaceId: string,
  label: string,
  category: string,
): GooglePlacePick | null {
  if (!SCHEDULE_GOOGLE_PLACE_ID_PATTERN.test(googlePlaceId)) return null;
  if (label === "" || length(label) > SCHEDULE_GOOGLE_LABEL_MAX) return null;
  if (!isSchedulePlaceCategory(category)) return null;
  return { googlePlaceId, label, category };
}
