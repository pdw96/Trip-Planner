"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  countPlaces,
  createPlace,
  deletePlace,
  MAX_PLACES_PER_TRIP,
  updatePlace,
} from "@/db/queries/places";
import { setTripBase } from "@/db/queries/trip-bases";
import { getTrip } from "@/db/queries/trips";
import { fetchPlaceCoords } from "@/lib/google-maps-server";
import { isUuid } from "@/lib/ids";
import {
  type PlaceFields,
  type PlaceFormState,
  parsePlaceEdit,
  parsePlaceInput,
} from "@/lib/place-input";
import { getCurrentUser } from "@/lib/session";
import { isValidIsoDate } from "@/lib/trip-input";
import {
  PLACE_DUPLICATE,
  PLACE_LIMIT,
  PLACE_NOT_FOUND,
  SAVE_FAILED,
} from "./messages";

// tripId·placeId·date 는 bind 나 인자로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 여행 접근 조건(userId 범위), 장소·여행을 함께 묶는 조건, 날짜 검사가 막는다.
// 좌표는 클라이언트에게서 받지 않고, 서버가 검증한 Google 장소 id 로 Google 에서 받는다.

// "use server" 파일은 상수를 내보낼 수 없으므로 안에서만 쓴다.
const EMPTY_PLACE_FIELDS: PlaceFields = {
  googlePlaceId: "",
  label: "",
  category: "",
  memo: "",
};

// FormData 를 통째로 넘기지 않고 필요한 필드만 문자열로 꺼낸다.
function readPlaceFields(formData: FormData): PlaceFields {
  const field = (name: keyof PlaceFields) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    googlePlaceId: field("googlePlaceId"),
    label: field("label"),
    category: field("category"),
    memo: field("memo"),
  };
}

function tripPath(tripId: string): string {
  return `/trips/${tripId}`;
}

export async function createPlaceAction(
  tripId: string,
  prev: PlaceFormState,
  formData: FormData,
): Promise<PlaceFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const values = readPlaceFields(formData);
  const parsed = parsePlaceInput(values);
  if (!parsed.ok) {
    return {
      values,
      errors: parsed.errors,
      formError: null,
      savedAt: prev.savedAt,
    };
  }
  const failed = (formError: string): PlaceFormState => ({
    values,
    errors: {},
    formError,
    savedAt: prev.savedAt,
  });

  // 남의 여행에 대해 Google 을 부르지 않도록 여행 접근을 먼저 확인한다.
  const trip = await getTrip(user.id, tripId);
  if (!trip) notFound();

  // 장소 수 상한도 Google 을 부르기 전에 확인한다(호출 비용 상한). 동시에 넣으면 몇 개 넘을 수 있지만
  // 목적은 끝없는 호출을 막는 것이라 그 정도는 받아들인다.
  let placeCount: number;
  try {
    placeCount = await countPlaces(user.id, trip.id);
  } catch {
    return failed(SAVE_FAILED);
  }
  if (placeCount >= MAX_PLACES_PER_TRIP) return failed(PLACE_LIMIT);

  const coords = await fetchPlaceCoords(parsed.value.googlePlaceId);
  if (!coords.ok) {
    return failed(coords.notFound ? PLACE_NOT_FOUND : SAVE_FAILED);
  }

  let created: Awaited<ReturnType<typeof createPlace>>;
  try {
    created = await createPlace(user.id, trip.id, parsed.value, {
      lat: coords.lat,
      lng: coords.lng,
    });
  } catch {
    return failed(SAVE_FAILED);
  }
  if (!created.ok) {
    if (created.reason === "duplicate") return failed(PLACE_DUPLICATE);
    notFound();
  }

  revalidatePath(tripPath(tripId));
  return {
    values: EMPTY_PLACE_FIELDS,
    errors: {},
    formError: null,
    savedAt: Date.now(),
  };
}

export async function updatePlaceAction(
  tripId: string,
  placeId: string,
  prev: PlaceFormState,
  formData: FormData,
): Promise<PlaceFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  // Google 장소 id 는 고치지 않는다(읽은 값은 폼 상태로 되돌려 줄 뿐 쓰지 않는다).
  const values = readPlaceFields(formData);
  const parsed = parsePlaceEdit(values);
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
    updated = await updatePlace(user.id, tripId, placeId, parsed.value);
  } catch {
    return {
      values,
      errors: {},
      formError: SAVE_FAILED,
      savedAt: prev.savedAt,
    };
  }
  if (!updated) notFound();

  revalidatePath(tripPath(tripId));
  return { values, errors: {}, formError: null, savedAt: Date.now() };
}

export async function deletePlaceAction(
  tripId: string,
  placeId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!(await deletePlace(user.id, tripId, placeId))) notFound();

  revalidatePath(tripPath(tripId));
}

// 화면에서 바로 부르는 선택이라, 대상 없음과 저장 실패를 똑같이 { ok: false } 로 돌려준다
// (#12 완료 체크와 같은 이유: 반응이 같으므로 남의 여행·장소가 있는지 드러나지 않는다).
// 기준점은 "그날 밤 숙소"다(#91). placeId 가 null 이면 "이날 밤부터 숙소 없음" 행을 둔다.
// 마지막 날(당일치기의 그날 포함)은 밤이 없어 동선에 쓰이지 않으므로 받지 않는다(화면도 고르기 칸을 숨김).
export async function setTripBaseAction(
  tripId: string,
  date: string,
  placeId: string | null,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (typeof date !== "string" || !isValidIsoDate(date)) return { ok: false };
  if (placeId !== null && (typeof placeId !== "string" || !isUuid(placeId))) {
    return { ok: false };
  }

  try {
    const trip = await getTrip(user.id, tripId);
    if (!trip || date < trip.startDate || date >= trip.endDate) {
      return { ok: false };
    }
    if (!(await setTripBase(user.id, trip.id, date, placeId))) {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  revalidatePath(tripPath(tripId));
  return { ok: true };
}
