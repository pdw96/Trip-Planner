import { redirect } from "next/navigation";
import { Suspense } from "react";
import { calendarRange, yearsInRange } from "@/lib/calendar";
import { countryOptions } from "@/lib/countries";
import { getHolidays } from "@/lib/holidays-api";
import { getCurrentUser } from "@/lib/session";
import { todayInSeoul } from "@/lib/trip-dates";
import { EMPTY_TRIP_FIELDS } from "@/lib/trip-input";
import { createTripAction } from "../actions";
import { TripForm } from "../trip-form";

export default function NewTripPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">새 여행</h1>
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <NewTripForm />
      </Suspense>
    </main>
  );
}

async function NewTripForm() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const today = todayInSeoul();
  const range = calendarRange(today, "", "");

  return (
    <TripForm
      today={today}
      range={range}
      holidays={getHolidays(yearsInRange(range))}
      countries={countryOptions()}
      action={createTripAction}
      initialValues={EMPTY_TRIP_FIELDS}
      submitLabel="만들기"
      cancelHref="/"
    />
  );
}
