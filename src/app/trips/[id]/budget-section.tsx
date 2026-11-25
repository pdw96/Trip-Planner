import type { TripRow as Trip } from "@/db/queries/trips";
import { budgetStartValues, currencyInfo } from "@/lib/budget";
import { countryCurrency } from "@/lib/countries";
import { getEcbRate } from "@/lib/fx-api";
import { tripDays } from "@/lib/schedule";
import { BudgetArea } from "./budget-area";
import { loadBudget, toPanelBudget } from "./budget-data";

// 아래 예산 줄과 예산 시트의 데이터(#88·#97). 일정 칸과 같은 계산(쿼리가 cache 라 같은 결과).
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
  // 여행 나라의 통화(#100). 기준환율은 예산과 함께 받기 시작해 예산이 없을 때만 기다린다(늦추지 않게).
  const local = trip.countryCode ? countryCurrency(trip.countryCode) : null;
  const ratePromise =
    local && local !== "KRW" && currencyInfo(local)?.ecb
      ? getEcbRate(today, local, "KRW")
      : null;
  const budget = toPanelBudget(await loadBudget(userId, trip), trip);
  const startValues = budget
    ? null
    : budgetStartValues(local, (await ratePromise)?.rate ?? null);
  const todayInTrip = today >= trip.startDate && today <= trip.endDate;
  return (
    <BudgetArea
      tripId={trip.id}
      budget={budget}
      isOwner={trip.userId === userId}
      startValues={startValues}
      days={tripDays(trip.startDate, trip.endDate)}
      today={todayInTrip ? today : null}
    />
  );
}
