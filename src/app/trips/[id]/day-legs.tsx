import { lineClass } from "@/lib/day-line";
import { NOTICES, type Notice } from "@/lib/leg-display";

// N일차 구간 목록(지도 아래). 표시만 한다. 무엇을 보일지는 trip-map-panel 이 정한다.
// 글자 모양은 일정표 이동 줄과 같다(이동 글자는 본문 색, 그날 색은 줄 앞 작은 막대, #53 §5.4 4).

export type LegRow = {
  key: string;
  fromMarker: string;
  toMarker: string;
  // 도착 장소 이름표(숙소 포함).
  toLabel: string | null;
  // null 이면 아직 이동 정보를 기다리는 중(직선 거리만 보인다).
  text: string | null;
  distanceText: string;
  directionsUrl: string;
};

export function DayLegs({
  dayNumber,
  rows,
  notices,
}: {
  dayNumber: number;
  rows: LegRow[];
  notices: Notice[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-rule">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span
              aria-hidden
              className={`h-4 w-1.5 shrink-0 self-center rounded-full ${lineClass(dayNumber, "bg")}`}
            />
            <span className="min-w-0 break-words text-sub">
              {row.fromMarker} → {row.toMarker}
              {row.toLabel && ` ${row.toLabel}`}
            </span>
            <span className="font-medium">
              {row.text === null ? "불러오는 중…" : row.text}
            </span>
            <span className="tabular-nums text-sub">
              직선 {row.distanceText}
            </span>
            <a
              href={row.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 text-sub hover:underline"
            >
              Google 지도 ↗
            </a>
          </li>
        ))}
      </ul>
      {notices.map((notice) => (
        <p key={notice} className="text-sm text-sub break-words">
          ⓘ {NOTICES[notice]}
        </p>
      ))}
    </div>
  );
}
