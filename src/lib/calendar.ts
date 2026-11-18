// 범위 달력의 날짜 계산, 고르기 규칙, 요약 문구. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 날짜는 "YYYY-MM-DD" 문자열, 요일은 일=0 … 토=6. 계산은 UTC 로만 해서 서버·브라우저 시간대의 영향을 받지 않는다.

export type YearMonth = { year: number; month: number };
export type CalendarRange = { first: YearMonth; last: YearMonth };
export type DayCell = { date: string; day: number; weekday: number } | null;
export type Selection = { start: string | null; end: string | null };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS_BEFORE = 12;
const MONTHS_AFTER = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toUtc(value).toISOString().slice(0, 10) === value;
}

function toUtc(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toYearMonth(date: string): YearMonth {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function compare(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

// 오늘의 달 기준 12개월 전 ~ 24개월 뒤. 양식에 날짜가 있으면 그 달까지 넓힌다.
export function calendarRange(
  today: string,
  startDate: string,
  endDate: string,
): CalendarRange {
  const base = toYearMonth(today);
  let first = addMonths(base, -MONTHS_BEFORE);
  let last = addMonths(base, MONTHS_AFTER);
  for (const date of [startDate, endDate]) {
    if (!isDate(date)) continue;
    const ym = toYearMonth(date);
    if (compare(ym, first) < 0) first = ym;
    if (compare(ym, last) > 0) last = ym;
  }
  return { first, last };
}

export function monthsInRange(range: CalendarRange): YearMonth[] {
  const months: YearMonth[] = [];
  for (
    let ym = range.first;
    compare(ym, range.last) <= 0;
    ym = addMonths(ym, 1)
  ) {
    months.push(ym);
  }
  return months;
}

export function yearsInRange(range: CalendarRange): number[] {
  const years: number[] = [];
  for (let y = range.first.year; y <= range.last.year; y++) years.push(y);
  return years;
}

// 한 달의 칸. 1일의 요일만큼 앞에 빈칸(null)을 둔다.
export function monthCells(ym: YearMonth): DayCell[] {
  const firstWeekday = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const cells: DayCell[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: `${ym.year}-${pad(ym.month)}-${pad(day)}`,
      day,
      weekday: (firstWeekday + day - 1) % 7,
    });
  }
  return cells;
}

export function monthTitle(ym: YearMonth): string {
  return `${ym.year}.${pad(ym.month)}`;
}

// 형식이 틀리거나 끝이 시작보다 앞이면 빈 선택으로 시작한다.
export function initialSelection(
  startDate: string,
  endDate: string,
): Selection {
  if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
    return { start: null, end: null };
  }
  return { start: startDate, end: endDate };
}

// 첫 누름 = 시작, 시작 이후(같은 날 포함) = 끝, 시작보다 앞 = 새 시작, 범위가 다 있으면 새 시작.
export function nextSelection(sel: Selection, date: string): Selection {
  if (sel.start === null || sel.end !== null || date < sel.start) {
    return { start: date, end: null };
  }
  return { start: sel.start, end: date };
}

export function stayLength(
  start: string,
  end: string,
): { nights: number; days: number } {
  const nights = Math.round(
    (toUtc(end).getTime() - toUtc(start).getTime()) / DAY_MS,
  );
  return { nights, days: nights + 1 };
}

export function weekdayName(date: string): string {
  return WEEKDAYS[toUtc(date).getUTCDay()];
}

function label(date: string, showYear: boolean): string {
  const [year, month, day] = date.split("-");
  return `${showYear ? `${year}.` : ""}${month}.${day}(${weekdayName(date)})`;
}

// "12.31(목)~2027.01.02(토) · 2박 3일", 같은 날이면 "12.20(일) · 당일치기", 시작만 있으면 "12.31(목)~".
// 시작일은 올해가 아니면, 끝일은 시작일과 다른 해면 연도를 붙인다.
export function formatSelection(sel: Selection, today: string): string {
  if (sel.start === null) return "";
  const thisYear = today.slice(0, 4);
  const startText = label(sel.start, sel.start.slice(0, 4) !== thisYear);
  if (sel.end === null) return `${startText}~`;
  if (sel.end === sel.start) return `${startText} · 당일치기`;
  const endText = label(sel.end, sel.end.slice(0, 4) !== sel.start.slice(0, 4));
  const { nights, days } = stayLength(sel.start, sel.end);
  return `${startText}~${endText} · ${nights}박 ${days}일`;
}
