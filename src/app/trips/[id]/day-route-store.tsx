"use client";

// 왜 있나: 지도 칸 N일차 탭과 일정표(#37)가 같은 날의 구간 이동 정보를 두 번 묻지 않게, 페이지 단위로 결과를 함께 둔다.
// 결과는 이 화면의 메모리에만 있다(저장하지 않음, #13 설계 §3.2). 새로 고침하면 새로 묻는다.
// 키는 "날짜|서명"(daySignature). 동선이 바뀌면 서명이 바뀌어 새 키로 다시 묻고, 늦게 온 옛 결과는 옛 키에만 들어간다.
// 묻기는 Route Handler(./day-route)로 한다. Server Action 은 하나씩 차례로 보내져 저장이 Google 응답을 기다린다(#13).

import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { DayRouteResult } from "../day-route-loader";

type Entry = {
  // null 이면 기다리는 중.
  result: DayRouteResult | null;
  controller: AbortController | null;
};

const EMPTY_ROUTE: DayRouteResult = { ok: true, legs: [], notices: [] };

// 연결이 끊기거나 서버가 실패(401·404·500)를 돌려줘도 화면을 깨지 않고 "불러오지 못했어요"로 둔다.
async function fetchDayRoute(
  tripId: string,
  date: string,
  signal: AbortSignal,
): Promise<DayRouteResult> {
  try {
    const response = await fetch(
      `/trips/${encodeURIComponent(tripId)}/day-route?date=${encodeURIComponent(date)}`,
      { cache: "no-store", signal },
    );
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as DayRouteResult;
    return body?.ok === true &&
      Array.isArray(body.legs) &&
      Array.isArray(body.notices)
      ? body
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

class DayRouteStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();

  constructor(private tripId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(key: string): DayRouteResult | null {
    return this.entries.get(key)?.result ?? null;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  // 그 키의 진행 중 요청을 끊고 새로 묻는다.
  load(key: string, date: string) {
    this.entries.get(key)?.controller?.abort();
    const controller = new AbortController();
    const entry: Entry = { result: null, controller };
    this.entries.set(key, entry);
    this.emit();
    void fetchDayRoute(this.tripId, date, controller.signal).then((result) => {
      // 끊겼거나 그 사이 같은 키로 새로 물었으면 버린다.
      if (controller.signal.aborted || this.entries.get(key) !== entry) return;
      this.entries.set(key, { result, controller: null });
      this.emit();
    });
  }

  // 페이지를 떠나거나(Activity 로 숨음 포함) 할 때: 기다리던 요청은 끊고 지운다(돌아오면 다시 묻는다).
  // 받은 결과는 남긴다. 구독이 끊길 때(탭을 바꾸거나 날이 화면을 벗어남)는 끊지 않는다:
  // 끊어도 서버의 Google 호출은 멈추지 않으므로(#13 남은 지적) 받아 두는 편이 낫다.
  abortPending() {
    let changed = false;
    for (const [key, entry] of this.entries) {
      if (entry.controller) {
        entry.controller.abort();
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) this.emit();
  }
}

const StoreContext = createContext<DayRouteStore | null>(null);

// 여행이 바뀌면 새 저장소가 되도록 부르는 쪽이 key={tripId} 를 준다.
export function DayRouteProvider({
  tripId,
  children,
}: {
  tripId: string;
  children: React.ReactNode;
}) {
  const [store] = useState(() => new DayRouteStore(tripId));
  useEffect(() => () => store.abortPending(), [store]);
  return <StoreContext value={store}>{children}</StoreContext>;
}

const noop = () => {};

// date·서명의 구간 결과. hasLegs 가 false 면 묻지 않고 빈 결과다.
// wanted 가 true 이고 아직 그 키를 묻지 않았으면 묻는다. 결과는 wanted 와 상관없이 있으면 돌려준다.
// result 가 null 이면 기다리는 중(또는 아직 묻지 않음).
export function useDayRoute(
  date: string | null,
  signature: string,
  hasLegs: boolean,
  wanted: boolean,
): { result: DayRouteResult | null; reload: () => void } {
  const store = use(StoreContext);
  if (!store) throw new Error("DayRouteProvider 안에서만 쓸 수 있어요.");
  const key = date === null ? null : `${date}|${signature}`;
  const result = useSyncExternalStore(
    store.subscribe,
    () => (key === null ? null : store.get(key)),
    () => null,
  );

  useEffect(() => {
    if (date === null || key === null || !hasLegs || !wanted) return;
    if (!store.has(key)) store.load(key, date);
  }, [store, key, date, hasLegs, wanted]);

  if (date === null) return { result: null, reload: noop };
  if (!hasLegs) return { result: EMPTY_ROUTE, reload: noop };
  return {
    result,
    reload: () => {
      if (key !== null) store.load(key, date);
    },
  };
}
