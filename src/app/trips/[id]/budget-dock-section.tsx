import type { TripRow as Trip } from "@/db/queries/trips";
import { tripDays } from "@/lib/schedule";
import { loadBudget, toPanelBudget } from "./budget-data";
import { BudgetDock } from "./budget-dock";

// 휴대폰 아래 예산 줄의 데이터(#53 설계 §5.4.2). 지도 칸 예산 카드와 같은 계산(쿼리가 cache 라 같은 결과).
// 예산이 없으면 줄이 없다. 호출하는 쪽이 이미 getTrip 으로 이 사용자의 여행임을 확인했다.
export async function BudgetDockSection({
  userId,
  trip,
  today,
}: {
  userId: string;
  trip: Trip;
  today: string;
}) {
  const budget = toPanelBudget(await loadBudget(userId, trip), trip);
  if (!budget) return null;
  const todayInTrip = today >= trip.startDate && today <= trip.endDate;
  return (
    <BudgetDock
      tripId={trip.id}
      budget={budget}
      days={tripDays(trip.startDate, trip.endDate)}
      today={todayInTrip ? today : null}
    />
  );
}
