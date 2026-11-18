// 현지 날짜·시각 → Google Routes API 에 보낼 UTC 순간. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
//
// Step 0 (Routes API 허용 범위, 2026-11-18, 서울 경복궁→남산 TRANSIT, routes.duration):
//   서버 키는 클라우드 프록시가 주입. 아래는 모두 HTTP 200.
//   departureTime -1일(2026-11-17)  200  경로 있음 (과거 시각도 오류 없이 받음)
//   departureTime +30일             200  경로 있음
//   departureTime +60일             200  경로 있음
//   departureTime +100일(2027-02-26) 200 경로 있음
//   departureTime +103일(2027-03-01) 200 빈 응답 {} (오류 아님, 경로 없음)
//   departureTime +106·109·112·125·150·175·200일  200  빈 응답 {}
//   arrivalTime   +100일            200  경로 있음
//   arrivalTime   +106일            200  빈 응답 {}
//   → 경계는 +100일(됨)과 +103일(안 됨) 사이(+101·+102 는 호출 수를 아끼려 확인 안 함).
//     400 오류는 없고, 범위를 넘으면 빈 응답이다(대중교통 시간표 데이터가 약 100일치).
//   그래서 경계보다 넉넉히 줄여 90일로 잡는다(시간표 데이터 범위가 날마다 달라질 수 있다).
export const ROUTES_MAX_AHEAD_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

// 그 순간(ms)의 timeZone 오프셋(ms). 현지 벽시계를 UTC 로 읽은 값 - 실제 순간.
function offsetAt(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// "2026-12-04", "09:30", "Europe/Paris" → 그 현지 시각의 UTC 순간.
// 오프셋은 후보 순간마다 달라질 수 있어(서머타임 경계) 두 번 보정한다.
// 존재하지 않는 현지 시각(서머타임 시작 갭)은 갭 앞 오프셋으로 해석된 순간이 나온다.
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let t = wall - offsetAt(wall, timeZone);
  t = wall - offsetAt(t, timeZone);
  t = wall - offsetAt(t, timeZone);
  return new Date(t);
}

// 날짜 문자열에 달력 기준으로 일수를 더한다.
function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

// Routes 에 보낼 순간. 지났으면 같은 요일·같은 현지 시각으로 7일씩 앞으로,
// now + maxAheadDays 를 넘으면 7일씩 뒤로 당긴다(그래도 now 이전이면 now 이후 첫 같은 요일).
export function requestInstant(
  date: string,
  time: string,
  timeZone: string,
  now: Date,
  maxAheadDays: number,
): Date {
  const limit = now.getTime() + maxAheadDays * DAY_MS;
  let day = date;
  let at = zonedToUtc(day, time, timeZone);
  while (at.getTime() < now.getTime()) {
    day = addDays(day, 7);
    at = zonedToUtc(day, time, timeZone);
  }
  while (at.getTime() > limit) {
    day = addDays(day, -7);
    at = zonedToUtc(day, time, timeZone);
  }
  while (at.getTime() < now.getTime()) {
    day = addDays(day, 7);
    at = zonedToUtc(day, time, timeZone);
  }
  return at;
}
