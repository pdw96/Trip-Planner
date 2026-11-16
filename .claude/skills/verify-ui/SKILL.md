---
name: verify-ui
description: UI 변경을 실제 브라우저에서 확인하는 절차. 페이지·컴포넌트·스타일·Server Action 을 고친 뒤 "화면에서 확인해 줘", "잘 뜨는지 봐 줘" 같은 요청이 있거나, UI 작업을 끝냈다고 보고하기 전에 사용한다.
argument-hint: "[확인할 라우트, 예: /trips/new]"
---

# verify-ui

확인 대상: $ARGUMENTS (비어 있으면 이번 변경이 영향을 준 라우트를 diff 에서 고른다)

이 프로젝트에는 테스트가 없다. UI 변경은 dev 서버와 브라우저로 직접 확인한다.

## 1. dev 서버

- 이미 떠 있으면 그대로 쓴다. 없으면 `npm run dev` 를 백그라운드로 띄운다.
- 포트는 서버 출력에서 읽는다. 3000 이 쓰이고 있으면 다른 포트로 뜬다.
- `DATABASE_URL is not set` 으로 죽으면 `.env.local` 이 없는 것이다. 시크릿 파일은 읽거나 만들지 말고 사용자에게 알린다.

## 2. 브라우저 확인 (playwright MCP)

각 대상 라우트에 대해:

1. `browser_navigate` 로 연다.
2. `browser_snapshot` 으로 바뀐 요소가 실제로 렌더됐는지 확인한다.
3. 변경이 상호작용(폼, 버튼, Server Action)이면 그 동작을 실제로 수행하고 결과 화면을 다시 스냅샷한다.
4. `browser_console_messages` 로 에러와 hydration 경고를 확인한다.
5. 레이아웃·스타일 변경이면 `browser_resize` 로 모바일 폭(390px)에서도 한 번 본다.

## 3. Next.js 쪽 오류 (next-devtools MCP)

`nextjs_index` 로 실행 중인 dev 서버를 찾고, `nextjs_call` 로 빌드·런타임 오류를 조회한다. 브라우저에는 안 보이는 서버 컴포넌트 오류가 여기서 잡힌다.

## 4. 보고

- 확인한 라우트와 수행한 동작
- 통과한 것과 실패한 것. 실패는 콘솔·서버 오류 원문과 함께 적는다.
- 확인하지 못한 것과 그 이유 (예: DB 연결이 없어 저장 동작은 미확인)

스크린샷은 사용자가 요청했거나 시각적 차이를 보여 줘야 할 때만 `browser_take_screenshot` 으로 찍는다. 직접 띄운 dev 서버는 끝나면 종료한다.
