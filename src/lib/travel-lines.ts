// 일정표의 이동 줄 자리와 출발지 문구(#37 설계 §4.2). node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 구간은 응답(LegView) 또는 서버 뼈대에서 만든다. 자리는 일정 id 로만 정한다(순서로 맞추지 않는다).

export type LineLeg = {
  key: string;
  fromItemId: string | null;
  toItemId: string | null;
  // 출발·도착 장소 이름표(모르면 null).
  fromLabel: string | null;
  toLabel: string | null;
};

export type PlacedLine<L extends LineLeg> = { leg: L; caption: string | null };

export type PlacedLines<L extends LineLeg> = {
  // 일정 id → 그 줄 바로 위 이동 줄.
  before: Map<string, PlacedLine<L>>;
  // 마지막 줄 아래(도착이 일정이 아닌 구간, 곧 그날 밤 숙소로 가는 구간, #91).
  after: PlacedLine<L> | null;
};

function from(label: string | null): string | null {
  return label ? `${label}에서` : null;
}

// 출발·도착 일정 중 하나라도 줄 목록에 없으면(사이에 지워짐, 다른 창에서 넣음) 그 구간은 버린다
// (엉뚱한 줄에서 오는 이동처럼 보이지 않게). 같은 자리에 둘째 구간이 오면 첫 구간만 둔다.
export function placeTravelLines<L extends LineLeg>(
  itemIds: string[],
  legs: L[],
): PlacedLines<L> {
  const index = new Map(itemIds.map((id, i) => [id, i]));
  const before = new Map<string, PlacedLine<L>>();
  let after: PlacedLine<L> | null = null;

  for (const leg of legs) {
    if (leg.fromItemId !== null && !index.has(leg.fromItemId)) continue;
    if (leg.toItemId !== null) {
      const to = index.get(leg.toItemId);
      if (to === undefined || before.has(leg.toItemId)) continue;
      const fromIndex =
        leg.fromItemId === null ? undefined : index.get(leg.fromItemId);
      const caption = fromIndex === to - 1 ? null : from(leg.fromLabel);
      before.set(leg.toItemId, { leg, caption });
    } else {
      if (after) continue;
      const fromIsLast =
        leg.fromItemId !== null &&
        index.get(leg.fromItemId) === itemIds.length - 1;
      const until = leg.toLabel ? `${leg.toLabel}까지` : null;
      const origin = fromIsLast ? null : from(leg.fromLabel);
      const caption =
        origin && until ? `${origin} ${until}` : (until ?? origin);
      after = { leg, caption };
    }
  }
  return { before, after };
}
