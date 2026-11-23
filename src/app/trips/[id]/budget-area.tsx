"use client";

import { useRef, useState } from "react";
import type { TripDay } from "@/lib/schedule";
import { BudgetDock, BudgetSetupDock } from "./budget-dock";
import { BudgetSheet, type SheetRequest } from "./budget-sheet";
import type { PanelBudget } from "./map-types";

// 아래 예산 줄과 예산 시트(#97 설계). 예산은 시트에서만 본다(맨 아래 예산 칸 없음).
// wrapper 없이 fragment 로 그린다: 줄(sticky bottom)이 article 의 직계 자식이어야 article 끝까지 따라온다.
export function BudgetArea({
  tripId,
  budget,
  days,
  today,
}: {
  tripId: string;
  budget: PanelBudget;
  days: TripDay[];
  // 여행 중이면 오늘, 아니면 null.
  today: string | null;
}) {
  const [request, setRequest] = useState<SheetRequest | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  // 닫아도 줄지 않는 번호(시트가 열 때마다 안의 카드를 새로 만든다).
  const openCount = useRef(0);
  const open = (mode: SheetRequest["mode"]) => {
    openCount.current += 1;
    setRequest({ mode, id: openCount.current });
  };

  return (
    <>
      {budget ? (
        <BudgetDock
          tripId={tripId}
          budget={budget}
          days={days}
          today={today}
          onOpen={() => open("view")}
          openerRef={openerRef}
        />
      ) : (
        <BudgetSetupDock onOpen={() => open("settings")} />
      )}
      <BudgetSheet
        tripId={tripId}
        budget={budget}
        days={days}
        request={request}
        onClose={() => {
          setRequest(null);
          // "예산 정하기" 로 열어 예산을 정했으면 연 버튼이 사라져 브라우저가 초점을 돌려줄 곳이 없다.
          if (document.activeElement === document.body)
            openerRef.current?.focus();
        }}
      />
    </>
  );
}
