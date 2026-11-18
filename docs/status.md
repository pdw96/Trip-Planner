# 지금 상태

2026-11-18 기준. 이슈 하나가 끝날 때마다(PR 머지, 배포 확인) 고친다. 새 세션은 이 파일부터 읽는다(`CLAUDE.md` '작업 흐름').

## 끝나서 배포된 것

| 이슈 | PR | 내용 |
|---|---|---|
| — | #8–#10 | 작업 흐름: `human-gate`, `.claude` 정리, `CLAUDE.md` 작업 흐름 |
| #11 | #16 | 여행 목록·만들기·자세히 보기·고치기·삭제. 설계 `docs/superpowers/specs/2026-11-18-trips-crud-design.md` |
| #17 | #18 | 숙소 예약형 날짜 범위 달력, 일요일·공휴일 빨강(공공데이터포털 특일 정보). 설계 `docs/superpowers/specs/2026-11-18-trip-date-range-picker-design.md` |
| #19 | #20 | 공휴일 API 403: 포털 "일반 인증키"가 이미 인코딩돼 있어 이중 인코딩됨. 키를 정규화하고 실패 응답을 로그로 남김 |
| #21 | #25 | 링크 미리 불러오기(런타임 prerender)가 세션 쿼리를 끊어 Better Auth 가 토큰이 담긴 ERROR 로그를 남김. `getCurrentUser()` 에 `connection()` |
| #12 | #27 | 여행별 날짜 일정표(`schedule_items`, 마이그레이션 0002). 시각·제목·장소(글자, Google 지도 검색 새 탭)·메모·완료, 그 자리 추가·고치기, 여행 기간 밖 일정 따로 모음. 설계 `docs/superpowers/specs/2026-11-18-trip-schedule-design.md` |

## 다음 할 일

사용자가 열린 이슈에서 고른다. 추천은 #13 (사용자가 #12 설계 때 지도 연동·동선을 원했고, #13 에서 장소 목록과 함께 설계하기로 했다).

- 기능: #13 가 볼 장소·맛집, #14 예산·지출, #15 지인과 공유
- 개선: #22 단위 시험을 CI 에서, #23 달력 키보드 이동, #24 자잘한 개선 모음

#13·#14 는 새 테이블이 필요해 마이그레이션 PR 규칙을 따른다. 여행 접근 조건은 `src/db/queries/trips.ts` 의 `accessibleTrips(userId)` 하나다(#15 공유가 그 조건만 바꾸도록). 하위 데이터 쿼리는 `schedule-items.ts` 처럼 이 조건을 같은 SQL 문 안에 넣는다(일정 id 와 여행 id 를 함께 묶어 섞어 보내기를 막는다).

#13 메모: 지도 API(카카오·네이버·구글) 선택·키·좌표 저장, 그리고 일정(`schedule_items`)이 장소를 고를 수 있게 잇기(`place_id` 같은 null 허용 열, 비파괴). 지금 일정의 장소는 글자(`place`)다.

## 알아 둘 것

- **로그인한 화면의 브라우저 확인**: 클라우드 세션에는 Google 로그인용 키가 없고 `DATABASE_URL` 은 프로덕션 DB 다. 사용자 승인을 받아 임시 테스트 계정(`user`·`session` 행, id 접두어 `e2e-test-`, 이메일 `@example.invalid`)을 넣고, 끝나면 지운다(넣기·지우기 전 SQL 전문을 보이고 각각 확인). 쿠키:
  - `npm run dev`: 이름 `better-auth.session_token`, 값 `encodeURIComponent(token + "." + base64(HMAC-SHA256("better-auth-secret-12345678901234567890", token)))`
  - production 빌드(`next build` + `next start`, 로컬 전용 `BETTER_AUTH_SECRET` 지정): 이름 앞에 `__Secure-`, 그 시크릿으로 서명
  - 테스트 서버를 다시 띄울 때는 이전 `next-server` 가 포트를 쥐고 있지 않은지 먼저 확인한다(#21 에서 고치기 전 빌드를 다시 시험할 뻔했다)
- **Next 16 Activity**: 지나온 화면을 `display:none` 으로 보관한다. Playwright 는 보이는 `main` 만 읽고(`main:visible`), 양식은 화면을 떠날 때 초기화한다(`trip-form.tsx`).
- **단위 시험**: `node --test 'src/**/*.test.mjs'` — 아직 CI 에서 돌지 않는다(#22). 순수 모듈(`src/lib/*.ts` 중 시험 대상)은 다른 모듈을 import 하지 않는다.
- **소유권 브라우저 확인(#12)**: Playwright `page.route` 로 A 화면에서 나가는 Server Action 요청(헤더 `next-action`)의 본문 속 id 를 B 의 것으로 바꿔 보내고, 실패 반응과 DB 에서 B 의 행이 그대로인지 본다. Neon MCP 는 읽기 전용이라 테스트 행 넣기·지우기는 `DATABASE_URL` 로 `@neondatabase/serverless` 를 쓰는 node 스크립트로 한다.
- **Playwright 와 Suspense**: 페이지 이동 직후에는 스트리밍이 덜 끝났을 수 있다. 읽기 전에 마지막 요소(예: 마지막 날 칸)를 `waitFor` 한다.
- **그 자리 입력칸 닫기**: 저장하면 줄이 다른 자리로 옮겨 갈 수 있다(일정 날짜 옮기기). 닫기는 양식의 effect 가 아니라 저장 action 안에서(같은 전환), 그리고 그 입력칸이 아직 열려 있을 때만 한다(`schedule-editor.tsx`).
- **Vercel 무료 한도**: 계정 전체(job-hunter·erp 포함) 하루 배포 100회(`api-deployments-free-per-day`). 걸리면 상태가 실패로 뜨고 24시간 뒤 풀린다. 코드 문제가 아니다. `vercel.json`(#29)이 작업 브랜치(`claude/*`, `ccr-*`) 미리보기를 끄고, 문서·`.claude`·`.github`·`*.test.mjs` 만 바뀐 커밋은 빌드를 건너뛴다. 그래서 PR 에는 Vercel 미리보기 링크·상태가 없고, `next build` 는 CI `check` 가 가짜 환경 변수로 확인한다.
- **공휴일**: Vercel 환경 변수 `DATA_GO_KR_SERVICE_KEY`(Production·Preview). 이 세션에서는 `apis.data.go.kr` 접속이 막혀 있다. 실패하면 Vercel 로그에 `[holidays]` 한 줄(키는 가림)이 남는다.

## 남은 확인

- 공휴일 캐시가 서버 인스턴스마다 따로다(#24 의 2번). 연말에 2029년 공휴일이 공개되면 달력 범위가 넓어져도 잘 받는지 본다.
- 여행 기간 상한이 없다. 수천 일짜리 여행은 일정 날짜 칸을 모두 그린다(#27 남은 지적). 상한을 둘지는 사용자 결정 — #24 에 넣을지 물어볼 것.
- 일정 화면을 실제 Google 로그인으로 프로덕션에서 한 번 써 본다(브라우저 확인은 로컬 dev + 테스트 계정으로만 했다).
