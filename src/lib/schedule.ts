// 일정표의 날짜 칸, 일정 묶기·정렬, 표시 문구. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 날짜는 "YYYY-MM-DD" 문자열, 계산은 UTC 로만 해서 서버·브라우저 시간대의 영향을 받지 않는다.

export type SortableItem = {
  id: string;
  date: string;
  time: string | null;
  createdAt: Date;
};

export type TripDay = { date: string; dayNumber: number; label: string };

export type ScheduleGroups<T> = {
  days: { day: TripDay; items: T[] }[];
  outside: { date: string; label: string; items: T[] }[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
}

function toUtc(date: string): Date {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function nextDate(date: string): string {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

// "12월 6일 (일)", withYear 면 "2027년 1월 1일 (금)".
export function dateLabel(date: string, withYear: boolean): string {
  const [year, month, day] = parts(date);
  const weekday = WEEKDAYS[toUtc(date).getUTCDay()];
  return `${withYear ? `${year}년 ` : ""}${month}월 ${day}일 (${weekday})`;
}

// 여행 기간의 모든 날. label 은 "1일차 · 12월 3일 (목)".
export function tripDays(startDate: string, endDate: string): TripDay[] {
  const days: TripDay[] = [];
  for (let date = startDate; date <= endDate; date = nextDate(date)) {
    const dayNumber = days.length + 1;
    days.push({
      date,
      dayNumber,
      label: `${dayNumber}일차 · ${dateLabel(date, false)}`,
    });
  }
  return days;
}

// 날짜 → 시각 있는 것(시각 순) → 시각 없는 것 → 만든 순서 → id.
export function compareScheduleItems(a: SortableItem, b: SortableItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  }
  const created = a.createdAt.getTime() - b.createdAt.getTime();
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// 여행 기간 안의 일정은 날짜 칸별로, 밖의 일정은 날짜별로 따로 묶는다(날짜를 줄여도 일정을 잃지 않게).
export function groupSchedule<T extends SortableItem>(
  items: T[],
  startDate: string,
  endDate: string,
): ScheduleGroups<T> {
  const sortedItems = [...items].sort(compareScheduleItems);
  const days = tripDays(startDate, endDate).map((day) => ({
    day,
    items: sortedItems.filter((item) => item.date === day.date),
  }));
  const startYear = startDate.slice(0, 4);
  const outside: ScheduleGroups<T>["outside"] = [];
  for (const item of sortedItems) {
    if (item.date >= startDate && item.date <= endDate) continue;
    const last = outside.at(-1);
    if (last?.date === item.date) {
      last.items.push(item);
    } else {
      outside.push({
        date: item.date,
        label: dateLabel(item.date, item.date.slice(0, 4) !== startYear),
        items: [item],
      });
    }
  }
  return { days, outside };
}

// DB 의 time 은 "09:30:00" 으로 온다. 화면과 입력칸은 "09:30".
export function displayTime(time: string | null): string {
  return time === null ? "" : time.slice(0, 5);
}

// API 키 없이 쓰는 Google 지도 검색 주소. 휴대폰에서는 대개 지도 앱이 열린다.
export function mapsSearchUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
