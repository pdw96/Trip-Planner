import Link from "next/link";
import { MiniLine } from "@/app/ui/mini-line";
import {
  emptyStateClass,
  primaryButtonClass,
  subTitleClass,
} from "@/app/ui/styles";
import {
  formatShortRange,
  nextTripBadge,
  todayInSeoul,
  tripDayCount,
} from "@/lib/trip-dates";
import { withNames } from "@/lib/trip-people";
import { loadTripLists } from "./trip-lists";

// 홈의 "다음 여행" 칸(#122 설계 §5.3): 끝나지 않은 여행 중 가장 가까운 하나(기록 제외).
export async function NextTripSection({ userId }: { userId: string }) {
  const today = todayInSeoul();
  const { next, together, ahead, memories } = await loadTripLists(
    userId,
    today,
  );

  if (!next) {
    const none =
      together.length === 0 && ahead.length === 0 && memories.length === 0;
    return (
      <section className="flex flex-col gap-2">
        <h2 className={subTitleClass}>다음 여행</h2>
        <div className={emptyStateClass}>
          {none ? (
            <>
              <p className="font-semibold">아직 여행이 없어요</p>
              <p className="text-sm text-sub">
                첫 여행을 만들거나, 친구에게 받은 초대 링크를 열어 함께 가는
                여행에 들어가 보세요.
              </p>
            </>
          ) : (
            <p className="font-semibold">다가오는 여행이 없어요</p>
          )}
          <Link href="/trips/new" className={primaryButtonClass}>
            새 여행 만들기
          </Link>
          {!none && (
            <Link href="/mine" className="text-sm text-sub hover:underline">
              {/* 끝나지 않은 것이 떼어 낸 기록뿐이면 추억이 아니라 "앞으로"에 있다. */}
              {memories.length > 0 ? "내 여행에서 추억 보기" : "내 여행 보기"}
            </Link>
          )}
        </div>
      </section>
    );
  }

  const people = withNames(next.people);
  return (
    <section className="flex flex-col gap-2">
      <h2 className={subTitleClass}>다음 여행</h2>
      <Link
        href={`/trips/${next.id}`}
        className="flex flex-col gap-2.5 rounded-[14px] bg-surface p-[18px] transition-opacity hover:opacity-85"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-xl font-bold break-words">
            {next.title}
            {!next.isOwner && (
              <span className="ml-1.5 inline-block rounded-md border border-rule px-1.5 align-[3px] text-xs font-medium text-sub">
                {next.ownerName}님의 여행
              </span>
            )}
          </span>
          <span className="shrink-0 text-[15px] font-bold text-ok">
            {nextTripBadge(next.startDate, today)}
          </span>
        </span>
        <span className="text-[13.5px] text-sub break-words">
          {next.destination},{" "}
          {formatShortRange(next.startDate, next.endDate, today)}
          {people && ` · ${people} 함께`}
        </span>
        <MiniLine
          dayCount={tripDayCount(next.startDate, next.endDate)}
          size="lg"
        />
      </Link>
    </section>
  );
}
