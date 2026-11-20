import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/app/ui/styles";
import { getTrip } from "@/db/queries/trips";
import { tripDays } from "@/lib/schedule";
import { getCurrentUser } from "@/lib/session";
import { formatLongRange, stayLength, todayInSeoul } from "@/lib/trip-dates";
import { DeleteTripButton } from "../delete-trip-button";
import { BudgetDockSection } from "./budget-dock-section";
import { DayRouteProvider } from "./day-route-store";
import { MapSection } from "./map-section";
import { MembersSection } from "./members-section";
import { ScheduleSection } from "./schedule-section";
import { SelectedDayProvider } from "./selected-day";
import { TripDayBar } from "./trip-day-bar";

export default function TripPage({ params }: PageProps<"/trips/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
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

  const todayInTrip = today >= trip.startDate && today <= trip.endDate;

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/trips" className="text-sm text-sub hover:underline">
            ← 내 여행
          </Link>
          <div className="flex gap-2">
            <Link
              href={`/trips/${trip.id}/edit`}
              className={buttonClass("secondary", "small")}
            >
              고치기
            </Link>
            {trip.isOwner && <DeleteTripButton tripId={trip.id} />}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h1 id="trip-title" className="text-2xl font-bold break-words">
            {trip.title}
          </h1>
          <p className="text-sub break-words">
            {trip.destination} · {formatLongRange(trip.startDate, trip.endDate)}{" "}
            · {stayLength(trip.startDate, trip.endDate)}
          </p>
        </div>
        {trip.notes && (
          <p className="whitespace-pre-wrap break-words rounded-[14px] bg-surface px-4 py-3">
            {trip.notes}
          </p>
        )}
        <Suspense fallback={null}>
          <MembersSection userId={user.id} trip={trip} />
        </Suspense>
      </header>
      {/* 지도 N일차 탭과 일정표(#37)가 구간 이동 정보를 함께 쓴다. */}
      <DayRouteProvider key={trip.id} tripId={trip.id}>
        {/* 날짜 줄·지도·예산·일정이 같은 고른 날을 읽는다(#53 §5.4.1). 처음 값: 여행 중이면 오늘. */}
        <SelectedDayProvider
          startDate={trip.startDate}
          endDate={trip.endDate}
          initial={todayInTrip ? today : "all"}
        >
          <TripDayBar
            title={trip.title}
            titleId="trip-title"
            days={tripDays(trip.startDate, trip.endDate).map(
              ({ date, dayNumber }) => ({ date, dayNumber }),
            )}
          />
          {/* 지도는 좌표 30일 갱신으로 Google 을 부를 수 있어 따로 기다린다(머리·일정이 먼저 보이게). */}
          <Suspense
            fallback={<p className="text-sm text-sub">지도를 불러오는 중…</p>}
          >
            <MapSection userId={user.id} trip={trip} />
          </Suspense>
          <ScheduleSection userId={user.id} trip={trip} today={today} />
          {/* 휴대폰 아래 예산 줄(§5.4.2). article 마지막이라 끝까지 내리면 제자리에 놓인다. */}
          <Suspense fallback={null}>
            <BudgetDockSection userId={user.id} trip={trip} today={today} />
          </Suspense>
        </SelectedDayProvider>
      </DayRouteProvider>
    </article>
  );
}
