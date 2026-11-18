"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTrip } from "@/db/queries/trips";
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
