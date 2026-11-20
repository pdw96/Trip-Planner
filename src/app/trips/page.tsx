import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listTrips, type TripListItem } from "@/db/queries/trips";
import { getCurrentUser } from "@/lib/session";
import { formatShortRange, splitTrips, todayInSeoul } from "@/lib/trip-dates";
import { SignOutButton } from "../auth-buttons";
import { primaryButtonClass } from "./styles";

export default function TripsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">내 여행</h1>
        <div className="flex items-center gap-2">
          <Link href="/trips/new" className={primaryButtonClass}>
            + 새 여행
          </Link>
          <SignOutButton />
        </div>
      </header>
      <Suspense fallback={<p className="text-zinc-500">불러오는 중…</p>}>
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
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">
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
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500">{title}</h2>
      <ul className="flex flex-col gap-2">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link
              href={`/trips/${trip.id}`}
              className="flex flex-col gap-1 rounded-2xl border border-black/[.08] px-5 py-4 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              <span className="font-semibold break-words">{trip.title}</span>
              <span className="text-sm text-zinc-600 break-words dark:text-zinc-400">
                {trip.destination} ·{" "}
                {formatShortRange(trip.startDate, trip.endDate, today)}
              </span>
              {!trip.isOwner && (
                <span className="text-sm text-zinc-500 break-words">
                  {trip.ownerName}님의 여행
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
