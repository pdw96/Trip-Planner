import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getTrip } from "@/db/queries/trips";
import { calendarRange, yearsInRange } from "@/lib/calendar";
import { getHolidays } from "@/lib/holidays-api";
import { getCurrentUser } from "@/lib/session";
import { todayInSeoul } from "@/lib/trip-dates";
import { updateTripAction } from "../../actions";
import { TripForm } from "../../trip-form";

export default function EditTripPage({
  params,
}: PageProps<"/trips/[id]/edit">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">여행 고치기</h1>
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <EditTripForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditTripForm({
  params,
}: {
  params: PageProps<"/trips/[id]/edit">["params"];
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { id } = await params;
  const trip = await getTrip(user.id, id);
  if (!trip) notFound();

  const today = todayInSeoul();
  const range = calendarRange(today, trip.startDate, trip.endDate);

  return (
    <TripForm
      today={today}
      range={range}
      holidays={getHolidays(yearsInRange(range))}
      action={updateTripAction.bind(null, trip.id)}
      initialValues={{
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        notes: trip.notes ?? "",
      }}
      submitLabel="저장"
      cancelHref={`/trips/${trip.id}`}
    />
  );
}
