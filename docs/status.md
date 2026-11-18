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

## 다음 할 일

사용자가 열린 이슈에서 고른다. 추천은 #12.

- 기능: #12 날짜별 일정표, #13 가 볼 장소·맛집, #14 예산·지출, #15 지인과 공유
- 개선: #22 단위 시험을 CI 에서, #23 달력 키보드 이동, #24 자잘한 개선 모음

#12·#13·#14 는 새 테이블이 필요해 마이그레이션 PR 규칙을 따른다. 모든 하위 데이터는 `src/db/queries/trips.ts` 의 `getTrip(userId, tripId)` 로 여행 접근을 확인한다(#15 공유가 그 조건만 바꾸도록).

## 알아 둘 것

- **로그인한 화면의 브라우저 확인**: 클라우드 세션에는 Google 로그인용 키가 없고 `DATABASE_URL` 은 프로덕션 DB 다. 사용자 승인을 받아 임시 테스트 계정(`user`·`session` 행, id 접두어 `e2e-test-`, 이메일 `@example.invalid`)을 넣고, 끝나면 지운다(넣기·지우기 전 SQL 전문을 보이고 각각 확인). 쿠키:
  - `npm run dev`: 이름 `better-auth.session_token`, 값 `encodeURIComponent(token + "." + base64(HMAC-SHA256("better-auth-secret-12345678901234567890", token)))`
  - production 빌드(`next build` + `next start`, 로컬 전용 `BETTER_AUTH_SECRET` 지정): 이름 앞에 `__Secure-`, 그 시크릿으로 서명
  - 테스트 서버를 다시 띄울 때는 이전 `next-server` 가 포트를 쥐고 있지 않은지 먼저 확인한다(#21 에서 고치기 전 빌드를 다시 시험할 뻔했다)
- **Next 16 Activity**: 지나온 화면을 `display:none` 으로 보관한다. Playwright 는 보이는 `main` 만 읽고(`main:visible`), 양식은 화면을 떠날 때 초기화한다(`trip-form.tsx`).
- **단위 시험**: `node --test 'src/**/*.test.mjs'` — 아직 CI 에서 돌지 않는다(#22). 순수 모듈(`src/lib/*.ts` 중 시험 대상)은 다른 모듈을 import 하지 않는다.
- **공휴일**: Vercel 환경 변수 `DATA_GO_KR_SERVICE_KEY`(Production·Preview). 이 세션에서는 `apis.data.go.kr` 접속이 막혀 있다. 실패하면 Vercel 로그에 `[holidays]` 한 줄(키는 가림)이 남는다.

## 남은 확인

- 공휴일 캐시가 서버 인스턴스마다 따로다(#24 의 2번). 연말에 2029년 공휴일이 공개되면 달력 범위가 넓어져도 잘 받는지 본다.
