import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MiniLine } from "@/app/ui/mini-line";
import { emptyStateClass, primaryButtonClass } from "@/app/ui/styles";
import { listTrips, type TripListItem } from "@/db/queries/trips";
import { tripDays } from "@/lib/schedule";
import { getCurrentUser } from "@/lib/session";
import {
  formatShortRange,
  splitTrips,
  todayInSeoul,
  tripCountdown,
} from "@/lib/trip-dates";
import { SignOutButton } from "../auth-buttons";

export default function TripsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">내 여행</h1>
        <div className="flex items-center gap-2">
          <Link href="/trips/new" className={primaryButtonClass}>
            + 새 여행
          </Link>
          <SignOutButton />
        </div>
      </header>
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <TripList />
      </Suspense>
    </main>
  );
}

async function TripList() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const today = todayInSeoul();
  const { upcoming, past } = splitTrips(await listTrips(user.id), today);

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className={emptyStateClass}>
        <p className="text-sm text-sub">
          아직 여행이 없어요. 첫 여행을 만들어 보세요.
        </p>
        <Link href="/trips/new" className={primaryButtonClass}>
          새 여행 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {upcoming.length > 0 && (
        <TripSection title="다가오는 여행" trips={upcoming} today={today} />
      )}
      {past.length > 0 && (
        <TripSection title="지난 여행" trips={past} today={today} />
      )}
    </div>
  );
}

function TripSection({
  title,
  trips,
  today,
}: {
  title: string;
  trips: TripListItem[];
  today: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-sub">{title}</h2>
      <ul className="flex flex-col border-b border-rule">
        {trips.map((trip) => (
          <TripRow key={trip.id} trip={trip} today={today} />
        ))}
      </ul>
    </section>
  );
}

// 목록 한 줄(#53 설계 §5.4): 제목, "목적지, 기간 · 남은 날", 날 수만큼 역이 찍힌 짧은 노선.
function TripRow({ trip, today }: { trip: TripListItem; today: string }) {
  const past = trip.endDate < today;
  const countdown = tripCountdown(trip.startDate, trip.endDate, today);
  return (
    <li className="border-t border-rule">
      <Link
        href={`/trips/${trip.id}`}
        className="-mx-2 flex flex-col gap-1.5 rounded-[10px] px-2 py-3.5 transition-colors hover:bg-surface"
      >
        <span
          className={`text-[17px] font-bold break-words ${past ? "opacity-55" : ""}`}
        >
          {trip.title}
          {!trip.isOwner && (
            <span className="ml-1.5 inline-block rounded-md border border-rule px-1.5 align-[2px] text-xs font-medium text-sub">
              {trip.ownerName}님의 여행
            </span>
          )}
        </span>
        <span className="text-[13.5px] text-sub break-words">
          {trip.destination},{" "}
          {formatShortRange(trip.startDate, trip.endDate, today)}
          {countdown && ` · ${countdown}`}
        </span>
        <MiniLine
          dayCount={tripDays(trip.startDate, trip.endDate).length}
          dim={past}
        />
      </Link>
    </li>
  );
}
