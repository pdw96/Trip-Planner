"use client";

// 왜 있나: 날짜 줄·지도 칸·예산·일정·아래 예산 줄이 같은 "고른 날"을 읽는다(#53 설계 §5.4.1).
// 페이지 안 상태로만 둔다(주소·DB 에 저장하지 않음). 고른 날이 여행 기간에서 사라지면 [전체]로 본다.

import { createContext, use, useState } from "react";
import { resolveSelection } from "@/lib/trip-dates";

type SelectedDay = {
  // "all" 또는 여행 기간 안 날짜.
  selected: string;
  select: (value: string) => void;
  // 이미 고른 값을 다시 고를 때마다 1 늘어난다(지도 칸이 그날 구간을 다시 묻는다).
  reselectCount: number;
};

const SelectedDayContext = createContext<SelectedDay | null>(null);

export function SelectedDayProvider({
  startDate,
  endDate,
  initial,
  children,
}: {
  startDate: string;
  endDate: string;
  initial: string;
  children: React.ReactNode;
}) {
  const [raw, setRaw] = useState(initial);
  const [reselectCount, setReselectCount] = useState(0);
  const selected = resolveSelection(raw, startDate, endDate);
  function select(value: string) {
    if (value === selected) setReselectCount((n) => n + 1);
    else setRaw(value);
  }
  return (
    <SelectedDayContext value={{ selected, select, reselectCount }}>
      {children}
    </SelectedDayContext>
  );
}

export function useSelectedDay(): SelectedDay {
  const value = use(SelectedDayContext);
  if (!value) throw new Error("SelectedDayProvider 안에서만 쓸 수 있어요.");
  return value;
}

// value 가 "all" 이면 [전체]일 때만, 날짜면 [전체]이거나 그날일 때 보인다.
// 감출 때도 그린다(hidden): 열린 입력칸·끌기 상태가 날짜를 오가도 남게.
export function ShownWhen({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const { selected } = useSelectedDay();
  const shown = selected === "all" || selected === value;
  return <div hidden={!shown}>{children}</div>;
}
