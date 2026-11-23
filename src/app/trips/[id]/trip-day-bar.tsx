"use client";

import { useEffect, useRef, useState } from "react";
import { DayChips } from "./day-chips";

// 여행 화면의 날짜 고르기(#53 설계 §5.4 4, §5.4.2). 칩은 DayChips(예산 시트와 함께 씀, #97).
// 내리면 화면 위에 붙고(sticky), 붙은 동안 작은 제목 한 줄이 함께 보인다(제목은 이미 화면 밖이다).
// 작은 제목 줄은 늘 자리를 차지하고(붙기 전에는 invisible) article 의 gap 안에 올라가 있어, 붙는 순간 아래 내용이 밀리지 않는다.
export function TripDayBar({
  title,
  days,
}: {
  title: string;
  days: { date: string; dayNumber: number }[];
}) {
  const [stuck, setStuck] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

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
      <DayChips days={days} />
    </div>
  );
}
