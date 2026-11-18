// 공공데이터포털 "한국천문연구원_특일 정보" getRestDeInfo 응답(JSON) 파싱. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 응답 예: {"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[{"isHoliday":"Y","locdate":20260101}]}}}}
// item 은 하나면 객체, 없으면 items 가 "" 로 온다.

export class HolidayResponseError extends Error {}

type RawItem = { isHoliday?: unknown; locdate?: unknown };

function toDate(locdate: unknown): string {
  const text = String(locdate);
  if (!/^\d{8}$/.test(text)) {
    throw new HolidayResponseError(`locdate 형식이 다름: ${text}`);
  }
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

// 공휴일 날짜("YYYY-MM-DD")를 오름차순·중복 없이 돌려준다. 예상과 다른 응답이면 HolidayResponseError.
export function parseHolidayResponse(text: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HolidayResponseError("JSON 이 아님");
  }
  const response = (json as { response?: Record<string, unknown> })?.response;
  const header = response?.header as { resultCode?: unknown } | undefined;
  if (header?.resultCode !== "00") {
    throw new HolidayResponseError(`resultCode: ${String(header?.resultCode)}`);
  }
  const items = (response?.body as { items?: unknown } | undefined)?.items;
  if (items === "" || items === undefined || items === null) return [];
  if (typeof items !== "object") {
    throw new HolidayResponseError("items 형식이 다름");
  }
  const raw = (items as { item?: unknown }).item;
  const list: RawItem[] = Array.isArray(raw)
    ? raw
    : raw
      ? [raw as RawItem]
      : [];

  const dates = new Set<string>();
  for (const entry of list) {
    if (entry.isHoliday === "Y") dates.add(toDate(entry.locdate));
  }
  return [...dates].sort();
}

// 포털은 같은 키를 Encoding(%2B 등)·Decoding 두 형태로 준다. 어느 쪽을 넣어도 원래 키로 맞춘다.
// (호출할 때 URLSearchParams 가 다시 인코딩하므로, Encoding 키를 그대로 쓰면 이중 인코딩된다.)
export function normalizeServiceKey(key: string): string {
  const trimmed = key.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(trimmed)) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

// 실패 응답을 로그 한 줄로 만든다. 키(원래·인코딩 형태)는 가리고 본문은 앞부분만 남긴다.
export function describeFailure(
  status: number,
  body: string,
  key: string,
): string {
  let text = body.replace(/\s+/g, " ").trim();
  for (const secret of [key, encodeURIComponent(key)]) {
    if (secret) text = text.split(secret).join("***");
  }
  return `HTTP ${status} ${text.slice(0, 200)}`.trim();
}
