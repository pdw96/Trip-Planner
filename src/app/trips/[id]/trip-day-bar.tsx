"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { lineClass } from "@/lib/day-line";
import { dateLabel } from "@/lib/schedule";
import { useSelectedDay } from "./selected-day";

// 여행 화면의 날짜 고르기(#53 설계 §5.4 4, §5.4.2). [전체] + 날마다 노선 색 동그라미.
// 내려서 제목이 화면 밖으로 나가면 작은 제목 한 줄과 함께 화면 위에 붙는다(sticky).
// 작은 제목 줄은 늘 자리를 차지하고(붙기 전에는 invisible) article 의 gap 안에 올라가 있어, 붙는 순간 아래 내용이 밀리지 않는다.
export function TripDayBar({
  title,
  titleId,
  days,
}: {
  title: string;
  titleId: string;
  days: { date: string; dayNumber: number }[];
}) {
  const { selected, select } = useSelectedDay();
  const [stuck, setStuck] = useState(false);
  const rowRef = useRef<HTMLFieldSetElement>(null);

  // 제목이 위로 나갔는지는 스크롤 이벤트가 아니라 IntersectionObserver 로 본다.
  useEffect(() => {
    const target = document.getElementById(titleId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [titleId]);

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
