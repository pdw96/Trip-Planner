"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/app/ui/styles";
import { formatMoney } from "@/lib/budget";
import { defaultSide, type Side } from "@/lib/budget-wallets";
import type { TripDay } from "@/lib/schedule";
import { ExtraItemForm, SIDE_LABELS, tripDateChoices } from "./budget-forms";
import { BalanceText, BudgetBar, LockIcon } from "./budget-meter";
import type { PanelBudget, PanelWallet } from "./map-types";
import { useSelectedDay } from "./selected-day";
import { isOnBackdrop, lockPageScroll } from "./sheet-dialog";

// 화면 아래에 늘 떠 있는 예산 줄과 [+ 지출] 시트(#53 설계 §5.4.2, #88·#97 설계). 휴대폰·데스크톱 모두.
// 요약을 누르면 예산 시트가 열린다(onOpen). 예산이 없으면 그 자리에 BudgetSetupDock 이 뜬다.
// article 마지막에 두는 sticky 라 끝까지 내리면 제자리로 돌아와 아래 내용을 가리지 않는다.
// 지갑(#89)마다 막대 하나: 하나면 지금 모양, 둘(모임·내 돈)이면 작은 줄 둘(모임 위, 내 것 아래).
// [+ 지출] 시트는 <dialog> showModal: 초점 가둠·Esc 닫기·닫은 뒤 [+ 지출] 로 초점 돌려주기를 브라우저가 한다.

const dockClass =
  "sticky bottom-0 z-20 -mx-4 border-t border-rule bg-background px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6";

export function BudgetDock({
  tripId,
  budget,
  days,
  today,
  onOpen,
  openerRef,
}: {
  tripId: string;
  budget: NonNullable<PanelBudget>;
  days: TripDay[];
  // 여행 중이면 오늘, 아니면 null.
  today: string | null;
  onOpen: () => void;
  // 요약 버튼. 예산 시트를 닫았는데 연 버튼이 사라졌을 때(예산을 처음 정함) 초점을 여기로 돌린다.
  openerRef?: React.Ref<HTMLButtonElement>;
}) {
  const { selected } = useSelectedDay();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 열 때마다 양식을 새로 만든다(지난 입력·오류가 남지 않게).
  const [openCount, setOpenCount] = useState(0);
  const [open, setOpen] = useState(false);
  // 바깥 누르기 닫기는 누른 곳과 뗀 곳이 모두 바탕일 때만(양식 안에서 끌다 바깥에서 놓으면 닫지 않음).
  const downOnBackdrop = useRef(false);
  const unlockScroll = useRef<(() => void) | null>(null);

  // 판이 열린 채로 사라지면(뒤로 가기 등) close 이벤트가 오지 않으므로 여기서 푼다.
  useEffect(() => () => unlockScroll.current?.(), []);

  const { config, wallets } = budget;
  const day =
    selected === "all" ? null : (days.find((d) => d.date === selected) ?? null);
  const defaultDate = day ? day.date : (today ?? "");
  // 새 지출의 누구 돈은 방식대로(설계 §5.1): 모임 통장 → 모임, 각자 → 내 돈, 둘 다 → 고르기(처음은 모임).
  const sides: Side[] =
    config.mode === "both" ? ["shared", "mine"] : [defaultSide(config.mode)];

  function openSheet() {
    setOpenCount((n) => n + 1);
    setOpen(true);
    dialogRef.current?.showModal();
    unlockScroll.current = lockPageScroll();
  }
  function closeSheet() {
    dialogRef.current?.close();
  }

  return (
    <>
      <div className={dockClass}>
        <div className="flex items-center gap-3">
          <button
            ref={openerRef}
            type="button"
            aria-haspopup="dialog"
            onClick={onOpen}
            className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md text-left"
          >
            <span className="sr-only">예산 열기, </span>
            {wallets.length === 1 ? (
              <WalletLine
                wallet={wallets[0]}
                currency={config.currency}
                day={day}
                settable={
                  wallets[0].side !== "mine" || config.mode !== "shared"
                }
              />
            ) : (
              wallets.map((wallet) => (
                <WalletLine
                  key={wallet.side}
                  wallet={wallet}
                  currency={config.currency}
                  day={day}
                  settable={wallet.side !== "mine" || config.mode !== "shared"}
                  compact
                />
              ))
            )}
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
      {/* 바깥(바탕 가림막)을 누르면 닫는다(isOnBackdrop). 키보드는 Esc 로 닫는다. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc 는 dialog 가 처리한다 */}
      <dialog
        ref={dialogRef}
        aria-label="일정 밖 지출 넣기"
        onPointerDown={(event) => {
          downOnBackdrop.current = isOnBackdrop(event);
        }}
        onClick={(event) => {
          if (downOnBackdrop.current && isOnBackdrop(event)) closeSheet();
        }}
        onClose={() => {
          setOpen(false);
          unlockScroll.current?.();
          unlockScroll.current = null;
        }}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none sm:mx-auto sm:max-w-2xl overflow-y-auto rounded-t-[14px] bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-foreground backdrop:bg-foreground/30"
      >
        {open && (
          <ExtraItemForm
            key={openCount}
            tripId={tripId}
            currencies={{
              currency: config.currency,
              localCurrency: config.localCurrency,
            }}
            item={null}
            defaultDate={defaultDate}
            dates={tripDateChoices(days)}
            sides={sides}
            onClose={closeSheet}
          />
        )}
      </dialog>
    </>
  );
}

// 지갑 하나의 줄: 글자 + 얇은 막대. compact 는 지갑이 둘일 때의 작은 줄(앞에 "모임"/"내 돈").
// 예산을 정하지 않았거나 통화가 바뀐 내 예산이면 요약이 0 에 대해 계산된 것이라 막대·여유 대신 안내.
function WalletLine({
  wallet,
  currency,
  day,
  settable,
  compact = false,
}: {
  wallet: PanelWallet;
  currency: string;
  day: TripDay | null;
  // 이 지갑의 예산을 정할 수 있는 방식인가. 모임 통장 여행의 남은 내 돈 줄은 정하라는 문구 없이 합계만.
  settable: boolean;
  compact?: boolean;
}) {
  const s = wallet.summary;
  const money = (minor: number) => formatMoney(minor, currency);
  const mine = wallet.side === "mine";
  const hasTotal = wallet.total !== null && !wallet.stale;
  const unsetText = !settable
    ? ""
    : wallet.stale
      ? "예산 통화가 바뀌었어요"
      : mine
        ? "내 예산을 정해 주세요"
        : "모임 예산을 정해 주세요";
  const dayEstimate = day
    ? (wallet.periods.byDate[day.date]?.estimate ?? 0)
    : 0;
  const label = compact ? (
    <span className="inline-flex items-center gap-0.5 font-semibold">
      {SIDE_LABELS[wallet.side]}
      {mine && <LockIcon />}
    </span>
  ) : mine ? (
    // 각자 여행의 내 막대 하나: 자물쇠만(글자는 화면 읽기용).
    <span className="inline-flex items-center self-center">
      <LockIcon />
      <span className="sr-only">내 예산</span>
    </span>
  ) : null;

  // 글자 조각(text node)을 #97 줄과 같게 나눈다: 조각이 다르면 글자 모양이 몇 px 달라진다.
  const dayLabel = day && [day.dayNumber, "일차 예상", " "];
  const main = day ? (
    <span className="font-semibold">
      {dayLabel}
      {money(dayEstimate)}
    </span>
  ) : (
    <span className="font-semibold">
      예상 {money(s.projected)}
      {hasTotal && <> / {money(s.total)}</>}
    </span>
  );
  const side = day ? (
    <span className="text-xs text-sub">
      전체 {money(s.projected)}
      {hasTotal ? <> / {money(s.total)}</> : unsetText && ` · ${unsetText}`}
    </span>
  ) : hasTotal ? (
    <span className="text-xs">
      <BalanceText balance={s.balance} currency={currency} />
    </span>
  ) : (
    <span className="text-xs text-sub">{unsetText}</span>
  );

  if (compact) {
    return (
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs tabular-nums">
          <span className="flex items-baseline gap-1.5">
            {label}
            {day ? (
              <span>
                {day.dayNumber}일차 {money(dayEstimate)}
              </span>
            ) : (
              <span>
                {money(s.projected)}
                {hasTotal && <> / {money(s.total)}</>}
              </span>
            )}
          </span>
          {day ? (
            <span className="text-sub">
              전체 {money(s.projected)}
              {hasTotal && <> / {money(s.total)}</>}
            </span>
          ) : hasTotal ? (
            <BalanceText balance={s.balance} currency={currency} />
          ) : (
            <span className="text-sub">{unsetText}</span>
          )}
        </span>
        {hasTotal && <BudgetBar projected={s.projected} total={s.total} thin />}
      </span>
    );
  }
  return (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
        {label}
        {main}
        {side}
      </span>
      {hasTotal && <BudgetBar projected={s.projected} total={s.total} thin />}
    </>
  );
}

// 예산이 없는 여행의 아래 줄(#97). 누르면 설정 양식이 열린 예산 시트.
export function BudgetSetupDock({ onOpen }: { onOpen: () => void }) {
  return (
    <div className={dockClass}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex w-full flex-col gap-0.5 rounded-md text-left"
      >
        <span className="text-sm font-semibold">예산 정하기</span>
        <span className="text-xs text-sub">
          일정마다 예상 비용과 실제 지출을 적을 수 있어요
        </span>
      </button>
    </div>
  );
}
