import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getTrip } from "@/db/queries/trips";
import { getCurrentUser } from "@/lib/session";
import { formatLongRange, todayInSeoul } from "@/lib/trip-dates";
import { DeleteTripButton } from "../delete-trip-button";
import { secondaryButtonClass } from "../styles";
import { DayRouteProvider } from "./day-route-store";
import { MapSection } from "./map-section";
import { ScheduleSection } from "./schedule-section";

export default function TripPage({ params }: PageProps<"/trips/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <Link href="/trips" className="text-sm text-zinc-500 hover:underline">
        ← 내 여행
      </Link>
      <Suspense fallback={<p className="text-zinc-500">불러오는 중…</p>}>
        <TripDetail params={params} />
      </Suspense>
    </main>
  );
}

async function TripDetail({
  params,
}: {
  params: PageProps<"/trips/[id]">["params"];
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { id } = await params;
  const trip = await getTrip(user.id, id);
  if (!trip) notFound();
  const today = todayInSeoul();

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
            {trip.title}
          </h1>
          <div className="flex gap-2">
            <Link
              href={`/trips/${trip.id}/edit`}
              className={secondaryButtonClass}
            >
              고치기
            </Link>
            <DeleteTripButton tripId={trip.id} />
          </div>
        </div>
        <p className="text-zinc-600 break-words dark:text-zinc-400">
          {trip.destination} · {formatLongRange(trip.startDate, trip.endDate)}
        </p>
        {trip.notes && (
          <p className="whitespace-pre-wrap break-words rounded-2xl bg-black/[.04] px-5 py-4 dark:bg-white/[.06]">
            {trip.notes}
          </p>
        )}
      </header>
      {/* 지도 N일차 탭과 일정표(#37)가 구간 이동 정보를 함께 쓴다. */}
      <DayRouteProvider key={trip.id} tripId={trip.id}>
        {/* 지도는 좌표 30일 갱신으로 Google 을 부를 수 있어 따로 기다린다(머리·일정이 먼저 보이게). */}
        <Suspense
          fallback={
            <p className="text-sm text-zinc-500">지도를 불러오는 중…</p>
          }
        >
          <MapSection userId={user.id} trip={trip} today={today} />
        </Suspense>
        <ScheduleSection userId={user.id} trip={trip} today={today} />
      </DayRouteProvider>
      {/* 예산(#14)이 이 아래에 들어온다. */}
    </article>
  );
}
