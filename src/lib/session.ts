import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  image: string | null;
};

// 요청당 한 번만 세션을 읽습니다. 요청 데이터를 읽으므로 호출하는 컴포넌트는 <Suspense> 안에 있어야 합니다.
// 클라이언트로 넘길 수 있도록 필요한 필드만 돌려줍니다.
// connection(): 링크 미리 불러오기(prefetch)의 미리 그리기에서는 여기서 멈추고 실제 요청에서만 DB 를 조회합니다.
// 미리 그리기가 끝나며 진행 중인 쿼리를 끊으면 Better Auth 가 세션 토큰이 담긴 오류 로그를 남기기 때문입니다 (#21).
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, image } = session.user;
  return { id, name, image: image ?? null };
});
