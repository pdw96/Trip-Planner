import type { TripRow as Trip } from "@/db/queries/trips";
import { tripDays } from "@/lib/schedule";
import { BudgetArea } from "./budget-area";
import { loadBudget, toPanelBudget } from "./budget-data";

// 여행 화면 맨 아래 예산 칸과 아래 예산 줄의 데이터(#88). 일정 칸과 같은 계산(쿼리가 cache 라 같은 결과).
// 호출하는 쪽이 이미 getTrip 으로 이 사용자의 여행임을 확인했다.
export async function BudgetSection({
  userId,
  trip,
  today,
}: {
  userId: string;
  trip: Trip;
  today: string;
}) {
  const budget = toPanelBudget(await loadBudget(userId, trip), trip);
  const todayInTrip = today >= trip.startDate && today <= trip.endDate;
  return (
    <BudgetArea
      tripId={trip.id}
      budget={budget}
      days={tripDays(trip.startDate, trip.endDate)}
      today={todayInTrip ? today : null}
    />
  );
}
