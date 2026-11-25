// 떼어 낸 기록(#103)의 목록 나누기·이름표·동행 줄. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.

function toMillis(value: Date | string): number {
  return new Date(value).getTime();
}

// 떼어 내지 않은 여행(active)과 떼어 낸 기록(records, 최근 떼어 낸 것 먼저)으로 나눈다.
export function splitRecords<T extends { detachedAt: Date | string | null }>(
  trips: T[],
): { active: T[]; records: T[] } {
  const active: T[] = [];
  const records: T[] = [];
  for (const trip of trips) {
    if (trip.detachedAt === null) active.push(trip);
    else records.push(trip);
  }
  records.sort(
    (a, b) =>
      toMillis(b.detachedAt as Date | string) -
      toMillis(a.detachedAt as Date | string),
  );
  return { active, records };
}

// 떼어 낸 때의 서울 기준 월·일.
function seoulMonthDay(value: Date | string): { month: string; day: string } {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(value));
  return {
    month: parts.find((part) => part.type === "month")?.value ?? "",
    day: parts.find((part) => part.type === "day")?.value ?? "",
  };
}

// 기록 카드 위의 이름표. 날짜는 서울 기준 M/D 이고, 주인 이름이 없으면 "함께한 여행에서" 로 쓴다.
export function recordBadge(
  ownerName: string | null,
  detachedAt: Date | string,
): string {
  const { month, day } = seoulMonthDay(detachedAt);
  const head =
    ownerName === null ? "함께한 여행에서" : `${ownerName}님 여행에서`;
  return `${head} · ${month}/${day} 떼어 냄`;
}

// 기록 화면 머리의 안내 띠에서 "떼어 낸 기록 · " 뒤의 글. 날짜는 서울 기준 "M월 D일".
export function recordNotice(
  ownerName: string | null,
  detachedAt: Date | string,
): string {
  const { month, day } = seoulMonthDay(detachedAt);
  const from =
    ownerName === null ? "함께한 여행에서" : `${ownerName}님의 여행에서`;
  return `${from} ${month}월 ${day}일에 떼어 냈어요. 함께 쓰던 일정, 장소, 모임 지출은 그날 모습 그대로 보기만 할 수 있어요.`;
}

// 함께한 사람 이름 줄. 아무도 없으면 null. "님" 은 받침이 없어 "과 함께" 로 이어진다.
export function companionsLine(names: string[]): string | null {
  if (names.length === 0) return null;
  return `${names.map((name) => `${name}님`).join(", ")}과 함께`;
}
