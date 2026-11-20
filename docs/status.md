# 지금 상태

2026-11-20 기준(#41 반영). 이슈 하나가 끝날 때마다(PR 머지, 배포 확인) 고친다. 새 세션은 이 파일부터 읽는다(`CLAUDE.md` '작업 흐름').

## 끝나서 배포된 것

| 이슈 | PR | 내용 |
|---|---|---|
| — | #8–#10 | 작업 흐름: `human-gate`, `.claude` 정리, `CLAUDE.md` 작업 흐름 |
| #11 | #16 | 여행 목록·만들기·자세히 보기·고치기·삭제. 설계 `docs/superpowers/specs/2026-11-18-trips-crud-design.md` |
| #17 | #18 | 숙소 예약형 날짜 범위 달력, 일요일·공휴일 빨강(공공데이터포털 특일 정보). 설계 `docs/superpowers/specs/2026-11-18-trip-date-range-picker-design.md` |
| #19 | #20 | 공휴일 API 403: 포털 "일반 인증키"가 이미 인코딩돼 있어 이중 인코딩됨. 키를 정규화하고 실패 응답을 로그로 남김 |
| #21 | #25 | 링크 미리 불러오기(런타임 prerender)가 세션 쿼리를 끊어 Better Auth 가 토큰이 담긴 ERROR 로그를 남김. `getCurrentUser()` 에 `connection()` |
| #12 | #27 | 여행별 날짜 일정표(`schedule_items`, 마이그레이션 0002). 시각·제목·장소(글자, Google 지도 검색 새 탭)·메모·완료, 그 자리 추가·고치기, 여행 기간 밖 일정 따로 모음. 설계 `docs/superpowers/specs/2026-11-18-trip-schedule-design.md` |
| #13 | #31 | 가 볼 장소·지도·동선(`places`·`trip_bases`·`schedule_items.place_id`, 마이그레이션 0003). Google 지도([전체]+N일차), Places (New) 자동완성으로 장소 넣기, 날마다 기준점, N일차 동선(Routes API 대중교통 → 도보·직선 + 국내·일본 안내, Google 길찾기 링크), 일정에서 장소 고르기. 설계 `docs/superpowers/specs/2026-11-18-trip-places-map-design.md` |
| #35 | #38 | 일정 장소 칸에서 Google 장소 검색(저장할 때만 '가 볼 곳'에도 넣음, 이미 있으면 그 장소로), 장소가 있으면 제목은 선택(마이그레이션 0004: `schedule_items.title` nullable). 장소+일정은 데이터를 바꾸는 CTE 한 문. 설계 `docs/superpowers/specs/2026-11-19-schedule-place-search-design.md` |
| #37 | #42 | 일정표의 일정 사이(도착 일정 줄 위)에 예상 이동 시간 한 줄, 기준점 구간 포함. 화면에 0.5초 머문 날만 묻고, 지도 N일차 탭과 결과를 페이지 저장소(`day-route-store.tsx`)로 함께 씀. DB 변경 없음. 설계 `docs/superpowers/specs/2026-11-19-schedule-travel-time-design.md` |
| #44 | #45 | 다크 모드에서 고르기 목록이 흰 바탕에 밝은 글자로 안 보이던 것(`color-scheme: light dark`), [전체] 탭 칸 이름 "기준점" → "가까운 순 기준"(일정 동선 기준점과 헷갈림, 부산 여행 제보) |
| #41 | #47 | 일정 줄 손잡이 ⠿ 로 끌어 하루 안 순서 바꾸기(마우스·터치·키보드, `@dnd-kit`). 시각 있는 일정끼리는 늘 시각 순, 시각 없는 일정은 어디든. `schedule_items.position`(마이그레이션 0005, nullable — 비면 시각 순). 설계 `docs/superpowers/specs/2026-11-20-schedule-reorder-design.md` |

## 다음 할 일

사용자가 열린 이슈에서 고른다.

- 기능: #14 예산·지출, #15 지인과 공유, #36 구간 경로 후보 2–3개
- 개선: #22 단위 시험을 CI 에서, #23 달력 키보드 이동, #24 자잘한 개선 모음

#14 는 새 테이블이 필요해 마이그레이션 PR 규칙을 따른다. 여행 접근 조건은 `src/db/queries/trips.ts` 의 `accessibleTrips(userId)` 하나다(#15 공유가 그 조건만 바꾸도록). 하위 데이터 쿼리는 `schedule-items.ts`·`places.ts` 처럼 이 조건을 같은 SQL 문 안에 넣는다(하위 id 와 여행 id 를 함께 묶어 섞어 보내기를 막는다). 여러 테이블을 함께 쓰려면 neon-http 에 트랜잭션이 없으므로 데이터를 바꾸는 CTE 한 문으로 한다(`updatePlace`, `createScheduleItemWithNewPlace`).

## 알아 둘 것

- **일정 순서(#41)**: 정렬은 `date, position NULLS LAST, time NULLS LAST, created_at, id` 하나를 `listScheduleItems`(SQL)와 `compareScheduleItems`(`src/lib/schedule.ts`)가 같이 쓴다. 규칙은 `src/lib/schedule-order.ts`(`keepsTimeOrder`·`insertByTime`·`orderWithItem`) 하나. 순서에 영향을 주는 쓰기(끌어 놓기, 넣기, 날짜·시각 고치기)는 그날 전체 position 을 0..n-1 로 한 문(`writeDayOrder`)에 다시 쓴다. 손대지 않은 날은 모두 NULL 이라 예전 시각 순과 같다. 넣기·고치기는 쓰기 **전에** `listDayOrder` 로 그날 순서를 읽어 둔다(같은 날 시각 지우기는 "그 자리" 유지).
- **useOptimistic 과 router.refresh**: 낙관 갱신 전환 안에서 `router.refresh()` 를 부르면 새로 고침이 끝날 때까지 낙관 값이 남는다(실패한 순서가 1–2초 그대로 보임). 되돌린 뒤 effect 에서 부른다(`schedule-day-items.tsx`, #41 브라우저 확인).
- **Playwright 로 끌기**: 손잡이를 `scrollIntoViewIfNeeded` 한 뒤 `mouse.down` → 몇 px 이동(PointerSensor 4px) → 대상으로 `steps` 이동 → `mouse.up`. 화면 밖 좌표는 아무 일도 안 일어난다. 터치는 CDP `Input.dispatchTouchEvent`(iPhone 13 흉내)로 확인했다. 일정 추가 양식은 저장 뒤에도 열려 있다(연달아 넣기) — 줄 수로 저장 완료를 기다린다.

- **로그인한 화면의 브라우저 확인**: 클라우드 세션에는 Google 로그인용 키가 없고 `DATABASE_URL` 은 프로덕션 DB 다. 사용자 승인을 받아 임시 테스트 계정(`user`·`session` 행, id 접두어 `e2e-test-`, 이메일 `@example.invalid`)을 넣고, 끝나면 지운다(넣기·지우기 전 SQL 전문을 보이고 각각 확인). 쿠키:
  - `npm run dev`: 이름 `better-auth.session_token`, 값 `encodeURIComponent(token + "." + base64(HMAC-SHA256("better-auth-secret-12345678901234567890", token)))`
  - production 빌드(`next build` + `next start`, 로컬 전용 `BETTER_AUTH_SECRET` 지정): 이름 앞에 `__Secure-`, 그 시크릿으로 서명
  - 테스트 서버를 다시 띄울 때는 이전 `next-server` 가 포트를 쥐고 있지 않은지 먼저 확인한다(#21 에서 고치기 전 빌드를 다시 시험할 뻔했다)
- **Next 16 Activity**: 지나온 화면을 `display:none` 으로 보관한다. Playwright 는 보이는 `main` 만 읽고(`main:visible`), 양식은 화면을 떠날 때 초기화한다(`trip-form.tsx`).
- **단위 시험**: `node --test 'src/**/*.test.mjs'` — 아직 CI 에서 돌지 않는다(#22). 순수 모듈(`src/lib/*.ts` 중 시험 대상)은 다른 모듈을 import 하지 않는다.
- **소유권 브라우저 확인(#12)**: Playwright `page.route` 로 A 화면에서 나가는 Server Action 요청(헤더 `next-action`)의 본문 속 id 를 B 의 것으로 바꿔 보내고, 실패 반응과 DB 에서 B 의 행이 그대로인지 본다. Neon MCP 는 읽기 전용이라 테스트 행 넣기·지우기는 `DATABASE_URL` 로 `@neondatabase/serverless` 를 쓰는 node 스크립트로 한다.
- **Playwright 와 Suspense**: 페이지 이동 직후에는 스트리밍이 덜 끝났을 수 있다. 읽기 전에 마지막 요소(예: 마지막 날 칸)를 `waitFor` 한다.
- **그 자리 입력칸 닫기**: 저장하면 줄이 다른 자리로 옮겨 갈 수 있다(일정 날짜 옮기기). 닫기는 양식의 effect 가 아니라 저장 action 안에서(같은 전환), 그리고 그 입력칸이 아직 열려 있을 때만 한다(`schedule-editor.tsx`).
- **Vercel 무료 한도**: 계정 전체(job-hunter·erp 포함) 하루 배포 100회(`api-deployments-free-per-day`). 걸리면 상태가 실패로 뜨고 24시간 뒤 풀린다. 코드 문제가 아니다. `vercel.json`(#29)이 작업 브랜치(`claude/*`, `ccr-*`) 미리보기를 끄고, 문서·`.claude`·`.github`·`*.test.mjs` 만 바뀐 커밋은 빌드를 건너뛴다. 같은 커밋을 다시 배포(Redeploy, 예: 환경 변수를 바꾼 뒤)하면 빌드한다(전에는 "바뀐 것 없음"으로 취소됐다). 그래서 PR 에는 Vercel 미리보기 링크·상태가 없고, `next build` 는 CI `check` 가 가짜 환경 변수로 확인한다.
- **Google 지도 플랫폼(#13)**:
  - 키: 서버 키 `GOOGLE_MAPS_SERVER_KEY`(Routes·Places (New), 서버에서만, 머리글 `X-Goog-Api-Key`), 브라우저 키 `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`(웹사이트 제한, 운영·개발 따로), 지도 ID `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`(Advanced Marker 에 필요, 없으면 "지도를 쓸 수 없어요"). 프로젝트 하루 할당량(2026-11-19 콘솔 확인): 지도 로드 300(사용자가 줄임). Places (New) 는 Google 기본값 그대로 — 자동완성(`AutocompletePlacesRequest`) 175,000, 장소 정보(`GetPlaceRequest`) 125,000. 전에 적었던 "Places 300"은 실제로 걸려 있지 않았다. 비용 상한을 원하면 사용자가 콘솔에서 두 줄을 낮춘다(제안: GetPlace 300, 자동완성 2,000–3,000). 사용량 그래프는 몇 분 늦게 반영된다.
  - 클라우드 세션: 서버 키는 환경 Network secret 으로 프록시가 `routes.googleapis.com`·`places.googleapis.com` 요청에 넣는다(브라우저의 장소 자동완성 요청에도 넣으므로 운영 브라우저 키 제한은 여기서 드러나지 않는다). 환경 변수 `GOOGLE_MAPS_SERVER_KEY=injected-by-proxy`, 허용 호스트 `maps.googleapis.com`·`maps.gstatic.com`. Node 의 fetch 가 프록시를 쓰려면 `NODE_USE_ENV_PROXY=1` 로 `npm run dev` 를 띄운다.
  - 약관: DB 에 저장하는 Google 값은 `google_place_id`(무기한)와 좌표(30일마다 갱신, 실패하면 비움)뿐. 경로 정보·이름·주소·나라·시간대는 저장하지 않는다(설계 §3.2). 장소 이름은 사용자가 확인한 이름표(`label`).
  - Routes API: 한국은 대중교통만(도보·자동차 빈 응답), 일본은 대중교통이 오지 않는다. 과거 시각은 받고 약 100일 뒤부터 빈 응답 → 요청 시각 상한 90일. Places Details 는 풀 수 없는 id 에 400 `INVALID_ARGUMENT`.
  - 하루 동선은 Server Action 이 아니라 Route Handler(`GET /trips/[id]/day-route?date=`)로 받는다. Next 는 Server Action 을 하나씩 돌려, 느린 Google 호출 동안 다른 저장이 기다렸다(#31 브라우저 확인).
- **Google 장소 검색칸(#35)**: '가 볼 곳'과 일정 장소 칸이 `google-place-search.tsx` 를 같이 쓴다. 일정 칸도 `APIProvider` 로 감싼다(지도 칸과 같은 `apiKey`·`language` 여야 한다. 스크립트는 페이지에 한 번만 불러온다). 휴대폰 너비에서는 Google 이 전체 화면 고르기로 연다. Playwright 로는 `gmp-place-autocomplete` 를 클릭하고 글자를 친 뒤 ArrowDown·Enter 로 고른다.
- **하루 동선·이동 시간(#37)**: 날짜별 동선 뼈대는 `src/lib/day-route.ts` 의 `routesByDate` 하나를 지도 칸·일정 칸·`loadDayRoute` 가 같이 쓴다. 구간 결과는 `src/app/trips/[id]/day-route-store.tsx`(키 `날짜|daySignature`, 서명에 일정 id 포함)에 두고 지도 탭·일정표가 `useDayRoute` 로 읽는다. 일정표 이동 줄 자리는 응답 구간의 `fromItemId`·`toItemId` 로 정한다(`src/lib/travel-lines.ts`, 출발·도착 일정이 줄 목록에 없으면 버림).
- **목록 key**: `items.map` 에서 `[이동 줄, 일정 줄]` 배열을 돌려주면 안쪽 key 가 칸 순서로만 맞춰져, 앞에 일정이 들어오면 뒤 줄이 모두 다시 마운트된다(열린 입력칸·완료 낙관 상태가 날아감). `<Fragment key={item.id}>` 로 묶는다(#37 리뷰).
- **Playwright 와 Google 지도**: 지도 타일 요청이 끊이지 않아 `waitUntil: "networkidle"` 은 끝나지 않는다. `domcontentloaded` 뒤 마지막 날 칸을 `waitFor` 한다. 헤드리스 Chromium 의 "Vector Map … Falling back to Raster" 콘솔 오류는 WebGL 탓이고 앱 문제가 아니다(dev 오버레이 "1 Issue" 가 이것).
- **테스트 데이터에 일정 넣기**: 장소가 이어진 일정은 `place_id` 와 함께 `place`(장소 글자)도 넣는다. 앱은 둘 다 저장하며, `place` 가 비면 제목 없는 일정의 이름이 빈칸으로 보인다. 장소의 Google id·좌표는 클라우드 프록시로 Places Text Search(`places.googleapis.com/v1/places:searchText`)에서 얻는다.
- **자동 머지**: 모든 검사가 이미 통과한 PR 은 GitHub 가 자동 머지 켜기를 거절한다("clean status"). 그때는 리뷰 종료 기준을 채웠으면 바로 squash 머지한다(#42).
- **Turbopack dev 캐시**: `git stash` 처럼 파일을 빠르게 바꿨다 되돌리면 dev 서버가 옛 CSS 를 계속 내줄 수 있다(다시 띄워도 같은 묶음 이름). `.next/dev` 를 지우고 다시 띄운다(#44).
- **Codex 리뷰**: PR 을 draft 에서 바꾸면 자동으로 돌고, 다시 받으려면 PR 에 `@codex review` 댓글. 막는 지적을 고친 뒤에는 마지막 커밋 기준으로 다시 받는다.
- **공휴일**: Vercel 환경 변수 `DATA_GO_KR_SERVICE_KEY`(Production·Preview). 이 세션에서는 `apis.data.go.kr` 접속이 막혀 있다. 실패하면 Vercel 로그에 `[holidays]` 한 줄(키는 가림)이 남는다.

## 남은 확인

- #41 프로덕션: 휴대폰에서 실제 터치로 끌기(손잡이 크기·스크롤과 구분), 지도 N일차 동선 번호가 바꾼 순서를 따르는지(로컬은 지도 키가 없어 일정표·이동 줄만 확인).
- #41 남은 지적(PR #47 본문): 저장된 순서가 이미 시각 순과 어긋나면(두 창 동시 고치기) 그날 끌기가 모두 거절됨 — 시각을 한 번 고치면 풀림. 넣기·고치기 뒤 순서 쓰기만 실패하면 그 줄이 맨 뒤·옛 자리에 보임(로그 `[schedule-order]`).

- #37 프로덕션: 사용자가 이동 줄이 뜨는 것을 확인함(부산 여행). 남은 것: 지도 N일차 탭과 같은 날을 두 번 묻지 않는지(Vercel 로그의 `day-route` 요청 수).
- 도착·출발일 동선: 도착하는 날은 숙소가 아니라 첫 일정에서 시작하는 게 자연스럽다(지금은 N일차 기준점을 "없음"으로, 다음 날을 숙소로 두 번 바꿔야 함). #44 때 이슈로 정리할지 물었으나 사용자가 고르지 않음(필요해지면 사용자가 요청).
- #37 남은 지적(PR #42 본문): 좌표 30일 갱신 순간 지도·일정표 서명이 달라 한 번 더 물을 수 있음(설계 §4.5), 지도 로딩 자리가 짧아 처음에 1–2일 미리 물을 수 있음, 저장소가 옛 서명 결과를 지우지 않음, 탭을 넘겨도 진행 중 요청을 끊지 않음, 아직 묻지 않은 날도 "불러오는 중…", 쓰지 않는 대비 코드 2곳.

- #35 프로덕션 확인: 일정 장소 칸에서 Google 장소 검색·저장, 제목 없이 저장. (할당량은 확인함: 자동완성이 막힐 걱정은 없다. 위 'Google 지도 플랫폼' 참고)
- #35 남은 지적(PR #38 본문): 같은 새 장소를 거의 동시에 저장하면 늦은 쪽은 "장소를 다시 골라 주세요", 브라우저 키 없을 때 검색칸 숨김은 띄워 보지 않음.

- 공휴일 캐시가 서버 인스턴스마다 따로다(#24 의 2번). 연말에 2029년 공휴일이 공개되면 달력 범위가 넓어져도 잘 받는지 본다.
- 여행 기간 상한이 없다. 수천 일짜리 여행은 일정 날짜 칸을 모두 그린다(#27 남은 지적). 상한을 둘지는 사용자 결정 — #24 에 넣을지 물어볼 것.
- 일정 화면을 실제 Google 로그인으로 프로덕션에서 한 번 써 본다(브라우저 확인은 로컬 dev + 테스트 계정으로만 했다).
- #13 프로덕션 확인: 사용자가 운영 브라우저 키와 Vercel Production 환경 변수 3개(`GOOGLE_MAPS_SERVER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`)를 넣은 뒤 지도·장소 검색·N일차 동선을 써 본다. 클라우드에서 확인 못 한 것: 서버 키가 틀릴 때, 핀 클릭 → 목록 강조, "그 밖 지역" 안내.
- #13 사용자 결정 대기: 기준점 장소를 지우면 앞 기준점이 이어진다(설계 §5.5 cascade). "그날부터 기준점 없음"을 원하면 후속 마이그레이션(`trip_bases.place_id` 를 on delete set null).
- #13 남은 지적(PR #31 본문): 하루 동선 요청 취소가 서버 Google 호출을 멈추지 않음, 장소 100개 상한은 넣기 전 셈(동시 넣기 시 조금 넘을 수 있음), 21번째 구간부터 직선만, 한국 짧은 구간은 걷기 시간 없이 직선.
