// 장소 입력 검증과 종류 짐작. 서버(Server Action)와 장소 추가 폼에서 쓰고, node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 글자 수는 코드 포인트 기준이다. Google 장소 id 는 검색 결과에서 온 값만 받는다.

export const PLACE_CATEGORIES = [
  "lodging",
  "sight",
  "food",
  "cafe",
  "etc",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  lodging: "숙소",
  sight: "관광",
  food: "맛집",
  cafe: "카페",
  etc: "기타",
};

export type PlaceFields = {
  googlePlaceId: string;
  label: string;
  category: string;
  memo: string;
};

export type PlaceInput = {
  googlePlaceId: string;
  label: string;
  category: PlaceCategory;
  memo: string | null;
};

export type PlaceFieldErrors = Partial<Record<keyof PlaceFields, string>>;

// savedAt: 저장에 성공할 때마다 새 값(Date.now()). 클라이언트가 바뀐 것을 보고 입력칸을 비우거나 접는다.
export type PlaceFormState = {
  values: PlaceFields;
  errors: PlaceFieldErrors;
  formError: string | null;
  savedAt: number | null;
};

// schedule-input.ts 가 같은 값을 따로 둔다(시험이 같은지 확인한다).
export const PLACE_LABEL_MAX = 100;
const MEMO_MAX = 200;
export const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,300}$/;

// 종류 짐작 규칙. Google 의 place type 을 다섯 종류로 묶는다.
const FOOD_TYPES = new Set([
  "restaurant",
  "food",
  "meal_takeaway",
  "meal_delivery",
  "bar",
  "food_court",
]);
const CAFE_TYPES = new Set([
  "cafe",
  "coffee_shop",
  "bakery",
  "tea_house",
  "dessert_shop",
]);
const LODGING_TYPES = new Set([
  "lodging",
  "hotel",
  "motel",
  "hostel",
  "resort_hotel",
  "guest_house",
  "bed_and_breakfast",
  "inn",
]);
const SIGHT_TYPES = new Set([
  "tourist_attraction",
  "museum",
  "park",
  "art_gallery",
  "historical_landmark",
  "amusement_park",
  "zoo",
  "aquarium",
  "church",
  "hindu_temple",
  "buddhist_temple",
  "shrine",
  "point_of_interest",
  "natural_feature",
  "shopping_mall",
  "market",
]);

function length(value: string): number {
  return [...value].length;
}

function tooLong(value: string, max: number): string | undefined {
  return length(value) > max ? `${max}자 이하로 입력해 주세요.` : undefined;
}

function isPlaceCategory(value: string): value is PlaceCategory {
  return (PLACE_CATEGORIES as readonly string[]).includes(value);
}

export function isGooglePlaceId(value: string): boolean {
  return GOOGLE_PLACE_ID_PATTERN.test(value);
}

type SharedFields = {
  label: string;
  category: PlaceCategory;
  memo: string | null;
};

type SharedResult =
  | { ok: true; value: SharedFields }
  | { ok: false; errors: PlaceFieldErrors };

// 이름표·종류·메모 검증. 장소 추가와 고치기가 같이 쓴다.
function parseSharedFields(
  raw: Omit<PlaceFields, "googlePlaceId">,
): SharedResult {
  const label = raw.label.trim();
  const category = raw.category.trim();
  const memo = raw.memo.trim();

  const errors: PlaceFieldErrors = {};
  const labelError =
    label === "" ? "이름을 입력해 주세요." : tooLong(label, PLACE_LABEL_MAX);
  if (labelError) errors.label = labelError;
  if (!isPlaceCategory(category)) errors.category = "종류를 골라 주세요.";
  const memoError = tooLong(memo, MEMO_MAX);
  if (memoError) errors.memo = memoError;

  if (Object.keys(errors).length > 0 || !isPlaceCategory(category)) {
    return { ok: false, errors };
  }
  return { ok: true, value: { label, category, memo: memo || null } };
}

export type PlaceInputResult =
  | { ok: true; value: PlaceInput }
  | { ok: false; errors: PlaceFieldErrors };

export function parsePlaceInput(raw: PlaceFields): PlaceInputResult {
  const googlePlaceId = raw.googlePlaceId.trim();
  const shared = parseSharedFields(raw);

  const errors: PlaceFieldErrors = shared.ok ? {} : { ...shared.errors };
  if (!isGooglePlaceId(googlePlaceId)) {
    errors.googlePlaceId = "장소를 찾지 못했어요. 다시 검색해 주세요.";
  }

  if (Object.keys(errors).length > 0 || !shared.ok) {
    return { ok: false, errors };
  }
  return { ok: true, value: { googlePlaceId, ...shared.value } };
}

export type PlaceEditResult =
  | { ok: true; value: Omit<PlaceInput, "googlePlaceId"> }
  | { ok: false; errors: PlaceFieldErrors };

export function parsePlaceEdit(
  raw: Omit<PlaceFields, "googlePlaceId">,
): PlaceEditResult {
  const shared = parseSharedFields(raw);
  if (!shared.ok) return { ok: false, errors: shared.errors };
  return { ok: true, value: shared.value };
}

// primaryType 을 먼저 보고, 없거나 안 맞으면 types 를 앞에서부터 본다. 맞는 것이 없으면 기타.
export function guessCategory(
  primaryType: string | null,
  types: string[],
): PlaceCategory {
  const candidates = primaryType === null ? types : [primaryType, ...types];
  for (const type of candidates) {
    const category = categoryOfType(type);
    if (category) return category;
  }
  return "etc";
}

function categoryOfType(type: string): PlaceCategory | null {
  if (type.endsWith("_restaurant") || FOOD_TYPES.has(type)) {
    return "food";
  }
  if (CAFE_TYPES.has(type)) return "cafe";
  if (LODGING_TYPES.has(type)) return "lodging";
  if (SIGHT_TYPES.has(type)) return "sight";
  return null;
}
