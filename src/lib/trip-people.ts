// 함께한 사람(#122): 여행별 이름 모으기, 서로 다른 사람 세기, 이름 줄 문구. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// userId 는 같은 사람을 가르는 데만 쓰고 돌려주지 않는다(계정 번호가 화면으로 나가지 않게, #103).

export type CompanionRow = { tripId: string; userId: string; name: string };

// 여행마다 나를 뺀 함께한 사람 이름. 들어온 순서 그대로, 같은 여행에 같은 사람은 한 번.
export function namesByTrip(rows: CompanionRow[]): Map<string, string[]> {
  const seen = new Set<string>();
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.tripId}\u0000${row.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const names = map.get(row.tripId);
    if (names) names.push(row.name);
    else map.set(row.tripId, [row.name]);
  }
  return map;
}

// 고른 여행(추억)에서 서로 다른 사람과 그 사람이 함께한 여행 수. 횟수 많은 순, 같으면 이름 순.
export function countCompanions(
  rows: CompanionRow[],
  tripIds: Iterable<string>,
): { name: string; count: number }[] {
  const chosen = new Set(tripIds);
  const people = new Map<string, { name: string; trips: Set<string> }>();
  for (const row of rows) {
    if (!chosen.has(row.tripId)) continue;
    const person = people.get(row.userId);
    if (person) person.trips.add(row.tripId);
    else
      people.set(row.userId, { name: row.name, trips: new Set([row.tripId]) });
  }
  return [...people.values()]
    .map((p) => ({ name: p.name, count: p.trips.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}

const SHOWN = 3;

// 함께 탭의 이름 줄: "민수 · 지영 · 수진 외 2명".
export function peopleLine(names: string[]): string | null {
  if (names.length === 0) return null;
  const head = names.slice(0, SHOWN).join(" · ");
  const rest = names.length - SHOWN;
  return rest > 0 ? `${head} 외 ${rest}명` : head;
}

// "민수님, 지영님과" / "가님, 나님, 다님 외 1명과". 받침에 따라 과/와가 갈리지 않게 이름마다 "님"을 붙인다.
export function withNames(names: string[]): string | null {
  if (names.length === 0) return null;
  const head = names
    .slice(0, SHOWN)
    .map((name) => `${name}님`)
    .join(", ");
  const rest = names.length - SHOWN;
  return rest > 0 ? `${head} 외 ${rest}명과` : `${head}과`;
}
