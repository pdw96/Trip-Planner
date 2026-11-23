"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sectionTitleClass } from "@/app/ui/styles";
import type { TripDay } from "@/lib/schedule";
import { BudgetCard } from "./budget-card";
import { BudgetDock } from "./budget-dock";
import type { PanelBudget } from "./map-types";
import { useSelectedDay } from "./selected-day";

// 맨 아래 예산 칸과 아래 예산 줄(#88 설계). 줄은 예산 칸이 화면에 조금이라도 보이면 숨고, 줄의 요약을 누르면 예산 칸으로 간다.
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
  const { selected, select, onBeforeSelect } = useSelectedDay();
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // null: 아직 모름(서버 렌더·첫 관찰 전). 그동안 줄을 숨겨, 예산 칸이 처음부터 보이는 짧은 여행에서 줄이 잠깐 떴다 사라지지 않게 한다.
  const [sectionVisible, setSectionVisible] = useState<boolean | null>(null);
  // 날을 바꾸기 직전 예산 칸의 화면 위치. 바뀐 뒤 위의 일정·가 볼 곳 높이가 달라져도 칸을 제자리에 둔다.
  const before = useRef<{ top: number; visible: boolean } | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      // 줄이 inert 가 되면 안의 초점이 body 로 떨어진다. 그 전에 예산 칸 제목으로 옮긴다.
      if (
        entry.isIntersecting &&
        dockRef.current?.contains(document.activeElement)
      ) {
        headingRef.current?.focus({ preventScroll: true });
      }
      setSectionVisible(entry.isIntersecting);
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () =>
      onBeforeSelect(() => {
        const rect = sectionRef.current?.getBoundingClientRect();
        if (!rect) return;
        before.current = {
          top: rect.top,
          visible: rect.top < window.innerHeight && rect.bottom > 0,
        };
      }),
    [onBeforeSelect],
  );

  // 브라우저 scroll anchoring 이 이미 맞췄으면 차이가 0 이라 아무 일 없다(Safari 처럼 없는 브라우저를 위해 직접 맞춘다).
  // biome-ignore lint/correctness/useExhaustiveDependencies: 고른 날이 바뀔 때마다 맞춘다
  useLayoutEffect(() => {
    const saved = before.current;
    before.current = null;
    const section = sectionRef.current;
    if (!saved?.visible || !section) return;
    const delta = section.getBoundingClientRect().top - saved.top;
    if (Math.abs(delta) >= 1)
      window.scrollBy({ top: delta, behavior: "instant" });
  }, [selected]);

  function jump() {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    sectionRef.current?.scrollIntoView({
      block: "start",
      behavior: reduced ? "auto" : "smooth",
    });
    headingRef.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <section
        ref={sectionRef}
        aria-labelledby="budget-heading"
        className="flex scroll-mt-28 flex-col gap-4"
      >
        <h2
          id="budget-heading"
          ref={headingRef}
          tabIndex={-1}
          className={sectionTitleClass}
        >
          예산
        </h2>
        <BudgetCard
          tripId={tripId}
          budget={budget}
          tab={selected}
          days={days}
          onSelectTab={select}
        />
      </section>
      {budget && (
        <BudgetDock
          tripId={tripId}
          budget={budget}
          days={days}
          today={today}
          ref={dockRef}
          hidden={sectionVisible !== false}
          onJump={jump}
        />
      )}
    </>
  );
}
