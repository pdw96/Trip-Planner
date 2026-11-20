import "server-only";
import { cacheLife } from "next/cache";
import { frankfurterUrl, parseFrankfurterRate } from "@/lib/fx";

// 결제일 기준환율(Frankfurter, 유럽중앙은행)을 받는다(#14 설계 §5.4). 키가 필요 없다.
// 지난 날짜의 환율은 바뀌지 않으므로 오래 캐시한다. 실패는 캐시하지 않도록 안쪽 함수는 throw 한다.

const TIMEOUT_MS = 5000;

async function ecbRate(
  date: string,
  from: string,
  to: string,
): Promise<{ rate: string; rateDate: string }> {
  "use cache";
  cacheLife("max");

  const res = await fetch(frankfurterUrl(date, from, to), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // use cache 안에서 던진 메시지는 프로덕션에서 가려지므로 원인은 여기서 남긴다.
    console.warn(`[fx] ${date} ${from}→${to}: HTTP ${res.status}`);
    throw new Error(`HTTP ${res.status}`);
  }
  const parsed = parseFrankfurterRate(await res.json(), to);
  if (!parsed) {
    console.warn(`[fx] ${date} ${from}→${to}: 응답 형식 오류`);
    throw new Error("응답 형식 오류");
  }
  return parsed;
}

// 절대 reject 하지 않는다. 실패하면 null(부르는 쪽이 예정 환율로 저장한다).
export async function getEcbRate(
  date: string,
  from: string,
  to: string,
): Promise<{ rate: string; rateDate: string } | null> {
  try {
    return await ecbRate(date, from, to);
  } catch (error) {
    if (!(error instanceof Error && /^HTTP|응답/.test(error.message))) {
      console.warn(`[fx] ${date} ${from}→${to}: 받지 못함`);
    }
    return null;
  }
}
