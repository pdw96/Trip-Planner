"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { countPlaces, MAX_PLACES_PER_TRIP } from "@/db/queries/places";
import {
  createScheduleItem,
  createScheduleItemWithNewPlace,
  deleteScheduleItem,
  findPlaceIdByGoogleId,
  getScheduleItem,
  setScheduleItemDone,
  updateScheduleItem,
  updateScheduleItemWithNewPlace,
} from "@/db/queries/schedule-items";
import { getTrip } from "@/db/queries/trips";
import { fetchPlaceCoords } from "@/lib/google-maps-server";
import {
  EMPTY_SCHEDULE_FIELDS,
  type GooglePlacePick,
  parseScheduleInput,
  type ScheduleFields,
  type ScheduleFormState,
  type ScheduleInput,
} from "@/lib/schedule-input";
import { getCurrentUser } from "@/lib/session";
import { PLACE_LIMIT, PLACE_NOT_FOUND, SAVE_FAILED } from "./messages";

// tripId·itemId·date 는 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위), 입력 검증의 날짜 규칙이 막는다.
// Google 장소(#35)는 여행(·일정) 접근을 확인한 뒤에만 Google 을 부르고, 좌표는 서버가 직접 받는다.

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
    googlePlaceId: field("googlePlaceId"),
    googleLabel: field("googleLabel"),
    googleCategory: field("googleCategory"),
  };
}

function tripPath(tripId: string): string {
  return `/trips/${tripId}`;
}

// 고른 Google 장소 값을 비운다(장소를 다시 고르게 할 때).
function withoutGoogle(values: ScheduleFields): ScheduleFields {
  return { ...values, googlePlaceId: "", googleLabel: "", googleCategory: "" };
}

type GoogleResolution =
  | { kind: "existing"; placeId: string }
  | { kind: "new"; coords: { lat: number; lng: number } }
  | { kind: "error"; message: string };

// 같은 Google 장소가 이 여행에 이미 있으면 그 장소로(Google 을 부르지 않음).
// 없으면 장소 수 상한을 먼저 확인하고(호출 비용 상한, place-actions 와 같은 이유) 서버 키로 좌표를 받는다.
// 호출하는 쪽이 여행(·일정) 접근을 이미 확인했다.
async function resolveGooglePlace(
  userId: string,
  tripId: string,
  googlePlaceId: string,
): Promise<GoogleResolution> {
  try {
    const existing = await findPlaceIdByGoogleId(userId, tripId, googlePlaceId);
    if (existing) return { kind: "existing", placeId: existing };
    if ((await countPlaces(userId, tripId)) >= MAX_PLACES_PER_TRIP) {
      return { kind: "error", message: PLACE_LIMIT };
    }
  } catch {
    return { kind: "error", message: SAVE_FAILED };
  }
  const coords = await fetchPlaceCoords(googlePlaceId);
  if (!coords.ok) {
    return {
      kind: "error",
      message: coords.notFound ? PLACE_NOT_FOUND : SAVE_FAILED,
    };
  }
  return { kind: "new", coords: { lat: coords.lat, lng: coords.lng } };
}

// 쓰기 결과. placeLinked: 장소를 이으려 했는가(0행일 때 "장소를 다시 골라 주세요"로 돌려줄지 정한다).
type WriteOutcome =
  | { kind: "written" }
  | { kind: "missed"; placeLinked: boolean }
  | { kind: "error"; message: string };

// Google 장소가 있으면 기존 장소 경로 또는 장소+일정 한 문 쓰기로, 없으면 지금 쓰기로.
async function writeWithPlace(
  userId: string,
  tripId: string,
  input: ScheduleInput,
  write: (input: ScheduleInput) => Promise<boolean>,
  writeWithNewPlace: (
    input: ScheduleInput & { google: GooglePlacePick },
    coords: { lat: number; lng: number },
  ) => Promise<boolean>,
): Promise<WriteOutcome> {
  const { google } = input;
  let resolution: GoogleResolution | null = null;
  if (google) {
    resolution = await resolveGooglePlace(userId, tripId, google.googlePlaceId);
    if (resolution.kind === "error") return resolution;
  }
  let written: boolean;
  try {
    if (google && resolution?.kind === "new") {
      written = await writeWithNewPlace(
        { ...input, google },
        resolution.coords,
      );
    } else if (resolution?.kind === "existing") {
      written = await write({
        ...input,
        google: null,
        placeId: resolution.placeId,
      });
    } else {
      written = await write(input);
    }
  } catch {
    return { kind: "error", message: SAVE_FAILED };
  }
  if (written) return { kind: "written" };
  return {
    kind: "missed",
    placeLinked: google !== null || input.placeId !== null,
  };
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

  const outcome = await writeWithPlace(
    user.id,
    tripId,
    parsed.value,
    async (input) =>
      (await createScheduleItem(user.id, tripId, input)) !== null,
    async (input, coords) =>
      (await createScheduleItemWithNewPlace(user.id, tripId, input, coords)) !==
      null,
  );
  if (outcome.kind === "error") {
    return {
      values,
      errors: parsed.value.google ? { place: outcome.message } : {},
      formError: parsed.value.google ? null : outcome.message,
      savedAt: prev.savedAt,
    };
  }
  if (outcome.kind === "missed") {
    // 장소를 골랐는데 쓰기가 걸리지 않았고 여행은 여전히 보이면, 고른 장소가 그 사이 지워진 것이다
    // (Google 장소면 넣는 사이 다른 쪽에서 같은 장소가 들어온 경우 등).
    // 내 여행 안의 일이므로 notFound 대신 장소를 다시 고르게 한다. 여행이 안 보이면 지금처럼 찾을 수 없음.
    if (outcome.placeLinked && (await getTrip(user.id, tripId))) {
      revalidatePath(tripPath(tripId));
      return {
        values: { ...withoutGoogle(values), placeId: "" },
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

  const outcome = await writeWithPlace(
    user.id,
    tripId,
    parsed.value,
    (input) => updateScheduleItem(user.id, tripId, itemId, input),
    (input, coords) =>
      updateScheduleItemWithNewPlace(user.id, tripId, itemId, input, coords),
  );
  if (outcome.kind === "error") {
    return {
      values,
      errors: parsed.value.google ? { place: outcome.message } : {},
      formError: parsed.value.google ? null : outcome.message,
      savedAt: prev.savedAt,
    };
  }
  if (outcome.kind === "missed") {
    // 추가와 같다. 일정이 여전히 보이면 고른 장소가 그 사이 지워진 것이므로 장소를 다시 고르게 한다.
    // 글자 칸은 지금 일정의 장소 글자(이어졌던 장소의 이름표)로 채워 돌려준다.
    if (outcome.placeLinked) {
      const current = await getScheduleItem(user.id, tripId, itemId);
      if (current) {
        revalidatePath(tripPath(tripId));
        return {
          values: {
            ...withoutGoogle(values),
            placeId: "",
            place: current.place ?? "",
          },
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
