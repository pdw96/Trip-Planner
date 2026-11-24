import "server-only";
import {
  type ActualMoney,
  type CurrencySettings,
  currencyInfo,
  decideRate,
  parseAmount,
  parseRateInput,
} from "@/lib/budget";
import type { MoneyParsers } from "@/lib/budget-input";
import { getEcbRate } from "@/lib/fx-api";
import { todayInSeoul } from "@/lib/trip-dates";

// 예산 양식 검증에 넘기는 금액·환율 해석 함수 묶음(budget-input.ts 는 다른 모듈을 import 하지 않는다).
export const moneyParsers: MoneyParsers = {
  parseAmount,
  parseRateInput,
  currencyInfo,
};

// 실제 지출의 환율·결제일·출처를 정한다(설계 §5.4). 환율 API 가 실패해도 예정 환율로 저장한다(저장을 막지 않음).
// paidOn: 현지 통화면 부르는 쪽이 정한 결제일(빈칸이면 일정 날짜 등). rateField: 정규화된 환율 칸, undefined = 칸 없음.
export async function resolveActualRate(
  actual: {
    amount: number;
    currency: string;
    paidOn: string | null;
    rateField: string | undefined;
  },
  previous: ActualMoney | null,
  settings: CurrencySettings,
): Promise<ActualMoney> {
  const base = { amount: actual.amount, currency: actual.currency };
  if (actual.currency === settings.currency) {
    return { ...base, paidOn: null, rate: null, rateSource: null };
  }
  const today = todayInSeoul();
  const paidOn = actual.paidOn ?? today;
  const decision = decideRate({
    currency: actual.currency,
    paidOn,
    rateField: actual.rateField,
    previous,
    settings,
    today,
  });
  const planned = {
    ...base,
    paidOn,
    rate: settings.plannedRate,
    rateSource: "planned" as const,
  };
  switch (decision.kind) {
    case "none":
      return { ...base, paidOn: null, rate: null, rateSource: null };
    case "keep":
      return {
        ...base,
        paidOn,
        rate: decision.rate,
        rateSource: decision.source,
      };
    case "manual":
      return { ...base, paidOn, rate: decision.rate, rateSource: "manual" };
    case "planned":
      return planned;
    case "fetch": {
      const fetched = await getEcbRate(
        paidOn,
        actual.currency,
        settings.currency,
      );
      if (!fetched) return planned;
      return { ...base, paidOn, rate: fetched.rate, rateSource: "ecb" };
    }
  }
}
