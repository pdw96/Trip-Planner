import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { type DayRouteResult, loadDayRoute } from "../../day-route-loader";

// N일차 탭의 구간 이동 정보(§5.3). GET /trips/<id>/day-route?date=YYYY-MM-DD
// Server Action 이 아니라 Route Handler 인 까닭: Server Action 은 클라이언트에서 하나씩 차례로 보내지므로
// Google 을 기다리는 동안 저장(완료 체크·기준점·일정)이 뒤에서 기다린다(브라우저 확인 #39).
// 인자는 경로의 여행 id 와 날짜뿐이다(§5.7). 구간은 서버가 이 사용자의 여행 장소로만 만든다.
// 캐시하지 않는다: getCurrentUser() 가 connection()·headers() 를 읽으므로 Cache Components 에서도
// 요청 때마다 실행되고(미리 그리지 않음), 응답에는 Cache-Control: no-store 를 붙인다.
// 상태 코드: 비로그인 401, 찾을 수 없음(형식 틀림·없음·남의 것 모두 같게) 404, DB·그 밖의 오류 500.
// 본문은 성공이면 DayRouteResult, 아니면 { ok: false } 뿐이다(자세한 사정은 내보내지 않는다).

const FAILED: DayRouteResult = { ok: false };

function json(body: DayRouteResult, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return json(FAILED, 401);

    const { id } = await params;
    const date = request.nextUrl.searchParams.get("date");
    if (date === null) return json(FAILED, 404);

    const result = await loadDayRoute(user.id, id, date);
    if (result === null) return json(FAILED, 404);
    return json(result, result.ok ? 200 : 500);
  } catch (error) {
    // 오류 내용(쿼리·주소 등)은 응답에도 로그에도 남기지 않는다.
    console.error(
      "[routes] 하루 동선 요청 실패:",
      error instanceof Error ? error.name : "unknown",
    );
    return json(FAILED, 500);
  }
}
