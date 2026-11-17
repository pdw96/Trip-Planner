import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  image: string | null;
};

// 요청당 한 번만 세션을 읽습니다. 요청 데이터를 읽으므로 호출하는 컴포넌트는 <Suspense> 안에 있어야 합니다.
// 클라이언트로 넘길 수 있도록 필요한 필드만 돌려줍니다.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, image } = session.user;
  return { id, name, image: image ?? null };
});
