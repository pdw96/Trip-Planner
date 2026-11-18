import "server-only";
import { cacheLife } from "next/cache";
import {
  describeFailure,
  normalizeServiceKey,
  parseHolidayResponse,
} from "@/lib/holidays";

// 공휴일(한국천문연구원 특일 정보)을 연도별로 받아 하루 동안 재사용한다.
// 키 값은 캐시 키·로그·클라이언트 어디에도 넣지 않는다.

const ENDPOINT =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
const TIMEOUT_MS = 5000;

let warnedMissingKey = false;

// 실패하면 throw 한다. 빈 배열을 돌려주면 그 실패가 하루 동안 캐시되기 때문이다.
async function holidaysForYear(year: number): Promise<string[]> {
  "use cache";
  cacheLife("days");

  const key = normalizeServiceKey(process.env.DATA_GO_KR_SERVICE_KEY ?? "");
  if (!key) throw new Error("키 없음");
  const params = new URLSearchParams({
    serviceKey: key,
    solYear: String(year),
    numOfRows: "100",
    _type: "json",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.text();
  if (!res.ok) {
    // use cache 안에서 던진 메시지는 프로덕션에서 가려지므로 원인은 여기서 남긴다.
    console.warn(
      `[holidays] ${year}: ${describeFailure(res.status, body, key)}`,
    );
    throw new Error(`HTTP ${res.status}`);
  }
  try {
    return parseHolidayResponse(body);
  } catch (error) {
    console.warn(
      `[holidays] ${year}: 응답 형식 오류 ${describeFailure(res.status, body, key)}`,
    );
    throw error;
  }
}

// 절대 reject 하지 않는다. 실패한 해는 빠지고, 그 해는 달력에 일요일만 빨갛게 보인다.
export async function getHolidays(years: number[]): Promise<string[]> {
  if (!process.env.DATA_GO_KR_SERVICE_KEY) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("[holidays] DATA_GO_KR_SERVICE_KEY 없음: 공휴일 없이 표시");
    }
    return [];
  }
  const results = await Promise.allSettled(years.map(holidaysForYear));
  const dates: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      dates.push(...result.value);
    } else {
      const reason =
        result.reason instanceof Error ? result.reason.name : "unknown";
      const message =
        result.reason instanceof Error ? result.reason.message : "";
      console.warn(`[holidays] ${years[i]}: ${reason} ${message}`);
    }
  });
  return dates;
}
