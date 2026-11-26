import Link from "next/link";
import type { ListedTrip } from "@/app/(tabs)/trip-lists";
import { MiniLine } from "@/app/ui/mini-line";
import {
  formatShortRange,
  tripCountdown,
  tripDayCount,
} from "@/lib/trip-dates";
import { recordBadge } from "@/lib/trip-records";

// 목록 한 줄(#53 설계 §5.4): 제목, "목적지, 기간 · 남은 날", 날 수만큼 역이 찍힌 짧은 노선.
// 떼어 낸 기록(#103)은 "OO님 여행에서 · M/D 떼어 냄" 이름표, 회색 노선, 남은 날 없음.
// 탭 화면(#122): meta 는 둘째 줄 끝(" · " 뒤, 추억의 "OO님과"), line 은 셋째 줄(함께 탭의 이름 줄).
export function TripRow({
  trip,
  today,
  meta,
  line,
}: {
  trip: ListedTrip;
  today: string;
  meta?: string | null;
  line?: string | null;
}) {
  const record = trip.detachedAt !== null;
  const past = trip.endDate < today;
  const countdown = record
    ? null
    : tripCountdown(trip.startDate, trip.endDate, today);
  const badge =
    trip.detachedAt !== null
      ? recordBadge(trip.recordOwnerName, trip.detachedAt)
      : trip.isOwner
        ? null
        : `${trip.ownerName}님의 여행`;
  return (
    <li className="border-t border-rule">
      <Link
        href={`/trips/${trip.id}`}
        className="-mx-2 flex flex-col gap-1.5 rounded-[10px] px-2 py-3.5 transition-colors hover:bg-surface"
      >
        <span
          className={`text-[17px] font-bold break-words ${past && !record ? "opacity-55" : ""}`}
        >
          {trip.title}
          {badge && (
            <span className="ml-1.5 inline-block rounded-md border border-rule px-1.5 align-[2px] text-xs font-medium text-sub">
              {badge}
            </span>
          )}
        </span>
        <span className="text-[13.5px] text-sub break-words">
          {trip.destination},{" "}
          {formatShortRange(trip.startDate, trip.endDate, today)}
          {countdown && ` · ${countdown}`}
          {meta && ` · ${meta}`}
        </span>
        {line && (
          <span className="text-[13px] text-sub break-words">{line}</span>
        )}
        <MiniLine
          dayCount={tripDayCount(trip.startDate, trip.endDate)}
          dim={past || record}
        />
      </Link>
    </li>
  );
}
