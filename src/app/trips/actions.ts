"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createTrip, deleteTrip, updateTrip } from "@/db/queries/trips";
import { getCurrentUser } from "@/lib/session";
import {
  parseTripInput,
  type TripFields,
  type TripFormState,
} from "@/lib/trip-input";

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

// FormData 를 통째로 넘기지 않고 필요한 필드만 문자열로 꺼낸다.
function readTripFields(formData: FormData): TripFields {
  const field = (name: keyof TripFields) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    title: field("title"),
    destination: field("destination"),
    startDate: field("startDate"),
    endDate: field("endDate"),
    notes: field("notes"),
  };
}

export async function createTripAction(
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readTripFields(formData);
  const parsed = parseTripInput(values);
  if (!parsed.ok) return { values, errors: parsed.errors, formError: null };

  let id: string;
  try {
    id = await createTrip(user.id, parsed.value);
  } catch {
    return { values, errors: {}, formError: SAVE_FAILED };
  }

  revalidatePath("/trips");
  redirect(`/trips/${id}`);
}

// tripId 는 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다. 쿼리의 uuid 검사와 userId 범위가 막는다.
export async function updateTripAction(
  tripId: string,
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readTripFields(formData);
  const parsed = parseTripInput(values);
  if (!parsed.ok) return { values, errors: parsed.errors, formError: null };

  let updated: boolean;
  try {
    updated = await updateTrip(user.id, tripId, parsed.value);
  } catch {
    return { values, errors: {}, formError: SAVE_FAILED };
  }
  if (!updated) notFound();

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function deleteTripAction(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!(await deleteTrip(user.id, tripId))) notFound();

  revalidatePath("/trips");
  redirect("/trips");
}
