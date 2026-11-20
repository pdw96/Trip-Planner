// 하루 일정 순서 규칙(#41, 설계 §5.2). node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 시각 있는 일정끼리는 늘 시각 순(같은 시각끼리는 어느 순서든)이고, 시각 없는 일정은 어디든 둔다.
// 서버의 순서 저장 검증·넣기·고치기 뒤 자리와 브라우저의 끌기 판정이 같은 함수를 쓴다.

// time 은 "HH:MM" 또는 DB 의 "HH:MM:SS". 비교는 앞 5글자로 한다.
export type OrderItem = { id: string; time: string | null };

function minutes(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5);
}

// 시각 있는 일정만 골라 보면 시각이 줄지 않는다.
export function keepsTimeOrder(items: OrderItem[]): boolean {
  let last: string | null = null;
  for (const item of items) {
    const time = minutes(item.time);
    if (time === null) continue;
    if (last !== null && time < last) return false;
    last = time;
  }
  return true;
}

// 새로 들어오는 일정의 자리. 시각 없음 → 맨 뒤. 시각 있음 → 시각이 더 늦은 첫 일정 바로 앞, 없으면 맨 뒤
// (사이에 시각 없는 일정 무리가 있으면 그 무리 뒤, 곧 다음 확정 일정 바로 앞).
export function insertByTime(order: OrderItem[], item: OrderItem): OrderItem[] {
  const time = minutes(item.time);
  const at =
    time === null
      ? -1
      : order.findIndex((other) => {
          const otherTime = minutes(other.time);
          return otherTime !== null && otherTime > time;
        });
  if (at === -1) return [...order, item];
  return [...order.slice(0, at), item, ...order.slice(at)];
}

// 넣기·고치기 뒤 그날 순서(id 목록). before 는 쓰기 전 그날 순서다.
// item 이 before 에 없으면(새 일정, 다른 날에서 옮겨 옴) insertByTime. 있으면(같은 날 고치기):
// 시각이 그대로면 null(쓸 필요 없음), 시각을 지웠거나 새 시각이 그 자리에서도 시각 순이면 그 자리,
// 아니면 빼고 insertByTime.
export function orderWithItem(
  before: OrderItem[],
  item: OrderItem,
): string[] | null {
  const index = before.findIndex((other) => other.id === item.id);
  if (index === -1) return insertByTime(before, item).map((x) => x.id);
  if (minutes(before[index].time) === minutes(item.time)) return null;
  const replaced = before.with(index, item);
  if (item.time === null || keepsTimeOrder(replaced)) {
    return replaced.map((x) => x.id);
  }
  const rest = before.filter((other) => other.id !== item.id);
  return insertByTime(rest, item).map((x) => x.id);
}

// 보낸 순서가 그날 지금 일정들을 빠짐·더함·중복 없이 다시 늘어놓은 것인가.
export function isReorderOf(ids: string[], current: string[]): boolean {
  const set = new Set(ids);
  if (set.size !== ids.length || ids.length !== current.length) return false;
  return current.every((id) => set.has(id));
}
