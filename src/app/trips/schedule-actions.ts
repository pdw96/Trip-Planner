"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  createScheduleItem,
  deleteScheduleItem,
  getScheduleItem,
  setScheduleItemDone,
  updateScheduleItem,
} from "@/db/queries/schedule-items";
import { getTrip } from "@/db/queries/trips";
import {
  EMPTY_SCHEDULE_FIELDS,
  parseScheduleInput,
  type ScheduleFields,
  type ScheduleFormState,
} from "@/lib/schedule-input";
import { getCurrentUser } from "@/lib/session";
import { SAVE_FAILED } from "./messages";

// tripId·itemId·date 는 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위), 입력 검증의 날짜 규칙이 막는다.

// 고른 장소가 이 여행의 장소가 아니어서(그 사이 지워짐 등) 쓰기가 걸리지 않았을 때의 문구.
const PLACE_GONE = "장소를 다시 골라 주세요.";

// FormData 를 통째로 넘기지 않고 필요한 필드만 문자열로 꺼낸다. 추가는 날짜를 bind 값으로 받는다.
function readScheduleFields(
  formData: FormData,
  date: string | null,
): ScheduleFields {
  const field = (name: keyof ScheduleFields) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    // bind 값도 클라이언트가 바꿀 수 있으므로 문자열이 아니면 빈 값(→ 날짜 오류)으로 본다.
    date: date === null ? field("date") : typeof date === "string" ? date : "",
    time: field("time"),
    title: field("title"),
    place: field("place"),
    placeId: field("placeId"),
    memo: field("memo"),
  };
}

function tripPath(tripId: string): string {
  return `/trips/${tripId}`;
}

export async function createScheduleItemAction(
  tripId: string,
  date: string,
  prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readScheduleFields(formData, date);
  const trip = await getTrip(user.id, tripId);
  if (!trip) notFound();
  const parsed = parseScheduleInput(values, trip);
  if (!parsed.ok) {
    return {
      values,
      errors: parsed.errors,
      formError: null,
      savedAt: prev.savedAt,
    };
  }

  let id: string | null;
  try {
    id = await createScheduleItem(user.id, tripId, parsed.value);
  } catch {
    return {
      values,
      errors: {},
      formError: SAVE_FAILED,
      savedAt: prev.savedAt,
    };
  }
  if (!id) {
    // 장소를 골랐는데 쓰기가 걸리지 않았고 여행은 여전히 보이면, 고른 장소가 그 사이 지워진 것이다.
    // 내 여행 안의 일이므로 notFound 대신 장소를 다시 고르게 한다. 여행이 안 보이면 지금처럼 찾을 수 없음.
    if (parsed.value.placeId !== null && (await getTrip(user.id, tripId))) {
      revalidatePath(tripPath(tripId));
      return {
        values: { ...values, placeId: "" },
        errors: { place: PLACE_GONE },
        formError: null,
        savedAt: prev.savedAt,
      };
    }
    notFound();
  }

  revalidatePath(tripPath(tripId));
  return {
    values: { ...EMPTY_SCHEDULE_FIELDS, date },
    errors: {},
    formError: null,
    savedAt: Date.now(),
  };
}

export async function updateScheduleItemAction(
  tripId: string,
  itemId: string,
  prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readScheduleFields(formData, null);
  const [trip, item] = await Promise.all([
    getTrip(user.id, tripId),
    getScheduleItem(user.id, tripId, itemId),
  ]);
  if (!trip || !item) notFound();
  const parsed = parseScheduleInput(values, {
    startDate: trip.startDate,
    endDate: trip.endDate,
    currentDate: item.date,
  });
  if (!parsed.ok) {
    return {
      values,
      errors: parsed.errors,
      formError: null,
      savedAt: prev.savedAt,
    };
  }

  let updated: boolean;
  try {
    updated = await updateScheduleItem(user.id, tripId, itemId, parsed.value);
  } catch {
    return {
      values,
      errors: {},
      formError: SAVE_FAILED,
      savedAt: prev.savedAt,
    };
  }
  if (!updated) {
    // 추가와 같다. 일정이 여전히 보이면 고른 장소가 그 사이 지워진 것이므로 장소를 다시 고르게 한다.
    // 글자 칸은 지금 일정의 장소 글자(이어졌던 장소의 이름표)로 채워 돌려준다.
    if (parsed.value.placeId !== null) {
      const current = await getScheduleItem(user.id, tripId, itemId);
      if (current) {
        revalidatePath(tripPath(tripId));
        return {
          values: { ...values, placeId: "", place: current.place ?? "" },
          errors: { place: PLACE_GONE },
          formError: null,
          savedAt: prev.savedAt,
        };
      }
    }
    notFound();
  }

  revalidatePath(tripPath(tripId));
  return { values, errors: {}, formError: null, savedAt: Date.now() };
}

// 줄에서 바로 부르는 낙관적 갱신이라, 대상 없음과 저장 실패를 똑같이 { ok: false } 로 돌려준다
// (반응이 같으므로 남의 일정이 있는지 드러나지 않는다).
export async function setScheduleItemDoneAction(
  tripId: string,
  itemId: string,
  done: boolean,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (typeof done !== "boolean") return { ok: false };

  let updated: boolean;
  try {
    updated = await setScheduleItemDone(user.id, tripId, itemId, done);
  } catch {
    return { ok: false };
  }
  if (!updated) return { ok: false };

  revalidatePath(tripPath(tripId));
  return { ok: true };
}

export async function deleteScheduleItemAction(
  tripId: string,
  itemId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!(await deleteScheduleItem(user.id, tripId, itemId))) notFound();

  revalidatePath(tripPath(tripId));
}
