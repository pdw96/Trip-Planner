"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { lineClass } from "@/lib/day-line";
import { dateLabel } from "@/lib/schedule";
import { useSelectedDay } from "./selected-day";

// 여행 화면의 날짜 고르기(#53 설계 §5.4 4, §5.4.2). [전체] + 날마다 노선 색 동그라미.
// 내리면 화면 위에 붙고(sticky), 붙은 동안 작은 제목 한 줄이 함께 보인다(제목은 이미 화면 밖이다).
// 작은 제목 줄은 늘 자리를 차지하고(붙기 전에는 invisible) article 의 gap 안에 올라가 있어, 붙는 순간 아래 내용이 밀리지 않는다.
export function TripDayBar({
  title,
  days,
}: {
  title: string;
  days: { date: string; dayNumber: number }[];
}) {
  const { selected, select } = useSelectedDay();
  const [stuck, setStuck] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLFieldSetElement>(null);

  // 줄이 실제로 화면 위에 붙었는지: 위쪽 1px 을 뺀 영역으로 보면 붙은 동안 줄 위 끝이 잘려 다 보이지 않는다.
  // 스크롤 이벤트마다 계산하지 않는다. (제목만 보면 줄이 아직 제자리일 때도 작은 제목이 떠 겹쳐 보인다.)
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setStuck(
          entry.intersectionRatio < 1 && entry.boundingClientRect.top < 1,
        );
      },
      { rootMargin: "-1px 0px 0px 0px", threshold: 1 },
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // 처음 그릴 때 고른 날(여행 중이면 오늘)이 줄 안에 보이게 줄만 옮긴다(scrollIntoView 는 페이지도 움직인다).
  useLayoutEffect(() => {
    const row = rowRef.current;
    const button = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !button) return;
    row.scrollLeft =
      button.offsetLeft - row.clientWidth / 2 + button.offsetWidth / 2;
  }, []);

  const allActive = selected === "all";
  return (
    <div
      ref={barRef}
      className="sticky top-0 z-20 -mx-4 -mt-6 border-b border-transparent bg-background px-4 data-[stuck=true]:border-rule sm:-mx-6 sm:px-6"
      data-stuck={stuck}
    >
      <p
        aria-hidden
        className={`h-6 truncate text-sm leading-6 font-bold ${stuck ? "" : "invisible"}`}
      >
        {title}
      </p>
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
    </div>
  );
}
