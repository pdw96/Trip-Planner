---
name: new-route
description: 이 프로젝트에서 로그인 사용자 전용 App Router 페이지(목록·상세·편집 화면)를 만들 때 따르는 패턴. src/app 아래에 page.tsx 를 새로 만들거나, 사용자 소유 데이터를 읽어 보여 주는 화면을 구현할 때 사용한다.
argument-hint: "[라우트, 예: /trips/[id]]"
---

# new-route

만들 라우트: $ARGUMENTS

읽기와 렌더링 쪽 패턴이다. 데이터 변경은 `server-action` 스킬을 따른다.

## 먼저 읽을 문서

Next.js 16 이고 `cacheComponents` 와 `partialPrefetching` 이 켜져 있다. 코드를 쓰기 전에 다음을 읽는다.

- `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` — 세션을 읽는 컴포넌트의 위치, 세션에서 파생된 데이터 캐시
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, `dynamic-routes.md` — `params` · `searchParams` 와 `PageProps` 타입
- `loading.tsx` · `error.tsx` · `not-found.tsx` 를 만들 때는 같은 폴더의 해당 문서

## 위치

- 페이지: `src/app/<경로>/page.tsx`. Server Component 다.
- 읽기 쿼리: `src/db/queries/<테이블>.ts`. 맨 위에 `import "server-only"`. `@neondatabase/serverless` 나 `db` 를 `src/app` 에서 직접 쓰지 않는다.
- 상호작용이 필요한 말단만 같은 폴더의 별도 파일로 떼어 `'use client'` 를 붙인다.

## 규칙

1. **요청 데이터는 `<Suspense>` 안에서만 await 한다.** `getCurrentUser()`, `params`, `searchParams` 는 모두 요청 시점 데이터다. 페이지 함수 자체는 async 로 만들지 않고, 정적인 부분(제목, 레이아웃)과 `<Suspense>` 만 렌더한다. `params` 는 await 하지 않은 Promise 그대로 자식에게 넘긴다. 레이아웃의 최상위에서도 세션을 읽지 않는다. 경계 밖에서 요청 데이터를 읽으면 빌드 오류이고, 경계가 위에 있을수록 정적 셸이 작아진다.
2. **타입은 `PageProps<"/경로">`.** 전역 타입이고 `npm run typecheck` 가 `next typegen` 으로 생성한다. 자식 props 는 `PageProps<"/경로">["params"]` 로 적는다.
3. **인증.** 자식 컴포넌트 첫 줄에서 `getCurrentUser()` 를 부르고, `null` 이면 `redirect("/")` 한다. 로그인 화면이 홈이다. `unauthorized()` / `forbidden()` 은 `experimental.authInterrupts` 가 필요한데 켜져 있지 않으므로 쓰지 않는다.
4. **소유권으로 범위를 좁힌 조회.** 쿼리 함수는 첫 인자로 `userId` 를 받고, `where` 에 항상 `eq(<테이블>.userId, userId)` 를 넣는다. 호출부는 `user.id` 만 넘긴다. 결과가 없으면 `notFound()`. 남의 것과 없는 것을 구분하지 않는다.
5. **id 형식 검증.** `trips.id` 같은 uuid 컬럼에 형식이 틀린 문자열을 넘기면 Postgres 가 오류를 던져 500 이 된다. 쿼리 함수에서 먼저 확인하고 `null` 을 돌려준다.
6. **필요한 컬럼만.** `select({ ... })` 로 화면에 쓰는 필드만 고른다. Client Component 에 넘길 때도 그 필드만 넘긴다.
7. **캐시는 기본으로 쓰지 않는다.** 위 패턴이면 `<Suspense>` 안에서 요청마다 읽는다. 캐시가 필요해지면 문서의 "Step 4" 패턴을 따른다. `'use cache'` 함수는 export 하지 않고 `userId` 를 인자로 받으며, `cacheTag(\`<테이블>:${userId}\`)` 를 단다. 데이터를 바꾸는 Server Action 은 같은 태그로 `updateTag` 한다. 이메일 같은 개인 정보는 캐시 키나 태그에 넣지 않는다.
8. **쓰지 않는 세그먼트 설정.** `export const dynamic`, `revalidate`, `fetchCache`, `dynamicParams`, `runtime` 은 `cacheComponents` 에서 제거됐거나 지원되지 않는다.
9. **`error.tsx`** 는 `'use client'` 이고 props 는 `{ error: unknown; retry: () => void }` 다. 복구 버튼은 `reset` 이 아니라 `retry()` 를 부른다.
10. **목록에서 상세로 가는 링크.** 이동을 즉시 보여 줘야 하는 링크에만 `<Link prefetch={true}>` 를 단다. 링크마다 서버 호출이 한 번씩 생기므로 긴 목록 전체에 달지 않는다.

## 템플릿

`/trips/[id]` 기준이다. 이 프로젝트에서 lint · typecheck · build 를 통과한 형태다.

```ts
// src/db/queries/trips.ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trips } from "@/db/schema";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTripForUser(userId: string, tripId: string) {
  if (!UUID.test(tripId)) return null;
  const [trip] = await db
    .select({
      id: trips.id,
      title: trips.title,
      destination: trips.destination,
      startDate: trips.startDate,
      endDate: trips.endDate,
    })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);
  return trip ?? null;
}
```

```tsx
// src/app/trips/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getTripForUser } from "@/db/queries/trips";
import { getCurrentUser } from "@/lib/session";

export default function TripPage({ params }: PageProps<"/trips/[id]">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Suspense fallback={<p className="text-zinc-500">불러오는 중…</p>}>
        <TripDetail params={params} />
      </Suspense>
    </main>
  );
}

async function TripDetail({
  params,
}: {
  params: PageProps<"/trips/[id]">["params"];
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { id } = await params;
  const trip = await getTripForUser(user.id, id);
  if (!trip) notFound();

  return (
    <article className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{trip.title}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        {trip.destination} · {trip.startDate} ~ {trip.endDate}
      </p>
    </article>
  );
}
```

목록 페이지도 같다. 다만 `params` 가 없으니 자식은 `getCurrentUser()` 로 시작하고, 쿼리는 `where(eq(trips.userId, userId))` 와 정렬만 둔다.

## 끝내기 전에

- `npm run lint` 와 `npm run typecheck` 를 통과시킨다. `npm run build` 출력에서 새 라우트가 `◐` (Partial Prerender) 로 나오는지 본다. 빌드가 요청 데이터를 경계 밖에서 읽는다고 실패하면 규칙 1 을 다시 본다.
- `authz-reviewer` 로 쿼리의 소유권 범위를, `next16-api-reviewer` 로 API 사용을 검토한다.
- `verify-ui` 절차로 로그인 상태, 로그아웃 상태, 남의 id 나 형식이 틀린 id 로 접근했을 때(404)를 확인한다.
