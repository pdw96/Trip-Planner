import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/app/ui/styles";
import { listRecordCompanions } from "@/db/queries/trip-records";
import { getTrip } from "@/db/queries/trips";
import { tripDays } from "@/lib/schedule";
import { getCurrentUser } from "@/lib/session";
import { formatLongRange, stayLength, todayInSeoul } from "@/lib/trip-dates";
import { companionsLine, recordNotice } from "@/lib/trip-records";
import { DeleteTripButton } from "../delete-trip-button";
import { BudgetSection } from "./budget-section";
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
  // 떼어 낸 기록(#103): 함께 쓰던 것은 보기만, 내 몫만 쓴다. 각 칸은 trip.detachedAt 으로 같은 판단을 한다.
  const record = trip.detachedAt !== null;
  const companions = record ? await listRecordCompanions(user.id, trip.id) : [];

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/trips" className="text-sm text-sub hover:underline">
            ← 내 여행
          </Link>
          <div className="flex gap-2">
            {!record && (
              <Link
                href={`/trips/${trip.id}/edit`}
                className={buttonClass("secondary", "small")}
              >
                고치기
              </Link>
            )}
            {trip.isOwner && (
              <DeleteTripButton tripId={trip.id} record={record} />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold break-words">{trip.title}</h1>
          <p className="text-sub break-words">
            {trip.destination} · {formatLongRange(trip.startDate, trip.endDate)}{" "}
            · {stayLength(trip.startDate, trip.endDate)}
          </p>
        </div>
        {trip.detachedAt !== null && (
          <RecordBanner
            detachedAt={trip.detachedAt}
            ownerName={
              companions.find((person) => person.wasOwner)?.name ?? null
            }
            names={companions.map((person) => person.name)}
          />
        )}
        {trip.notes && (
          <p className="whitespace-pre-wrap break-words rounded-[14px] bg-surface px-4 py-3">
            {trip.notes}
          </p>
        )}
        {!record && (
          <Suspense fallback={null}>
            <MembersSection userId={user.id} trip={trip} />
          </Suspense>
        )}
      </header>
      {/* 지도 N일차 탭과 일정표(#37)가 구간 이동 정보를 함께 쓴다. */}
      <DayRouteProvider key={trip.id} tripId={trip.id}>
        {/* 날짜 줄·지도·일정·예산이 같은 고른 날을 읽는다(#53 §5.4.1). 처음 값: 여행 중이면 오늘. */}
        <SelectedDayProvider
          startDate={trip.startDate}
          endDate={trip.endDate}
          initial={todayInTrip ? today : "all"}
        >
          <TripDayBar
            title={trip.title}
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
          {/* 아래 예산 줄과 예산 시트(#97). article 마지막이라 줄이 끝까지 내리면 제자리에 놓인다. */}
          <Suspense fallback={null}>
            <BudgetSection userId={user.id} trip={trip} today={today} />
          </Suspense>
        </SelectedDayProvider>
      </DayRouteProvider>
    </article>
  );
}

// 떼어 낸 기록(#103)의 안내 띠와 함께한 사람 줄. 주인이 탈퇴했으면 "함께한 여행에서".
function RecordBanner({
  detachedAt,
  ownerName,
  names,
}: {
  detachedAt: Date;
  ownerName: string | null;
  names: string[];
}) {
  const line = companionsLine(names);
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-[14px] bg-warn-surface px-4 py-3 text-sm break-words">
        <strong className="font-semibold">떼어 낸 기록</strong> ·{" "}
        {recordNotice(ownerName, detachedAt)}
      </p>
      {line && <p className="text-sm text-sub break-words">{line}</p>}
    </div>
  );
}
