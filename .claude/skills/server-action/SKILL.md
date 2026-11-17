---
name: server-action
description: 이 프로젝트에서 Server Action 을 만들거나 고칠 때 따르는 패턴. 폼 제출, 데이터 생성·수정·삭제, 'use server' 파일을 구현할 때 사용한다.
user-invocable: false
---

# server-action

데이터 변경은 전부 Server Action 으로 한다. 모든 액션은 아래 순서를 지킨다.

## 먼저 읽을 문서

Next.js 16 이고 `cacheComponents` 가 켜져 있다. 코드를 쓰기 전에 다음을 읽는다.

- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` — 보안 모델, 액션 응답과 재렌더
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`, `refresh.md`, `revalidateTag.md` — 무효화 방법을 고를 때

## 위치

- 라우트 전용 액션은 그 라우트 폴더의 `actions.ts` 에 둔다 (예: `src/app/trips/actions.ts`). 파일 맨 위에 `'use server'`.
- DB 는 `@/db` 에서 `db` 를, 테이블은 `@/db/schema` 에서 가져온다.

## 순서

1. **인증.** 첫 줄에서 `getCurrentUser()` (`@/lib/session`) 를 호출한다. `null` 이면 아무것도 하지 않고 끝낸다. 폼을 로그인한 화면에만 렌더하는 것은 보호가 아니다. 액션은 UI 없이도 호출된다.
2. **입력 검증.** `FormData` 에서 필요한 필드만 하나씩 꺼내 타입과 값을 확인한다. `FormData` 나 객체를 통째로 `values()` / `set()` 에 넘기지 않는다. 검증 라이브러리는 설치돼 있지 않으니 직접 확인하고, 필요해지면 추가하기 전에 사용자에게 묻는다.
   - `trips` 는 `end_date >= start_date` CHECK 제약이 있다. DB 오류로 터지기 전에 액션에서 먼저 확인한다.
3. **소유권으로 범위를 좁힌 DB 호출.**
   - `insert`: `userId` 는 항상 세션의 `user.id`. 클라이언트가 보낸 값은 쓰지 않는다.
   - `update` / `delete`: `where(and(eq(trips.id, id), eq(trips.userId, user.id)))`. `id` 만으로 고르지 않는다. `.returning({ id: trips.id })` 로 실제로 바뀐 행이 있는지 확인하고, 없으면 "찾을 수 없음"으로 처리한다.
4. **무효화.** 문서를 확인한 뒤 고른다.
   - 방금 바꾼 것을 사용자가 바로 봐야 하고 읽는 쪽이 `cacheTag` 로 태그돼 있으면 `updateTag(tag)`.
   - 읽는 쪽이 캐시되지 않은 동적 데이터면 `refresh()`.
   - 다른 화면으로 보낼 때는 무효화 뒤에 `redirect()`. `redirect` 는 예외를 던지므로 `try` 블록 밖에서 호출한다.
5. **결과 반환.** 폼에서 쓰는 액션은 `useActionState` 에 맞춰 `(prevState, formData)` 시그니처로 만들고, 사용자가 고칠 수 있는 실패는 던지지 않고 값으로 돌려준다.

```ts
export type ActionState = { error: string } | null;
```

   - 오류 문구는 한국어로, 사용자가 무엇을 고쳐야 하는지 적는다.
   - DB 오류 원문, 스택, 다른 사용자의 데이터 존재 여부는 돌려주지 않는다. 남의 것이든 없는 것이든 똑같이 "찾을 수 없음"이다.
   - 반환값은 직렬화 가능한 최소한만. DB 행 전체를 돌려주지 않는다.

## 호출하는 쪽

- 폼은 `<form action={...}>` 으로 연결한다. 대기 상태나 오류 표시가 필요할 때만 그 폼을 `'use client'` 말단 컴포넌트로 분리한다.
- 페이지와 레이아웃은 Server Component 로 둔다.

## 끝내기 전에

- `npm run lint` 와 `npm run typecheck` 를 통과시킨다.
- `authz-reviewer` 에이전트로 새 액션을 검토한다.
- 화면이 바뀌었으면 `verify-ui` 절차로 실제 동작을 확인한다.
