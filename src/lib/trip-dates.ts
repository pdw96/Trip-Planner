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
