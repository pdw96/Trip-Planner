import { NOTICES, type Notice } from "@/lib/leg-display";

// N일차 구간 목록(지도 아래). 표시만 한다. 무엇을 보일지는 trip-map-panel 이 정한다.

export type LegRow = {
  key: string;
  fromMarker: string;
  toMarker: string;
  // 도착이 기준점이 아니면 그 장소 이름표.
  toLabel: string | null;
  // null 이면 아직 이동 정보를 기다리는 중(직선 거리만 보인다).
  text: string | null;
  distanceText: string;
  directionsUrl: string;
};

export function DayLegs({
  rows,
  notices,
}: {
  rows: LegRow[];
  notices: Notice[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="min-w-0 font-medium break-words">
              {row.fromMarker} → {row.toMarker}
              {row.toLabel && ` ${row.toLabel}`}
            </span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {row.text === null ? "불러오는 중…" : row.text}
            </span>
            <span className="tabular-nums text-zinc-500">
              직선 {row.distanceText}
            </span>
            <a
              href={row.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Google 지도 ↗
            </a>
          </li>
        ))}
      </ul>
      {notices.map((notice) => (
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
