import "server-only";
import {
  actualOf,
  estimateOf,
  getTripBudget,
  listBudgetItems,
} from "@/db/queries/budget";
import { listScheduleItems } from "@/db/queries/schedule-items";
import type { Trip } from "@/db/schema";
import {
  type BudgetLine,
  type BudgetSettings,
  summarizeBudget,
  totalsByPeriod,
} from "@/lib/budget";
import type { PanelBudget } from "./map-types";

// 여행 화면의 예산 데이터(#14). 지도 칸(예산 카드)과 일정 칸(양식·체크칸)이 같은 cache 결과를 쓴다.
// 호출하는 쪽이 이미 getTrip 으로 이 사용자의 여행임을 확인했다. 쿼리들도 같은 접근 조건을 다시 건다.

export type LoadedBudget = {
  settings: BudgetSettings;
  lines: BudgetLine[];
  // 일정 id → 그 일정의 금액 행.
  bySchedule: Map<string, BudgetLine>;
};

// 예산 설정이 없으면 null.
export async function loadBudget(
  userId: string,
  trip: Trip,
): Promise<LoadedBudget | null> {
  const [settings, rows, items] = await Promise.all([
    getTripBudget(userId, trip.id),
    listBudgetItems(userId, trip.id),
    listScheduleItems(userId, trip.id),
  ]);
  if (!settings) return null;
  const dateOf = new Map(items.map((item) => [item.id, item.date]));
  const lines: BudgetLine[] = [];
  const bySchedule = new Map<string, BudgetLine>();
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
    if (row.scheduleItemId !== null) bySchedule.set(row.scheduleItemId, line);
  }
  return { settings, lines, bySchedule };
}

export function toPanelBudget(
  loaded: LoadedBudget | null,
  trip: Trip,
): PanelBudget {
  if (!loaded) return null;
  const { settings, lines } = loaded;
  return {
    settings,
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
}
