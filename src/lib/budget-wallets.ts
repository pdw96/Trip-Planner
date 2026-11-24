// 모임 통장·내 돈 규칙(#89). node --test 로 시험하므로 다른 모듈을 import 하지 않는다.

export type BudgetMode = "shared" | "personal" | "both";
export type Side = "shared" | "mine";

export function isBudgetMode(v: unknown): v is BudgetMode {
  return v === "shared" || v === "personal" || v === "both";
}

// 새 항목·일정 양식에서 처음 고르는 쪽. 각자 방식만 내 돈이 먼저.
export function defaultSide(mode: BudgetMode): Side {
  return mode === "personal" ? "mine" : "shared";
}

// 방식의 쪽 ∪ 행이 있는 쪽. 순서는 늘 shared 먼저.
// 카드(여행 전체 행 유무)와 일정 양식 전환(그 일정 행 유무)에 같이 쓴다.
export function visibleSides(
  mode: BudgetMode,
  has: { shared: boolean; mine: boolean },
): Side[] {
  const sides: Side[] = [];
  if (mode !== "personal" || has.shared) sides.push("shared");
  if (mode !== "shared" || has.mine) sides.push("mine");
  return sides;
}

// 모임 행(ownerUserId null)과 내 행을 나누고, 남의 행은 버리며 센다.
export function splitByOwner<T extends { ownerUserId: string | null }>(
  rows: T[],
  userId: string,
): { shared: T[]; mine: T[]; dropped: number } {
  const shared: T[] = [];
  const mine: T[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (row.ownerUserId === null) shared.push(row);
    else if (row.ownerUserId === userId) mine.push(row);
    else dropped += 1;
  }
  return { shared, mine, dropped };
}

// 내 예산은 정한 때의 통화로 저장된다. 예산 통화가 바뀌었으면 합계를 쓰지 않고 stale 로 알린다.
export function personalTotalFor(
  row: { totalAmount: number; currency: string } | null,
  currency: string,
): {
  total: number | null;
  stale: { amount: number; currency: string } | null;
} {
  if (row === null) return { total: null, stale: null };
  if (row.currency === currency) return { total: row.totalAmount, stale: null };
  return {
    total: null,
    stale: { amount: row.totalAmount, currency: row.currency },
  };
}
