"use client";

import { useRef, useState } from "react";
import { buttonClass } from "@/app/ui/styles";
import { formatMoney } from "@/lib/budget";
import type { TripDay } from "@/lib/schedule";
import { ExtraItemForm, tripDateChoices } from "./budget-forms";
import { BalanceText, BudgetBar } from "./budget-meter";
import type { PanelBudget } from "./map-types";
import { useSelectedDay } from "./selected-day";

// 휴대폰 너비에서 화면 아래에 늘 떠 있는 예산 줄과 [+ 지출] 시트(#53 설계 §5.4.2). 데스크톱(sm 이상)에는 없다.
// article 마지막에 두는 sticky 라 끝까지 내리면 제자리로 돌아와 아래 내용을 가리지 않는다.
// 시트는 <dialog> showModal: 초점 가둠·Esc 닫기·닫은 뒤 [+ 지출] 로 초점 돌려주기를 브라우저가 한다.
export function BudgetDock({
  tripId,
  budget,
  days,
  today,
}: {
  tripId: string;
  budget: NonNullable<PanelBudget>;
  days: TripDay[];
  // 여행 중이면 오늘, 아니면 null.
  today: string | null;
}) {
  const { selected } = useSelectedDay();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 열 때마다 양식을 새로 만든다(지난 입력·오류가 남지 않게).
  const [openCount, setOpenCount] = useState(0);
  const [open, setOpen] = useState(false);

  const { settings, summary: s } = budget;
  const money = (minor: number) => formatMoney(minor, settings.currency);
  const day = selected === "all" ? null : days.find((d) => d.date === selected);
  const defaultDate = day ? day.date : (today ?? "");

  function openSheet() {
    setOpenCount((n) => n + 1);
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function closeSheet() {
    dialogRef.current?.close();
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-rule bg-background px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {day ? (
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
              <span className="font-semibold">
                {day.dayNumber}일차 예상{" "}
                {money(budget.periods.byDate[day.date]?.estimate ?? 0)}
              </span>
              <span className="text-xs text-sub">
                전체 {money(s.projected)} / {money(s.total)}
              </span>
            </p>
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
              <span className="font-semibold">
                예상 {money(s.projected)} / {money(s.total)}
              </span>
              <span className="text-xs">
                <BalanceText balance={s.balance} settings={settings} />
              </span>
            </p>
          )}
          <BudgetBar projected={s.projected} total={s.total} thin />
        </div>
        <button
          type="button"
          onClick={openSheet}
          className={buttonClass("primary", "small")}
        >
          + 지출
        </button>
      </div>
      {/* 바깥(바탕 가림막)을 누르면 닫는다: 그때 event.target 이 dialog 자신이다. 키보드는 Esc 로 닫는다. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc 는 dialog 가 처리한다 */}
      <dialog
        ref={dialogRef}
        aria-label="일정 밖 지출 넣기"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeSheet();
        }}
        onClose={() => setOpen(false)}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[14px] bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-foreground backdrop:bg-foreground/30"
      >
        {open && (
          <ExtraItemForm
            key={openCount}
            tripId={tripId}
            currencies={{
              currency: settings.currency,
              localCurrency: settings.localCurrency,
            }}
            item={null}
            defaultDate={defaultDate}
            dates={tripDateChoices(days)}
            onClose={closeSheet}
          />
        )}
      </dialog>
    </div>
  );
}
