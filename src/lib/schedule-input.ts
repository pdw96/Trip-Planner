// 일정 입력 검증. 서버(Server Action)에서 쓰고, node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 날짜는 여행 기간 안이어야 한다. 단 고치기에서는 이 일정의 원래 날짜(기간 밖일 수 있음)를 그대로 둘 수 있다.

export type ScheduleFields = {
  date: string;
  time: string;
  title: string;
  place: string;
  memo: string;
};

export type ScheduleInput = {
  date: string;
  time: string | null;
  title: string;
  place: string | null;
  memo: string | null;
};

export type ScheduleFieldErrors = Partial<Record<keyof ScheduleFields, string>>;

export type ScheduleInputResult =
  | { ok: true; value: ScheduleInput }
  | { ok: false; errors: ScheduleFieldErrors };

// savedAt: 저장에 성공할 때마다 새 값(Date.now()). 클라이언트가 바뀐 것을 보고 입력칸을 비우거나 접는다.
export type ScheduleFormState = {
  values: ScheduleFields;
  errors: ScheduleFieldErrors;
  formError: string | null;
  savedAt: number | null;
};

export const EMPTY_SCHEDULE_FIELDS: ScheduleFields = {
  date: "",
  time: "",
  title: "",
  place: "",
  memo: "",
};

export type AllowedDates = {
  startDate: string;
  endDate: string;
  currentDate?: string;
};

const TITLE_MAX = 100;
const PLACE_MAX = 200;
const MEMO_MAX = 2000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  const place = raw.place.trim();
  const memo = raw.memo.trim();

  const errors: ScheduleFieldErrors = {};
  const dateError = checkDate(date, allowed);
  if (dateError) errors.date = dateError;
  if (time !== "" && !TIME_PATTERN.test(time)) {
    errors.time = "시각을 올바르게 입력해 주세요.";
  }
  const titleError =
    title === "" ? "제목을 입력해 주세요." : tooLong(title, TITLE_MAX);
  if (titleError) errors.title = titleError;
  const placeError = tooLong(place, PLACE_MAX);
  if (placeError) errors.place = placeError;
  const memoError = tooLong(memo, MEMO_MAX);
  if (memoError) errors.memo = memoError;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      date,
      time: time || null,
      title,
      place: place || null,
      memo: memo || null,
    },
  };
}
