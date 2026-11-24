import "server-only";
import {
  actualOf,
  estimateOf,
  getTripBudget,
  listBudgetItems,
  type TripBudgetConfig,
} from "@/db/queries/budget";
import { listScheduleItems } from "@/db/queries/schedule-items";
import type { TripRow as Trip } from "@/db/queries/trips";
import { type BudgetLine, summarizeBudget, totalsByPeriod } from "@/lib/budget";
import {
  personalTotalFor,
  type Side,
  splitByOwner,
  visibleSides,
} from "@/lib/budget-wallets";
import type { PanelBudget, PanelWallet } from "./map-types";

// 여행 화면의 예산 데이터(#14, #89). 예산 시트·아래 줄과 일정 칸(양식·체크칸)이 같은 cache 결과를 쓴다.
// 호출하는 쪽이 이미 getTrip 으로 이 사용자의 여행임을 확인했다. 쿼리들도 같은 접근 조건을 다시 건다.

export type LoadedBudget = {
  config: TripBudgetConfig;
  // 모임 지갑·내 지갑의 금액 행. 남의 개인 행은 여기까지 오지 않는다.
  shared: BudgetLine[];
  mine: BudgetLine[];
  // 일정 id → 그 일정의 모임·내 금액 행.
  bySchedule: Map<
    string,
    { shared: BudgetLine | null; mine: BudgetLine | null }
  >;
};

// 예산 설정이 없으면 null.
export async function loadBudget(
  userId: string,
  trip: Trip,
): Promise<LoadedBudget | null> {
  const [config, allRows, items] = await Promise.all([
    getTripBudget(userId, trip.id),
    listBudgetItems(userId, trip.id),
    listScheduleItems(userId, trip.id),
  ]);
  if (!config) return null;
  // 남의 행은 줄을 만들기 전에 버린다. 쿼리가 이미 거르므로 여기 오면 이상 상황이다(id·금액은 남기지 않는다).
  const split = splitByOwner(allRows, userId);
  if (split.dropped > 0) {
    console.error("[budget-visibility]", {
      tripId: trip.id,
      dropped: split.dropped,
    });
  }
  const dateOf = new Map(items.map((item) => [item.id, item.date]));
  const bySchedule: LoadedBudget["bySchedule"] = new Map();
  function toLines(rows: typeof allRows, side: Side): BudgetLine[] {
    const lines: BudgetLine[] = [];
    for (const row of rows) {
      // 일정에 붙은 행은 그 일정의 날짜를 따른다. 읽는 사이 일정이 지워졌으면(cascade 전 읽기) 건너뛴다.
      const date =
        row.scheduleItemId === null ? row.date : dateOf.get(row.scheduleItemId);
      if (date === undefined) continue;
      const line: BudgetLine = {
        id: row.id,
        scheduleItemId: row.scheduleItemId,
        title: row.title,
        date,
        estimate: estimateOf(row),
        actual: actualOf(row),
      };
      lines.push(line);
      if (row.scheduleItemId !== null) {
        const entry = bySchedule.get(row.scheduleItemId) ?? {
          shared: null,
          mine: null,
        };
        entry[side] = line;
        bySchedule.set(row.scheduleItemId, entry);
      }
    }
    return lines;
  }
  const shared = toLines(split.shared, "shared");
  const mine = toLines(split.mine, "mine");
  return { config, shared, mine, bySchedule };
}

export function toPanelBudget(
  loaded: LoadedBudget | null,
  trip: Trip,
): PanelBudget {
  if (!loaded) return null;
  const { config, shared, mine } = loaded;
  const personal = personalTotalFor(config.myBudget, config.currency);
  const sides = visibleSides(config.mode, {
    shared: shared.length > 0,
    mine: mine.length > 0,
  });
  const wallets: PanelWallet[] = sides.map((side) => {
    const lines = side === "shared" ? shared : mine;
    const total = side === "shared" ? config.sharedTotal : personal.total;
    const settings = { ...config, totalAmount: total ?? 0 };
    return {
      side,
      total,
      stale: side === "mine" ? personal.stale : null,
      summary: summarizeBudget(lines, settings),
      periods: totalsByPeriod(lines, settings, trip.startDate, trip.endDate),
      extras: lines
        .filter((line) => line.scheduleItemId === null)
        .map((line) => ({
          id: line.id,
          title: line.title ?? "",
          date: line.date,
          estimate: line.estimate,
          actual: line.actual,
        })),
    };
  });
  return {
    config: {
      currency: config.currency,
      localCurrency: config.localCurrency,
      plannedRate: config.plannedRate,
      mode: config.mode,
      isOwner: config.isOwner,
      sharedTotal: config.sharedTotal,
      myTotal: personal.total,
    },
    wallets,
  };
}
