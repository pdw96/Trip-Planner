"use client";

import { useEffect, useRef } from "react";
import { buttonClass } from "@/app/ui/styles";
import type { TripDay } from "@/lib/schedule";
import { dragAxis, shouldCloseSheet } from "@/lib/sheet-drag";
import { BudgetCard } from "./budget-card";
import { centerSelectedChip, DayChips } from "./day-chips";
import type { PanelBudget } from "./map-types";
import { useSelectedDay } from "./selected-day";

// 아래 예산 줄을 누르면 올라오는 예산 시트(#97 설계). 맨 위 날짜 칩은 위 날짜 줄과 같은 고른 날을 읽고 바꾼다.
// <dialog> showModal: 초점 가두기·Esc 닫기·닫은 뒤 연 버튼으로 초점 돌려주기를 브라우저가 한다.
// 쓸어내리기는 머리(손잡이·날짜 칩 줄)에서만 받는다: 몸에서 받으면 긴 카드를 스크롤하다 닫힐 수 있다.

export type SheetRequest = { mode: "view" | "settings"; id: number };

type Drag = {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  axis: "x" | "y" | null;
  dy: number;
};

export function BudgetSheet({
  tripId,
  budget,
  days,
  request,
  onClose,
}: {
  tripId: string;
  budget: PanelBudget;
  days: TripDay[];
  // null 이면 닫힘. id 가 바뀔 때마다 새로 연다(안의 양식이 지난 입력 없이 시작).
  request: SheetRequest | null;
  onClose: () => void;
}) {
  const { selected, select } = useSelectedDay();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drag = useRef<Drag | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // 세로로 끌고 놓은 직후의 click 하나를 막는다(놓은 자리 칩이 눌리지 않게).
  const swallowClick = useRef(false);
  // 바깥 누르기 닫기는 누른 곳과 뗀 곳이 모두 바탕일 때만(시트 안에서 끌다 바깥에서 놓으면 닫지 않음).
  const downOnBackdrop = useRef(false);

  // 닫힌 동안(display:none) 안의 칩 줄 가운데 맞추기·양식 초점은 아무 일도 못 하므로, 연 직후 다시 한다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!request || !dialog || dialog.open) return;
    dialog.showModal();
    const row = chipsRef.current?.querySelector("fieldset");
    if (row) centerSelectedChip(row);
    const first =
      request.mode === "settings"
        ? dialog.querySelector<HTMLElement>("form input:not([type=hidden])")
        : null;
    (first ?? closeRef.current)?.focus();
  }, [request]);

  function clearDragStyle() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.style.translate = "";
    dialog.style.transition = "";
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      axis: null,
      dy: 0,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const dialog = dialogRef.current;
    if (!d || !dialog || d.pointerId !== event.pointerId) return;
    // 마우스를 머리 밖에서 놓아 pointerup 을 못 받은 경우: 끌기를 끝낸다(떠다니는 끌기가 남지 않게).
    if (event.pointerType === "mouse" && event.buttons === 0) {
      drag.current = null;
      clearDragStyle();
      return;
    }
    const dy = event.clientY - d.y;
    if (d.axis === null) {
      d.axis = dragAxis(event.clientX - d.x, dy);
      if (d.axis === null) return;
      if (d.axis === "x") {
        // 가로: 칩 줄 넘기기. 이번 동작은 쓸어내리기가 아니다.
        drag.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      dialog.style.transition = "none";
    }
    d.dy = dy;
    dialog.style.translate = `0 ${Math.max(0, dy)}px`;
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    const dialog = dialogRef.current;
    if (!d || !dialog || d.axis !== "y") return;
    swallowClick.current = true;
    // click 이 오지 않는 경우(놓은 자리가 다른 요소)에 다음 진짜 click 을 막지 않게 곧 푼다.
    setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    if (shouldCloseSheet(d.dy, event.timeStamp - d.time, dialog.offsetHeight)) {
      dialog.close();
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    dialog.style.transition = reduced ? "none" : "translate 200ms ease-out";
    dialog.style.translate = "";
  }

  function onPointerCancel() {
    drag.current = null;
    clearDragStyle();
  }

  return (
    // 바깥(바탕 가림막)을 누르면 닫는다: 그때 event.target 이 dialog 자신이다. 키보드는 Esc 로 닫는다.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc 는 dialog 가 처리한다
    <dialog
      ref={dialogRef}
      aria-labelledby="budget-sheet-title"
      onPointerDown={(event) => {
        downOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && downOnBackdrop.current)
          dialogRef.current?.close();
      }}
      onClose={() => {
        clearDragStyle();
        onClose();
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[14px] bg-background p-0 text-foreground transition-[translate] duration-200 ease-out backdrop:bg-foreground/30 motion-reduce:transition-none starting:open:translate-y-full sm:mx-auto sm:max-w-2xl"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        // 머리의 세로 끌기는 브라우저(시트 스크롤)가 아니라 아래 pointer 처리가 받는다. 칩 줄 안은 DayChips 의 panXOnly 가 맡는다.
        className="sticky top-0 z-10 touch-pan-x border-b border-rule bg-background px-4 pt-2"
      >
        <h2 id="budget-sheet-title" className="sr-only">
          예산
        </h2>
        <div aria-hidden className="flex justify-center pb-1">
          <span className="h-1.5 w-10 rounded-full bg-rule" />
        </div>
        <div className="flex items-center gap-2">
          <div ref={chipsRef} className="min-w-0 flex-1">
            <DayChips days={days} panXOnly />
          </div>
          <button
            type="button"
            ref={closeRef}
            aria-label="예산 닫기"
            onClick={() => dialogRef.current?.close()}
            className={`shrink-0 ${buttonClass("quiet", "small")}`}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {request && (
          <BudgetCard
            key={request.id}
            tripId={tripId}
            budget={budget}
            tab={selected}
            days={days}
            onSelectTab={select}
            initialForm={request.mode === "settings" ? "settings" : undefined}
          />
        )}
      </div>
    </dialog>
  );
}
