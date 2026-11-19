"use client";

import { useRef } from "react";
import { legText, NOTICES } from "@/lib/leg-display";
import { type LineLeg, placeTravelLines } from "@/lib/travel-lines";
import { useDayRoute } from "./day-route-store";
import {
  type DateOption,
  type RowItem,
  ScheduleItemRow,
} from "./schedule-editor";
import { useDwellVisible } from "./use-dwell-visible";

// 일정표 한 날의 일정 줄과, 그 사이 예상 이동 시간 줄(#37).
// 날이 화면에 머물면 그날 구간을 묻는다(지도 N일차 탭과 결과를 함께 쓴다, ./day-route-store).
// 이동 줄 자리는 응답 구간의 일정 id 로 정한다. 답이 오기 전·실패면 서버가 만든 뼈대로 자리만 잡는다.

export type TravelSkeletonLeg = LineLeg & {
  distanceText: string;
  directionsUrl: string;
};

// 구간이 없는 날은 null.
export type DayTravel = {
  date: string;
  signature: string;
  legs: TravelSkeletonLeg[];
  // 그날 동선의 장소 id → 이름표. 응답 구간의 출발지 문구에 쓴다.
  labels: Record<string, string>;
};

type LineView = LineLeg & {
  text: string;
  directionsUrl: string;
  failed: boolean;
};

const LOADING_TEXT = "이동 시간 불러오는 중…";

export function ScheduleDayItems({
  tripId,
  items,
  dateOptions,
  travel,
}: {
  tripId: string;
  items: RowItem[];
  dateOptions: DateOption[];
  travel: DayTravel | null;
}) {
  // 날 칸에 늘 있는 감싸개를 지켜본다(빈 날에 첫 일정을 넣어도 그대로 지켜보도록).
  const dayRef = useRef<HTMLDivElement>(null);
  const wanted = useDwellVisible(dayRef);
  const { result, reload } = useDayRoute(
    travel?.date ?? null,
    travel?.signature ?? "",
    travel !== null,
    wanted,
  );

  let lines: LineView[] = [];
  if (travel && result?.ok) {
    lines = result.legs.map((leg, i) => ({
      key: `r${i}:${leg.fromId}>${leg.toId}`,
      fromItemId: leg.fromItemId,
      toItemId: leg.toItemId,
      fromLabel: travel.labels[leg.fromId] ?? null,
      toLabel: travel.labels[leg.toId] ?? null,
      text: leg.text !== "" ? leg.text : `직선 ${leg.distanceText}`,
      directionsUrl: leg.directionsUrl,
      failed: leg.result.kind === "failed",
    }));
  } else if (travel) {
    lines = travel.legs.map((leg) => ({
      ...leg,
      text: result === null ? LOADING_TEXT : legText({ kind: "failed" }),
      failed: result !== null,
    }));
  }
  const placed = placeTravelLines(
    items.map((item) => item.id),
    lines,
  );

  if (items.length === 0) {
    return (
      <div ref={dayRef}>
        <p className="py-2 text-sm text-zinc-500">아직 일정이 없어요</p>
      </div>
    );
  }

  return (
    <div ref={dayRef} className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {items.map((item) => {
          const line = placed.before.get(item.id);
          return [
            line && (
              <TravelLine
                key={`travel:${line.leg.key}`}
                line={line.leg}
                caption={line.caption}
                onRetry={reload}
              />
            ),
            <ScheduleItemRow
              key={item.id}
              tripId={tripId}
              item={item}
              dateOptions={dateOptions}
            />,
          ];
        })}
        {placed.after && (
          <TravelLine
            key={`travel:${placed.after.leg.key}`}
            line={placed.after.leg}
            caption={placed.after.caption}
            onRetry={reload}
          />
        )}
      </ul>
      {result?.ok &&
        result.notices.map((notice) => (
          <p
            key={notice}
            className="text-sm text-zinc-600 break-words dark:text-zinc-400"
          >
            ⓘ {NOTICES[notice]}
          </p>
        ))}
    </div>
  );
}

function TravelLine({
  line,
  caption,
  onRetry,
}: {
  line: LineView;
  caption: string | null;
  onRetry: () => void;
}) {
  return (
    <li className="flex items-baseline gap-3 py-0.5 text-sm text-zinc-500">
      <span className="w-12 shrink-0" />
      <span className="min-w-0 flex-1 break-words">
        ↓ {caption && `${caption} · `}
        {line.text}
        {line.failed && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 text-zinc-600 underline dark:text-zinc-400"
          >
            다시
          </button>
        )}
      </span>
      <a
        href={line.directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 hover:underline"
      >
        길찾기 ↗
      </a>
    </li>
  );
}
