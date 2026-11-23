"use client";

import { useRef, useState } from "react";
import { buttonClass } from "@/app/ui/styles";
import { formatMoney } from "@/lib/budget";
import type { TripDay } from "@/lib/schedule";
import { ExtraItemForm, tripDateChoices } from "./budget-forms";
import { BalanceText, BudgetBar } from "./budget-meter";
import type { PanelBudget } from "./map-types";
import { useSelectedDay } from "./selected-day";

// 화면 아래에 떠 있는 예산 줄과 [+ 지출] 시트(#53 설계 §5.4.2, #88 설계). 휴대폰·데스크톱 모두.
// 맨 아래 예산 칸이 화면에 보이면 숨고(hidden), 요약을 누르면 예산 칸으로 간다(onJump).
// 숨을 때는 transform·opacity 만 바꿔 자리를 그대로 둔다(레이아웃이 들썩이지 않고, 숨김이 예산 칸 보임 판정을 바꾸지 않는다).
// article 마지막에 두는 sticky 라 끝까지 내리면 제자리로 돌아와 아래 내용을 가리지 않는다.
// 시트는 <dialog> showModal: 초점 가둠·Esc 닫기·닫은 뒤 [+ 지출] 로 초점 돌려주기를 브라우저가 한다.
export function BudgetDock({
  tripId,
  budget,
  days,
  today,
  hidden,
  onJump,
  ref,
}: {
  tripId: string;
  budget: NonNullable<PanelBudget>;
  days: TripDay[];
  // 여행 중이면 오늘, 아니면 null.
  today: string | null;
  // 예산 칸이 화면에 보이는 동안(또는 아직 모를 때) true.
  hidden: boolean;
  onJump: () => void;
  // 줄(시트 제외). 숨기기 전에 안에 초점이 있는지 볼 때 쓴다.
  ref?: React.Ref<HTMLDivElement>;
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

  // 시트(dialog)는 줄 밖에 둔다. 줄이 숨으면(inert·투명) 안의 시트도 함께 막혀, 열린 시트를 쓸 수 없는데
  // 페이지는 모달로 막힌 채 남는다(휴대폰에는 Esc 가 없다).
  return (
    <>
      <div
        ref={ref}
        inert={hidden}
        className={`sticky bottom-0 z-20 -mx-4 border-t border-rule bg-background px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[translate,opacity] duration-200 motion-reduce:transition-none sm:-mx-6 sm:px-6 ${
          hidden ? "pointer-events-none translate-y-full opacity-0" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onJump}
            className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md text-left"
          >
            <span className="sr-only">예산 칸으로 가기, </span>
            {day ? (
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
                <span className="font-semibold">
                  {day.dayNumber}일차 예상{" "}
                  {money(budget.periods.byDate[day.date]?.estimate ?? 0)}
                </span>
                <span className="text-xs text-sub">
                  전체 {money(s.projected)} / {money(s.total)}
                </span>
              </span>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
                <span className="font-semibold">
                  예상 {money(s.projected)} / {money(s.total)}
                </span>
                <span className="text-xs">
                  <BalanceText balance={s.balance} settings={settings} />
                </span>
              </span>
            )}
            <BudgetBar projected={s.projected} total={s.total} thin />
          </button>
          <button
            type="button"
            onClick={openSheet}
            className={buttonClass("primary", "small")}
          >
            + 지출
          </button>
        </div>
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
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none sm:mx-auto sm:max-w-2xl overflow-y-auto rounded-t-[14px] bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-foreground backdrop:bg-foreground/30"
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
    </>
  );
}
