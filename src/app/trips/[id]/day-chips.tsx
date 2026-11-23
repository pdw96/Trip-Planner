"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { lineClass } from "@/lib/day-line";
import { dateLabel } from "@/lib/schedule";
import { useSelectedDay } from "./selected-day";

// [전체] + 날마다 노선 색 동그라미(#53 설계 §5.4 4). 위 날짜 줄과 예산 시트가 함께 쓴다(#97).
export function DayChips({
  days,
}: {
  days: { date: string; dayNumber: number }[];
}) {
  const { selected, select } = useSelectedDay();
  const rowRef = useRef<HTMLFieldSetElement>(null);

  // 고른 날(처음에는 여행 중이면 오늘)이 줄 밖에 있으면 줄만 옮겨 가운데에 둔다. 예산 표에서 날을 골라도 따라온다.
  // scrollIntoView 는 페이지도 움직이므로 쓰지 않는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 고른 날이 바뀔 때마다 맞춘다
  useLayoutEffect(() => {
    const row = rowRef.current;
    const button = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !button) return;
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left >= row.scrollLeft && right <= row.scrollLeft + row.clientWidth)
      return;
    row.scrollLeft = left - row.clientWidth / 2 + button.offsetWidth / 2;
  }, [selected]);

  const allActive = selected === "all";
  return (
    <fieldset
      ref={rowRef}
      className="relative -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-2"
    >
      <legend className="sr-only">날짜 고르기</legend>
      <button
        type="button"
        onClick={() => select("all")}
        aria-pressed={allActive}
        title="모든 장소"
        className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
          allActive
            ? "bg-foreground text-on-ink"
            : "border border-rule hover:bg-surface"
        }`}
      >
        전체
      </button>
      {days.map((d) => {
        const active = d.date === selected;
        return (
          <Fragment key={d.date}>
            <button
              type="button"
              onClick={() => select(d.date)}
              aria-pressed={active}
              aria-label={`${d.dayNumber}일차 ${dateLabel(d.date, false)}`}
              className={`size-9 shrink-0 rounded-full text-sm font-bold text-on-line tabular-nums ${lineClass(d.dayNumber, "bg")} ${
                active
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : "opacity-45 hover:opacity-80"
              }`}
            >
              {d.dayNumber}
            </button>
            {active && (
              <span className="shrink-0 pr-1 text-sm whitespace-nowrap text-sub">
                {dateLabel(d.date, false)}
              </span>
            )}
          </Fragment>
        );
      })}
    </fieldset>
  );
}
