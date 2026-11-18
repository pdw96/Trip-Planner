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
