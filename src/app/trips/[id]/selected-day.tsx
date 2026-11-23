"use client";

// 왜 있나: 날짜 줄·지도 칸·예산·일정·아래 예산 줄이 같은 "고른 날"을 읽는다(#53 설계 §5.4.1).
// 페이지 안 상태로만 둔다(주소·DB 에 저장하지 않음). 고른 날이 여행 기간에서 사라지면 [전체]로 본다.
// 고르기 직전 알림(onBeforeSelect): 맨 아래 예산 칸이 날이 바뀌기 전 자기 위치를 재 두었다가 바뀐 뒤 제자리를 지킨다(#88).

import { createContext, use, useCallback, useRef, useState } from "react";
import { resolveSelection } from "@/lib/trip-dates";

type SelectedDay = {
  // "all" 또는 여행 기간 안 날짜.
  selected: string;
  select: (value: string) => void;
  // 이미 고른 값을 다시 고를 때마다 1 늘어난다(지도 칸이 그날 구간을 다시 묻는다).
  reselectCount: number;
  // 고른 날이 바뀌기 직전(상태가 바뀌기 전)에 동기로 불린다. 해제 함수를 돌려준다.
  onBeforeSelect: (listener: () => void) => () => void;
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
  const beforeSelect = useRef(new Set<() => void>());
  const selected = resolveSelection(raw, startDate, endDate);
  // raw 는 늘 고른 값으로 둔다(기간에서 사라진 옛 날짜가 남아 있다가 날짜를 되돌리면 그날로 튀지 않게).
  // 같은 날을 다시 고르면 고른 날이 바뀌지 않으므로 고르기 직전 알림을 보내지 않는다(받는 쪽이 바뀔 때만 기록을 비운다).
  function select(value: string) {
    if (value === selected) setReselectCount((n) => n + 1);
    else for (const listener of beforeSelect.current) listener();
    setRaw(value);
  }
  // 늘 같은 함수(구독하는 쪽 effect 가 렌더마다 다시 돌지 않게).
  const onBeforeSelect = useCallback((listener: () => void) => {
    const listeners = beforeSelect.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return (
    <SelectedDayContext
      value={{ selected, select, reselectCount, onBeforeSelect }}
    >
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
