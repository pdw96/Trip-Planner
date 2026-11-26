// 한국 날짜 기준 "오늘", 여행 목록 나누기, 날짜 표시. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 날짜는 DB 의 date 컬럼 그대로인 "YYYY-MM-DD" 문자열로 다룬다(Date 로 바꾸면 시간대가 끼어든다).

const SEOUL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 로케일 출력 형식에 기대지 않도록 부분별로 꺼내 조립한다.
export function todayInSeoul(now: Date = new Date()): string {
  const part = (type: string) =>
    SEOUL_DATE.formatToParts(now).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

type Dated = { startDate: string; endDate: string; createdAt: Date };

function byCreatedAt(a: Dated, b: Dated): number {
  return a.createdAt.getTime() - b.createdAt.getTime();
}

// 다가오는 여행: 끝 날짜가 오늘 이후(오늘 포함), 시작 날짜가 가까운 순.
// 지난 여행: 끝 날짜가 오늘 전, 최근에 끝난 순.
export function splitTrips<T extends Dated>(
  trips: T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const upcoming = trips
    .filter((t) => t.endDate >= today)
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        byCreatedAt(a, b),
    );
  const past = trips
    .filter((t) => t.endDate < today)
    .sort(
      (a, b) =>
        b.endDate.localeCompare(a.endDate) ||
        b.startDate.localeCompare(a.startDate) ||
        byCreatedAt(a, b),
    );
  return { upcoming, past };
}

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

const SEPARATOR = " – ";

export function formatShortRange(
  startDate: string,
  endDate: string,
  today: string,
): string {
  const start = parts(startDate);
  const end = parts(endDate);
  const thisYear = parts(today).year;
  const startText = `${start.year !== thisYear ? `${start.year}/` : ""}${start.month}/${start.day}`;
  if (startDate === endDate) return startText;
  const endText = `${end.year !== start.year ? `${end.year}/` : ""}${end.month}/${end.day}`;
  return `${startText}${SEPARATOR}${endText}`;
}

export function formatLongRange(startDate: string, endDate: string): string {
  const start = parts(startDate);
  const end = parts(endDate);
  const startText = `${start.year}년 ${start.month}월 ${start.day}일`;
  if (startDate === endDate) return startText;
  const endText = `${end.year !== start.year ? `${end.year}년 ` : ""}${end.month}월 ${end.day}일`;
  return `${startText}${SEPARATOR}${endText}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date: string): number {
  const { year, month, day } = parts(date);
  return Date.UTC(year, month - 1, day);
}

// 여행 목록의 남은 날 표시(#53). 지난 여행은 null.
export function tripCountdown(
  startDate: string,
  endDate: string,
  today: string,
): string | null {
  if (endDate < today) return null;
  if (startDate <= today) return "여행 중";
  const days = Math.round((utcDay(startDate) - utcDay(today)) / DAY_MS);
  return days === 1 ? "내일 출발" : `${days}일 남음`;
}

// 탭 화면(#122)의 여행 나누기. 함께하는 여행(멤버가 있음)은 함께 탭, 혼자·기록은 내 여행의 "앞으로",
// 끝난 여행은 모두 "추억"(시작 연도로 묶음). 모든 여행이 정확히 한 곳에 들어간다.
// 다음 여행 = 끝나지 않은 여행 중 기록이 아닌 것의 첫째(기록은 내가 나온 여행이라 "갈 여행"이 아니다).
type Groupable = Dated & {
  hasMembers: boolean;
  detachedAt: Date | string | null;
};

export function groupTrips<T extends Groupable>(
  trips: T[],
  today: string,
): {
  next: T | null;
  together: T[];
  ahead: T[];
  memories: { year: string; trips: T[] }[];
  memoryCount: number;
  thisYearCount: number;
} {
  const { upcoming, past } = splitTrips(trips, today);
  const together = upcoming.filter((t) => t.hasMembers);
  const ahead = upcoming.filter((t) => !t.hasMembers);
  const next = upcoming.find((t) => t.detachedAt === null) ?? null;
  const byYear = new Map<string, T[]>();
  for (const trip of past) {
    const year = trip.startDate.slice(0, 4);
    const list = byYear.get(year);
    if (list) list.push(trip);
    else byYear.set(year, [trip]);
  }
  const memories = [...byYear]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, list]) => ({ year, trips: list }));
  const thisYear = today.slice(0, 4);
  return {
    next,
    together,
    ahead,
    memories,
    memoryCount: past.length,
    thisYearCount: byYear.get(thisYear)?.length ?? 0,
  };
}

// 홈 "다음 여행" 카드의 남은 날(#122). 시작 전 "D-N", 여행 중 "여행 중 · N일째"(첫날 1일째). 끝난 여행에는 쓰지 않는다.
export function nextTripBadge(startDate: string, today: string): string {
  if (startDate > today) {
    const days = Math.round((utcDay(startDate) - utcDay(today)) / DAY_MS);
    return `D-${days}`;
  }
  return `여행 중 · ${tripDayCount(startDate, today)}일째`;
}

// 여행 날 수(시작·끝 포함). 날을 펼치지 않고 센다(여행 기간 상한이 없어 아주 긴 여행도 목록이 느려지지 않게, PR #57 Codex 지적).
export function tripDayCount(startDate: string, endDate: string): number {
  return Math.round((utcDay(endDate) - utcDay(startDate)) / DAY_MS) + 1;
}

// 여행 화면에서 고른 날(#53 설계 §5.4.1). "all" 이거나 여행 기간 안 날짜면 그대로, 아니면(여행 날짜를 바꿔
// 사라진 날) "all". 날짜는 "YYYY-MM-DD" 문자열끼리 비교한다.
export function resolveSelection(
  selected: string,
  startDate: string,
  endDate: string,
): string {
  if (selected === "all") return selected;
  return /^\d{4}-\d{2}-\d{2}$/.test(selected) &&
    selected >= startDate &&
    selected <= endDate
    ? selected
    : "all";
}

// 여행 머리의 숙박 길이: "당일" | "2박 3일".
export function stayLength(startDate: string, endDate: string): string {
  const days = tripDayCount(startDate, endDate);
  return days <= 1 ? "당일" : `${days - 1}박 ${days}일`;
}
