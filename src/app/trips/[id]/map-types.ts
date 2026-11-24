// 지도 칸(map-section → trip-map-panel)이 주고받는 데이터 모양과 작은 표시 도우미.
// 서버와 클라이언트가 함께 쓴다. Google 값은 장소 id 와 좌표만 담는다(§3.2).

import type {
  ActualMoney,
  BudgetSummary,
  CurrencySettings,
  Money,
  PeriodTotal,
} from "@/lib/budget";
import type { BudgetMode, Side } from "@/lib/budget-wallets";
import {
  CATEGORY_LABELS,
  PLACE_CATEGORIES,
  type PlaceCategory,
} from "@/lib/place-input";

export type PanelPlace = {
  id: string;
  label: string;
  category: PlaceCategory;
  memo: string | null;
  googlePlaceId: string;
  // 좌표 갱신에 실패했으면 null(지도·동선·거리에서 빠진다).
  lat: number | null;
  lng: number | null;
  // 이 장소가 이어진 일정의 N일차 번호들(오름차순, 중복 없음).
  scheduleDays: number[];
};

// 서버가 미리 만든 하루 동선의 뼈대. 구간 이동 정보(Google)는 담지 않는다.
export type SkeletonLeg = {
  fromId: string;
  toId: string;
  fromIsBase: boolean;
  toIsBase: boolean;
  straightMeters: number;
  distanceText: string;
  // 구간 시각(일정 시각에서, 사용자 값): "arrival 09:30" / "departure 10:00". 바뀌면 구간 정보를 다시 묻는다.
  timing: string;
};

export type PanelDay = {
  date: string;
  dayNumber: number;
  // "2일차 · 12월 4일 (금)"
  label: string;
  // 그날 밤이 있는지(마지막 날·당일치기는 false, 밤 숙소 고르기 없음, #91).
  hasNight: boolean;
  // 이 날 저장된 그날 밤 숙소(좌표가 없어도 그대로). 밤 숙소 고르기의 현재 값. hasNight 가 false 면 null.
  nightBaseId: string | null;
  // 전날 밤 숙소("아침엔 … 에서 출발"). 첫날·전날 밤 숙소 없음이면 null.
  morningBaseId: string | null;
  // 동선에 들어간 시작·끝 숙소(좌표가 있을 때만, 중복 없이 [시작, 끝] 순서).
  routeBaseIds: string[];
  // 구간 결과 저장소 키(daySignature). 바뀌면 다시 묻는다(#37).
  signature: string;
  stops: { placeId: string; number: number }[];
  // 그날 장소가 이어진 일정 중 좌표가 없어 동선에서 빠진 것의 수.
  unlocatedCount: number;
  legs: SkeletonLeg[];
};

// 일정 양식의 장소 고르기에 쓰는 장소.
export type PlaceOption = {
  id: string;
  label: string;
  category: PlaceCategory;
  googlePlaceId: string;
};

export const CATEGORY_ICONS: Record<PlaceCategory, string> = {
  lodging: "🏨",
  sight: "📍",
  food: "🍜",
  cafe: "☕",
  etc: "•",
};

export function toCategory(value: string): PlaceCategory {
  return (PLACE_CATEGORIES as readonly string[]).includes(value)
    ? (value as PlaceCategory)
    : "etc";
}

export function categoryLabel(category: PlaceCategory): string {
  return CATEGORY_LABELS[category];
}

// 숙소 종류를 위로, 나머지는 원래 순서(넣은 순서) 그대로.
export function lodgingFirst<T extends { category: PlaceCategory }>(
  items: T[],
): T[] {
  return [
    ...items.filter((p) => p.category === "lodging"),
    ...items.filter((p) => p.category !== "lodging"),
  ];
}

// ①…⑳, 그 뒤는 (21) 처럼.
export function circled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  return `(${n})`;
}

// [2] → "2일차 일정", [1, 3] → "1·3일차 일정".
export function scheduleDaysText(days: number[]): string | null {
  return days.length === 0 ? null : `${days.join("·")}일차 일정`;
}

// --- 예산 카드(#14) ---
// 돈 계산은 서버(budget-data.ts)가 하고 카드는 받은 숫자를 그린다. 일정 밖 항목은 카드에서 고친다.

export type PanelExtra = {
  id: string;
  title: string;
  date: string | null;
  estimate: Money | null;
  actual: ActualMoney | null;
};

// 지갑 하나(모임 또는 내 돈)의 합계·기간별·일정 밖 항목. stale: 예산 통화가 바뀌어 합계를 못 쓰는 내 예산.
export type PanelWallet = {
  side: Side;
  total: number | null;
  stale: { amount: number; currency: string } | null;
  summary: BudgetSummary;
  periods: {
    tripWide: PeriodTotal;
    byDate: Record<string, PeriodTotal>;
    outside: PeriodTotal | null;
  };
  extras: PanelExtra[];
};

export type PanelBudget = {
  config: CurrencySettings & {
    mode: BudgetMode;
    isOwner: boolean;
    sharedTotal: number | null;
    myTotal: number | null;
  };
  wallets: PanelWallet[];
} | null;
