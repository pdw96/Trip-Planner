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
  const budget = toPanelBudget(await loadBudget(userId, trip), trip);
  // 예산이 없으면 처음 값(#100). 기준환율은 기다리지 않고 Promise 로 넘겨, 설정 양식을 열 때만 기다린다
  // (Frankfurter 가 느리거나 멈춰도 예산 줄이 늦게 뜨지 않게).
  const local = trip.countryCode ? countryCurrency(trip.countryCode) : null;
  const startValues = budget
    ? null
    : (local && local !== "KRW" && currencyInfo(local)?.ecb
        ? getEcbRate(today, local, "KRW")
        : Promise.resolve(null)
      ).then((rate) => budgetStartValues(local, rate?.rate ?? null));
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
