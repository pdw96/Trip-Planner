// 여행 입력 검증. 서버(Server Action)에서 쓰고, node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 날짜 규칙은 DB 의 trips_dates_check(end_date >= start_date)와 같다.

export type TripFields = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  notes: string;
};

export type TripInput = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  notes: string | null;
};

export type TripFieldErrors = Partial<Record<keyof TripFields, string>>;

export type TripInputResult =
  | { ok: true; value: TripInput }
  | { ok: false; errors: TripFieldErrors };

export type TripFormState = {
  values: TripFields;
  errors: TripFieldErrors;
  formError: string | null;
};

export const EMPTY_TRIP_FIELDS: TripFields = {
  title: "",
  destination: "",
  startDate: "",
  endDate: "",
  notes: "",
};

const NAME_MAX = 100;
const NOTES_MAX = 2000;

// 글자 수는 코드 포인트 기준이다 (이모지 하나 = 1자).
function length(value: string): number {
  return [...value].length;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

function checkName(value: string, emptyMessage: string): string | undefined {
  if (value === "") return emptyMessage;
  if (length(value) > NAME_MAX) return `${NAME_MAX}자 이하로 입력해 주세요.`;
  return undefined;
}

function checkDate(value: string, emptyMessage: string): string | undefined {
  if (value === "") return emptyMessage;
  if (!isValidIsoDate(value)) return "날짜를 올바르게 입력해 주세요.";
  return undefined;
}

export function parseTripInput(raw: TripFields): TripInputResult {
  const title = raw.title.trim();
  const destination = raw.destination.trim();
  const startDate = raw.startDate.trim();
  const endDate = raw.endDate.trim();
  const notes = raw.notes.trim();

  const errors: TripFieldErrors = {};
  const titleError = checkName(title, "여행 이름을 입력해 주세요.");
  if (titleError) errors.title = titleError;
  const destinationError = checkName(destination, "여행지를 입력해 주세요.");
  if (destinationError) errors.destination = destinationError;
  const startError = checkDate(startDate, "시작 날짜를 입력해 주세요.");
  if (startError) errors.startDate = startError;
  const endError = checkDate(endDate, "끝 날짜를 입력해 주세요.");
  if (endError) errors.endDate = endError;
  if (!startError && !endError && endDate < startDate) {
    errors.endDate = "끝 날짜는 시작 날짜와 같거나 그 뒤여야 해요.";
  }
  if (length(notes) > NOTES_MAX) {
    errors.notes = `${NOTES_MAX}자 이하로 입력해 주세요.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { title, destination, startDate, endDate, notes: notes || null },
  };
}
