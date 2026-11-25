# 지금 상태

2026-11-25 기준(#100 → #112 끝). 이슈 하나가 끝날 때마다(PR 머지, 배포 확인) 고친다. 새 세션은 이 파일부터 읽는다(`CLAUDE.md` '작업 흐름').

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
| #41 | #47 | (프로덕션 확인: 휴대폰 터치 끌기, 지도 N일차 번호) 일정 줄 손잡이 ⠿ 로 끌어 하루 안 순서 바꾸기(마우스·터치·키보드, `@dnd-kit`). 시각 있는 일정끼리는 늘 시각 순, 시각 없는 일정은 어디든. `schedule_items.position`(마이그레이션 0005, nullable — 비면 시각 순). 설계 `docs/superpowers/specs/2026-11-20-schedule-reorder-design.md` |
| #14 | #50 | 여행별 예산·지출(`trip_budgets`·`budget_items`, 마이그레이션 0006). 총 예산 + 예산 통화(+ 현지 통화·예정 환율), 예상은 일정 양식, 실제는 완료 체크칸을 켜면 열리는 칸(현지 통화는 결제일 유럽중앙은행 기준환율, Frankfurter), 지도 [전체]·[N일차] 탭 예산 카드(예상 총지출 = 실제 + 남은 예상, 초과·여유, 날짜별 표, 일정 밖 항목). 일정 줄에는 금액 없음. 설계 `docs/superpowers/specs/2026-11-20-trip-budget-design.md` |
| #15 | #54 | 지인과 여행 함께 보기·고치기(`trip_members`, `trips.invite_token_hash`, 마이그레이션 0007). 주인이 초대 링크(`/invite/<비밀값>`, DB 에는 SHA-256 만)를 만들고, 받은 사람이 로그인 뒤 [참여]. 함께하는 사람은 주인과 똑같이 고치고, 삭제·링크·내보내기는 주인만, 본인은 나가기. 카톡 앱 안 브라우저는 바깥 브라우저로 넘김. 설계 `docs/superpowers/specs/2026-11-20-trip-sharing-design.md` |
| #53 | #57·#58·#60 | 전체 화면 디자인 정리(노선도). 색·글꼴 토큰, 공용 조각, 여행 목록 짧은 노선(PR 1). 여행 화면(PR 2): 위에 붙는 날짜 줄이 지도·예산·일정·가 볼 곳을 함께 거름, 노선 일정(레일·역 동그라미 = 완료, 손잡이 오른쪽), 지도 선·핀 날짜 색, 예산 카드 머리, 휴대폰 아래 예산 줄 + [+ 지출] 시트, 함께하는 사람 한 줄 접기. DB 변경 없음. 설계 `docs/superpowers/specs/2026-11-20-design-refresh-design.md` |
| #22 | #63 | 단위 시험(`npm test`, `src/**/*.test.mjs`)을 CI `check` 에서 돌림. CI Node 22 → 26(Vercel `nodeVersion: 26.x` 와 맞춤). `.ts` 를 바로 읽어 나던 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 `--disable-warning` 으로 끔(`"type": "module"` 은 빌드 영향이 커서 택하지 않음). 설계 `docs/superpowers/specs/2026-11-20-unit-tests-in-ci-design.md` |
| #65 | #66 | Dependabot 버전 업데이트(`.github/dependabot.yml`, 주 1회 월 09:00, 7일 기다림). CI 만 보고 넣는 묶음(`npm-minor-and-patch`·`actions` minor·patch)과 세션이 확인하는 PR(npm·Actions 큰 버전, 짝 묶음, `auth-db`, Biome). 처리 규칙은 `CLAUDE.md` 'Dependabot PR'. Dependabot 브랜치는 Vercel 미리보기 끔, `human-gate.yml` Node 26. 설계 `docs/superpowers/specs/2026-11-21-dependabot-design.md` |
| Dependabot #72 | #74 | TypeScript 5.9 → 7.0. TS 6 부터 `types` 를 적지 않으면 `@types/*` 를 저절로 넣지 않아 전역 `google.maps` 가 빠짐 → `tsconfig.json` `types: ["node", "google.maps"]`, `@types/google.maps` 직접 devDependency. Next 16.4 는 TS 7 에서 `tsc` CLI 로 타입 검사(`experimental.useTypeScriptCli` 기본 true) |
| Dependabot #67·#68·#71 | 같음 | `actions/setup-node` 5 → 7, `actions/checkout` 5 → 7, `@types/node` 20 → 26(런타임 Node 26 과 맞춤). 코드 수정 없음. checkout v7 은 `pull_request_target` 에서 포크 PR 체크아웃을 거절하지만, `human-gate.yml` 은 `ref`·`repository` 없이 기준 브랜치만 받아 검사 자체를 건너뜀(`isDefaultCheckout`, v7.0.1). PR head 는 뒤의 `git fetch` 로 받으므로 그대로 |
| Dependabot #70 | #76 | Biome 2.4.2 → 2.6.7. `biome migrate`(`$schema` 2.6.7, `linter.rules.recommended` → `preset: "recommended"`), Markdown 서식 끔(`markdown.formatter.enabled: false`, lint 는 켬), 새 진단 정리(쓰지 않는 `useEffect` import, `useOptionalChain` 3곳), 쓰지 않는 create-next-app 템플릿 `public/*.svg` 5개 삭제(`noSvgWithoutTitle`) |
| #80 | #82 | 워크플로 액션(`actions/checkout` v7.0.1, `actions/setup-node` v7.1.0)을 태그 대신 40자리 커밋 SHA + `# vX.Y.Z` 주석으로 고정(공급망 강화, 동작 변화 없음). `dependabot.yml` 은 그대로. 설계 `docs/superpowers/specs/2026-11-23-pin-actions-sha-design.md` |
| #83 | #84 | Dependabot #78(Biome 2.6.7 → 2.6.8)이 `biome migrate` 없이 머지돼 `npm run lint` 가 `$schema` 불일치 info 진단을 냄. `npx biome migrate --write` 로 `biome.json` `$schema` 한 줄만 2.6.8 로 맞춤 |
| #91 | #92 | 기준점 = "그날 밤 묵는 곳". N일차 동선 = 전날 밤 숙소 → 일정들 → 그날 밤 숙소(첫날은 첫 일정에서 시작, 마지막 날은 마지막 일정에서 끝, 숙소 옮기는 날은 A → B). 지도 N일차 탭 "N일차 밤 숙소"(마지막 날·당일치기는 숨김) + "아침엔 🏨 X에서 출발". DB 변경 없음(기존 `trip_bases` 행을 새 뜻으로 읽음). 설계 `docs/superpowers/specs/2026-11-23-base-night-lodging-design.md` |
| #88 | #95 | 예산 카드를 지도 칸에서 빼서 일정 다음 독립 "예산" 칸으로(고른 날 연동 그대로). 아래 예산 줄을 PC·휴대폰 모두에 두고, 예산 칸이 보이면 숨김(`inert`)·요약을 누르면 예산 칸으로. 예산 없는 여행은 [N일차]에서도 "예산 정하기". 날을 바꿔도 보던 예산 칸이 제자리(`onBeforeSelect`). DB 변경 없음. 설계 `docs/superpowers/specs/2026-11-23-budget-section-design.md` |
| #97 | #98 | 맨 아래 예산 칸을 없애고, 늘 떠 있는 아래 예산 줄을 누르면 예산 카드가 `<dialog>` 바텀 시트로 올라옴(최대 85dvh, 뒤 흐림). 시트 맨 위 손잡이·날짜 칩(`DayChips`, 위 날짜 줄과 공용)·[✕]. 닫기: 바깥·✕·Esc·머리 쓸어내리기(판정 `src/lib/sheet-drag.ts`). 예산 없는 여행은 아래 줄에 "예산 정하기" → 설정 양식이 열린 시트. 시트·[+ 지출] 판이 열린 동안 뒤 페이지 스크롤 막음. #88 의 예산 칸 보임 감시·`onBeforeSelect` 삭제. DB 변경 없음. 설계 `docs/superpowers/specs/2026-11-23-budget-sheet-design.md` |
| #89 | #101 | 지출을 모임 통장·개인 통장으로(마이그레이션 0008: `trip_budgets.mode`·nullable `total_amount`, `budget_items.owner_user_id`(null = 모임), `trip_personal_budgets`). 여행마다 방식 모임 통장/각자/둘 다(주인만 바꿈, 기본 모임). 내 돈 지출·내 예산은 본인만(주인도 못 봄). 내 예산은 정할 때 통화를 저장해 예산 통화가 바뀌면 "다시 정해 주세요". 미리 결제한 실제(완료 전 고치기 양식의 "+ 실제 지출 적기", 완료를 풀어도 실제 유지). 일정을 지우면 남의 내 돈 금액은 그 사람의 일정 밖 항목으로, 나가기·내보내기는 그 사람의 내 돈·내 예산 삭제. 일정 양식·예산 정하기 양식은 고친 값만 보냄(`sides`·`sharedDirty`·`myDirty`). 설계 `docs/superpowers/specs/2026-11-23-budget-wallets-design.md` |
| #90 | #105 | 일정마다 "누구"(마이그레이션 0009: `schedule_items.for_user_id`, null = 모두, user FK cascade). 동선은 보는 사람 기준(모두 + 나만): `routeItemsFor(items, viewerId)` 를 `routesByDate`(viewerId 필수 인자)·지도 칸·일정표·`loadDayRoute` 가 같이 쓴다. 쓰기 여섯 분기 모두 같은 문에서 "누구 = 여행 주인 또는 함께하는 사람"(고치기는 지금 값도) 확인(`forUserAllowed`). FormData 에 `forUserId` 키가 없으면 추가는 모두, 고치기는 지금 값 유지. 양식 "누구" 칸(사람 둘 이상, 또는 값이 있는 일정의 고치기), 내 일정 이름표 `나`, 남의 일정 접힌 줄, 나간 사람 "이름 (나감)". 둘 다 여행의 내 일정은 금액 처음 쪽 [내 돈](`defaultSideFor`). 나가기·내보내기는 그대로(그 사람의 나만 일정은 남김, #103). 설계 `docs/superpowers/specs/2026-11-24-per-person-schedule-design.md` |
| #107 | #110 | `CLAUDE.md` '마이그레이션 PR' 에 옛 코드·새 DB 판정: PR 본문 "옛 코드와 새 DB" 에 ① 적용 → 새 배포 READY ② 옛 배포로 되돌릴 때를 각각 안전/깨짐/보안·데이터 손상으로 판정. 칸·테이블 삭제는 코드 먼저(머지 → READY → 적용), 추가·삭제가 섞이면 PR 을 나눔, 마이그레이션 PR 머지 커밋은 revert 하지 않음. '알아 둘 것' 에 롤백 금지선(0008). 설계 `docs/superpowers/specs/2026-11-25-migration-deploy-order-design.md` |
| #100 | #112 | 여행 "나라 (선택)"(마이그레이션 0010: `trips.country_code`, 대문자 두 글자 CHECK). 나라 목록·통화 표 `src/lib/countries.ts`(우리 목록에서 고른 값, Google 값 아님). 여행지 글자로 나라를 저절로 고름: GeoNames(CC BY 4.0) 한국어 지명 표 `src/lib/place-names.ts`(만든 파일, `scripts/build-place-names.mjs`) + `matchCountry`(`src/lib/place-match.ts`, 낱말 통째로, 나라 하나일 때만). 직접 고르면 따라가지 않음. 예산을 처음 정할 때 현지 통화·예정 환율 처음 값(기준환율은 Promise 로 넘겨 양식을 열 때만 기다림), 예산 통화를 바꾸면 환율 칸 비움. 설계 `docs/superpowers/specs/2026-11-25-trip-country-design.md` |

## 다음 할 일

사용자가 열린 이슈에서 고른다.

- #36·#23·#24 는 노선도 틀(#53)에 맞춰 넣는다.
- #36(국내 여행은 장소·이동 링크를 네이버 지도로)은 #100 이 끝나 시작할 수 있다. 나라 코드는 `getTrip` 의 `countryCode`. 부산 여행은 고치기를 열면 대한민국이 짐작돼 있어 저장만 하면 된다.
- #90 설계 중 나온 이슈(2026-11-24):
  - #103 계정마다 "내 기록": 나가거나 내보내져도 내 일정·지출을 내 계정에서 보고 관리. #89 의 "나가면 내 돈·내 예산 삭제"와 실수로 나간 경우(다시 들어와도 내 돈 기록은 돌아오지 않음)를 함께 다시 정한다. #90 은 나간 사람의 나만 일정을 지우지 않고 남겨 둠
  - #104 함께하는 사람 권한 나누기(보기만 / 고치기). 권한 칸을 더하면 옛 배포로 되돌릴 때 "보기만" 이 풀리므로 롤백 금지선 후보(#107 규칙으로 판정). 쓰기 쿼리에 쓰기용 조건(`editableTrips` 같은)을 두고, 보기만인 사람도 "내 것"(나만 일정, 내 돈)은 쓸 수 있어야 하는지 정한다
- 기능: #36 국내 여행 네이버 지도 링크, #109(#36 뒤) 네이버 길찾기 바로 열기
- 개선: #23 달력 키보드 이동, #24 자잘한 개선 모음
- Dependabot PR 이 오면 `CLAUDE.md` 'Dependabot PR' 대로 처리한다(세션이 확인할 PR 은 사용자가 새 세션에 맡긴다). 첫 실행 PR 6개는 모두 끝났다.

여행 접근 조건은 `src/db/queries/trips.ts` 의 `accessibleTrips(userId)`(주인 또는 함께하는 사람) 하나, 주인만 하는 일은 `ownedTrips(userId)`. 하위 데이터 쿼리는 `schedule-items.ts`·`places.ts`·`budget.ts` 처럼 이 조건을 같은 SQL 문 안에 넣는다(하위 id 와 여행 id 를 함께 묶어 섞어 보내기를 막는다). `accessibleTrips` 는 `trips` 를 별칭 없이 FROM 에 둔 쿼리에서만 쓴다(안의 EXISTS 가 바깥 `trips.id` 를 가리킨다). 여러 테이블을 함께 쓰려면 neon-http 에 트랜잭션이 없으므로 데이터를 바꾸는 CTE 한 문으로 한다(`updatePlace`, `createScheduleItemWithNewPlace`).

지출 행(`budget_items`)은 여행 접근 조건에 더해 `budget.ts` 의 `visibleToUser`/`visibleToUserSql`(모임 행 또는 본인 행, #89)을 같은 문에 건다. 보이는 행 = 쓸 수 있는 행이고 주인도 예외가 없다. 예외는 통화 잠금 검사(모든 행)와 `deleteScheduleItem`·`removeMember`·`leaveTrip` 의 시스템 동작뿐이다. `owner_user_id` 는 입력으로 받지 않고 `side`(모임/내 돈)로 서버가 정한다. 화면 데이터(`budget-data.ts`)는 `splitByOwner` 로 한 번 더 거른다.

## 알아 둘 것

- **Dependabot(#65)**:
  - 걸어 둔 ignore: 없음(`@dependabot ignore …` 를 쓰면 여기 적는다. 확인은 `@dependabot show <패키지> ignore conditions`).
  - 묶음: `auth-db`(better-auth·drizzle-orm·drizzle-kit·`@neondatabase/serverless`, 모든 업데이트), 짝 묶음 `react`·`tailwind`·`dnd-kit`(major 만), `npm-minor-and-patch`(그 밖 minor·patch, Biome 제외), `actions`(minor·patch). 묶음에 안 맞는 업데이트(그 밖 npm major, Actions major, Biome)는 패키지마다 PR. 한 패키지가 여러 묶음 패턴에 맞아도 `update-types` 가 겹치지 않으면 함께 받는다(dependabot-core `dependency_group_engine.rb`).
  - 액션은 40자리 커밋 SHA + `# vX.Y.Z` 주석으로 고정한다(#80). 새 액션을 넣을 때도 `git ls-remote --tags` 로 확인한 SHA 를 쓴다. Dependabot 은 SHA 와 주석을 함께 올린다고 알려져 있다(이 저장소에서는 아직 못 봄, '남은 확인').
  - `@types/node` 는 `>=27` 을 무시한다. Node 런타임(Vercel `nodeVersion`, CI·`human-gate.yml` 의 `node-version`)을 올릴 때 이 줄도 함께 올린다.
  - Biome 2.6(#76) 은 Markdown·YAML·SVG 도 기본으로 검사한다(Markdown·YAML 은 2.6.2 부터). Markdown 서식은 꺼 두었다(표 칸 채우기가 행 하나만 길어져도 표 전체를 다시 써 `docs/status.md` diff 가 커짐). YAML(`.github/*.yml`)은 서식 검사가 켜져 있으니 고친 뒤 `npm run lint`. `public/` 에 SVG 를 넣으면 `<title>` 이 있어야 한다(`noSvgWithoutTitle`). Biome 을 올릴 때마다 `npx biome migrate --write` 로 `$schema` 를 맞춘다(안 맞으면 info 진단, lint 는 통과해 CI 가 잡지 않는다). Dependabot Biome PR 은 migrate 를 하지 않으므로, 맡은 세션이 올림과 migrate 결과를 세션 브랜치에 함께 담는다(#78 은 그대로 머지돼 #84 로 따로 맞춤).
  - Dependabot 브랜치(`dependabot/**`)는 Vercel 미리보기가 없다. Vercel 미리보기는 Neon 에 `preview/<브랜치>` DB 브랜치를 만들고 저절로 지우지 않는다.
  - 같은 워크플로 파일의 붙은 줄을 바꾸는 Actions PR 두 개(#67·#68)는 하나를 머지하면 다른 쪽이 충돌해 Dependabot 이 리베이스한다. 주변 줄이 달라져 `human-gate` 가 라벨을 떼므로, 하나를 머지하고 리베이스된 뒤 다시 라벨을 붙인다.
  - lock 의 `"dev": true`·`libc` 는 npm 버전마다 다르게 쓰인다(#76 에서 확인). npm 10(클라우드 컨테이너 Node 22)은 drizzle-kit 아래 esbuild 플랫폼 패키지 75곳에 `"dev": true` 를 붙이고 `libc` 12곳을 지운다. npm 11(CI·`human-gate` 의 Node 26, Dependabot)은 그 반대다. #74 는 npm 10, #69·#76 은 npm 11 결과다. 지금 main 은 npm 11 결과로, CI 와 같다(CI·Vercel 동작 영향 없음). 세션에서 lock 을 다시 쓸 때는 `npx -y npm@11 install` 을 쓴다.
  - 제안(사용자가 고르지 않음): `human-gate.yml` setup-node 에 `package-manager-cache: false`. 지금은 `packageManager` 필드가 없어 캐시가 켜지지 않지만, 필드를 넣으면 `pull_request_target` 에서 저절로 켜진다(setup-node README 권고).
  - #72 처럼 코드를 고쳐야 하는 Dependabot PR 은 세션 브랜치에 Dependabot 커밋을 cherry-pick 하고 수정을 더해 새 PR(#74·#76)을 연다. 사용자가 세션에 머지를 맡기면 세션이 squash 머지한다(#74).
  - 설정 검증: `.github/dependabot.yml` 은 schemastore 의 `dependabot-2.0.json` 스키마로 확인했다(Biome 2.6 의 YAML 검사는 서식만 보고 스키마는 보지 않는다).

- **code scanning(CodeQL 기본 설정, 2026-11-21 부터)**:
  - 저장소 설정의 기본 설정(동적 워크플로 `dynamic/github-code-scanning/codeql`)이 PR·main push 마다 Actions 워크플로와 JS/TS 를 검사한다. 경고 목록은 세션 도구(GitHub MCP)로 읽을 수 없다. 사용자에게 제목·링크를 받고, 규칙 원문은 같은 버전 CodeQL 번들(`github/codeql-action` 릴리스 `codeql-bundle-v<버전>`, 버전은 분석 로그에 있음)의 `qlpacks/codeql/actions-*` 에서 읽는다. 세션에서 CodeQL 분석을 돌리는 것은 자동 권한 검사기가 막았다.
  - 경고 #1 `actions/untrusted-checkout/high`(`human-gate.yml` 의 `git fetch … refs/pull/<번호>/head`)은 **오탐**이다. 규칙은 `pull_request_target` 안에서 PR 번호·head ref·head SHA 가 들어간 `git fetch|pull` 을 모두 체크아웃으로 본다(`UntrustedCheckoutQuery.qll` 의 `GitMutableRefCheckout`). PR head 는 git 객체(`refs/remotes/pr/head`)로만 받고 작업 트리는 main 이며, 실행되는 것은 main 의 `human-gate.mjs` 뿐이다. 이 스크립트는 PR 쪽에 `git merge-base`·`git diff` 만 쓴다(`.gitattributes` 도 작업 트리 = main 에서 읽음). 받는 방법을 바꿔도 같은 규칙에 걸리므로 고치지 않고 dismiss(False positive)한다(사용자가 GitHub 화면에서).
  - 뒤에 PR 코드를 실행하는 단계(`npm install`, `node <경로>.js|.ts` 등)가 붙으면 같은 규칙이 Critical 로 올라간다. `human-gate.yml` 에 단계를 더할 때는 PR 쪽 파일을 실행하지 않는지 본다(`node .github/scripts/human-gate.mjs` 는 확장자가 `.mjs` 라 실행 단계로 세지 않지만, main 의 파일이라 실제로도 안전하다).
  - 액션은 SHA 로 고정돼 있다(#80, 위 'Dependabot' 항목).

- **TypeScript 7(#74)**:
  - 전역 타입(import 없이 쓰는 `google.maps` 등)은 `tsconfig.json` `types` 에 적어야 들어온다(TS 6 부터 기본으로 `@types/*` 를 모두 넣지 않음). 새 전역 타입 패키지를 쓰면 여기에 더하고 devDependency 로도 넣는다.
  - TS 7 패키지에는 예전 JS 컴파일러 API·`tsserver` 가 없다(`require("typescript")` 는 `version` 만). Next 는 `tsc` CLI 로 검사하므로 `next.config.ts` 의 `experimental.useTypeScriptCli` 를 false 로 두지 않는다. 편집기는 내장 버전이나 TS 7 네이티브 확장을 쓴다(tsconfig `plugins` 의 `next` 플러그인은 쓰이지 않음).
  - 증분 캐시: TS 7 이 만든 tsbuildinfo 는 `types` 에 항목을 **더하는** 변경을 무효화하지 않는다(옛 오류가 그대로 나옴. 빼는 변경은 무효화함). `types` 에 항목을 더하면 로컬 `tsconfig.tsbuildinfo` 를 지우고, Vercel 빌드에서 옛 오류가 나면 캐시 없이 다시 배포한다(`next build` 는 `.next/cache/.tsbuildinfo` 를 쓰고 Vercel 은 `.next/cache` 를 이어 쓴다). CI 는 매번 새로 받아 영향 없음.

- **디자인 토큰(#53)**:
  - 색은 `src/app/globals.css` 의 CSS 변수 + `@theme inline` 하나(`bg-surface`, `text-sub`, `border-rule`, `bg-field`·`border-field-line`, `text-danger`, `text-ok`, `text-warn`·`bg-warn-surface`, `text-on-ink`, 날짜 색 `line-1…8`). 다크 모드는 변수만 바꾼다. 컴포넌트에 `dark:` 클래스·`zinc-*`·`black/[.08]` 같은 값을 쓰지 않는다.
  - 공용 클래스는 `src/app/ui/styles.ts`: `buttonClass(look, size)`(+ `primary/secondary/danger/quietButtonClass`), `fieldClass`(**폭 없음** — 쓰는 쪽이 `w-full`·`w-32`·`flex-1` 을 붙인다, #52), `fieldAreaClass`(textarea), `cardClass`, `errorTextClass`, `emptyStateClass`.
  - 날짜 색은 `src/lib/day-line.ts` 의 `lineClass(dayNumber, "bg"|"text"|"border")` — Tailwind 가 찾도록 클래스 이름을 표로 적어 두었다(문자열 조립 금지). 8색을 돌려 쓴다.
  - 글꼴 IBM Plex Sans KR(`next/font/google`, 가변 글꼴이 아니라 굵기 400–700 을 적음, 한글 조각은 빌드 때 받는다).
  - 짧은 노선 `src/app/ui/mini-line.tsx`(목록·홈). 남은 날 `tripCountdown`, 날 수 `tripDayCount`(`src/lib/trip-dates.ts`) — 여행 기간 상한이 없으니 날을 펼치는 `tripDays` 를 목록에서 쓰지 않는다.
  - 여행 화면의 고른 날은 `src/app/trips/[id]/selected-day.tsx` 하나(`useSelectedDay()` → `selected`·`select`·`reselectCount`·`onBeforeSelect`, 기간에서 사라진 날은 `resolveSelection` 이 "all" 로). 날짜 줄(`trip-day-bar.tsx`)·지도 칸·일정·예산 칸·아래 예산 줄이 같이 읽는다. `onBeforeSelect` 는 고른 날이 **바뀌기 직전**에만 불린다(같은 날 다시 고르기는 안 부름) — 예산 칸(`budget-area.tsx`)이 바뀌기 전 위치를 재고 바뀐 뒤 `useLayoutEffect` 에서 `scrollBy` 로 제자리를 지킨다(#88). 고르지 않은 날·[전체] 전용 칸은 `ShownWhen`(`<div hidden>`)으로 그리되 감춘다(열린 칸 유지, 숨긴 날은 IntersectionObserver 가 못 보니 이동 시간을 묻지 않음).
  - 일정 노선 색은 날 묶음 `section` 의 `style={{"--line": lineVar(n)}}` 를 자식이 `bg-(--line)`·`border-(--line)` 으로 읽는다. **`lineVar` 는 `:root` 의 `--line-N` 을 가리킨다** — `@theme inline` 은 `--color-*` 를 CSS 변수로 내보내지 않아 `var(--color-line-N)` 은 비어 있다(#53 브라우저 확인). 노선 줄 칸은 `schedule-editor.tsx` 의 `ROW_GRID`·`RAIL`(일정 줄·이동 줄·일정 추가 줄이 같이 씀).
  - 지도 선만 hex 가 필요해 `LINE_HEX`·`lineHex`(`src/lib/day-line.ts`)를 둔다. `globals.css` 와 어긋나면 `day-line.test.mjs` 가 실패한다. 노선 색은 글자에 쓰지 않는다(주황·노랑이 본문 대비 4.5:1 미만) — 이동 줄 글자는 본문 색, 색은 옆 레일.
  - 날짜 줄 "붙음" 판정은 줄 자체를 `rootMargin: -1px` · `threshold: 1` IntersectionObserver 로 본다(제목으로 보면 줄이 제자리일 때도 작은 제목이 뜸). 아래 예산 줄(`budget-dock.tsx`)은 예산 칸과 함께 `budget-area.tsx` 가 fragment 로 그려 article 의 직계 자식(sticky bottom-0, PC·휴대폰 모두, #88). 예산 칸이 보이면 transform·opacity + `inert` 로 숨는다(자리는 그대로라 레이아웃이 들썩이지 않음). 시트 `<dialog>` 는 그 줄 **밖**에 둔다(줄이 inert 가 되면 안의 열린 모달도 막힌다).
  - 전역 `:focus-visible` 외곽선은 레이어 밖 CSS 라 Tailwind `outline-none` 유틸리티가 이기지 못한다(#88 브라우저 확인).
  - 브라우저 확인: dev 서버의 화면 갱신이 늦어 고친 직후 사진이 옛 모양일 수 있다. 이상하면 요소 크기를 직접 재 보고(`getBoundingClientRect`) 다시 찍는다(#53).

- **공유(#15)**:
  - 여행 객체(`getTrip`·`listTrips`)는 `TripRow`(초대 해시 칸 없음)에 `isOwner`(`listTrips` 는 `ownerName` 도). `isOwner` 는 버튼 고르기에만 쓰고 권한은 쿼리 조건이 정한다. 화면에는 이메일을 내지 않는다(이름·사진만).
  - 초대 비밀값 원문은 만든 직후 그 화면에만 보인다. 다시 보내려면 [새 링크 만들기](옛 링크는 죽고 이미 참여한 사람은 그대로). 원문은 Vercel 요청 로그와 로그인 중 Better Auth `verification` 행(최대 10분)에 잠깐 남는다(받아들임, 설계 §5.3 의 6).
  - 참여는 `joinTrip` 한 문(해시 일치·주인 아님·20명 미만·`on conflict do nothing`). 실패하면 이미 멤버 → 여행 화면, 링크 틀림 → 만료 안내, 20명 → 상한 문구.
  - 로그인 버튼 `GoogleSignInButton` 은 `callbackURL` prop 을 받는다(초대 화면만 `/invite/<비밀값>`).
  - 앱 안 브라우저 판별은 `src/lib/in-app-browser.ts`(카톡 → `kakaotalk://web/openExternal`, 그 밖 → 안내). 판별 문자열은 앱 업데이트로 바뀔 수 있다.
  - 브라우저 확인에서 Server Action 을 다른 계정으로 다시 보내기: A 화면에서 `page.route` 로 `next-action` 요청을 잡아 abort(잡은 뒤에는 화면이 오류 상태가 되므로 다시 연다) → 같은 머리글·본문에 B 의 쿠키를 붙여 `fetch` 로 보낸다. `notFound()` 는 404.
  - 셸에서 검사를 `| tail` 로 보면 종료 코드가 가려진다. 커밋 전 `npm run lint` 는 출력을 파일로 보내고 종료 코드를 따로 본다(#15 에서 서식 오류가 CI 에서야 드러남).

- **예산(#14)**:
  - 금액은 통화 최소 단위 정수(`bigint`, 10^12 미만), 환율은 `numeric(20,10)` "현지 1 = 예산 몇". 돈 계산은 `src/lib/budget.ts` 하나(환율 곱은 BigInt, 행마다 반올림). 통화 목록·자릿수·100 단위 표시(엔·동·루피아)도 거기. tsconfig 대상이 ES2017 이라 BigInt 글자(`10n`) 대신 `BigInt(10)`.
  - 예상은 그 여행의 예정 환율, 실제는 행에 저장한 결제일 환율로 바꾼다. 환율 결정은 `decideRate`(예산 통화 → 없음, 직접 넣음 → manual, 같은 결제일의 ecb·manual → 유지, 미래·ECB 미지원(대만 달러·동) → 예정 환율, 그 밖 → 받기). 받기 실패는 예정 환율(`planned`)로 저장하고 다시 저장할 때 다시 받는다.
  - 실제 지출은 완료된 일정에만 있다: 체크를 끄면 확인 뒤 `undoScheduleItemAndClearActual`(한 문), 서버는 실제가 있는 일정의 일반 완료 풀기와 미완료 일정의 실제 쓰기를 거절한다. 일정 고치기 양식의 실제 칸은 양식이 보낸 표시(`actualShown=1`) **와** 지금 DB 상태(완료 또는 실제 있음)가 모두 맞을 때만 읽는다(Codex 리뷰 두 번: 낡은 양식이 실제를 지우거나 되살림).
  - 통화 바꾸기 규칙(설계 §5.2)은 `upsertTripBudget` 한 문 안에서 확인한다. 설정 저장과 금액 쓰기가 동시에 일어나는 경쟁은 막지 못한다(PR #50 남은 지적).
  - 카드 양식은 저장 동작 안에서 닫는다(`budget-forms.tsx` 의 `closingOnSave`). 저장으로 카드 모양이 바뀌면(예산 없음 → 있음) 양식이 새 자리에서 다시 그려져 effect 로는 닫히지 않는다(#14 브라우저 확인).
  - 지도 첫 탭은 여행 중이면 "오늘"이다. 예산이 없으면 N일차 탭에는 카드가 없어서 [전체] 를 눌러야 "예산 정하기" 가 보인다.
  - 클라우드 환경 허용 호스트에 `api.frankfurter.dev` 를 더했다(2026-11-20). 응답 `{"date","rates":{"KRW":8.3572}}`.
- **밤 숙소(#91)**: 규칙은 `src/lib/day-route.ts` 의 `basesForDay(rows, date, trip)` 하나(시작 = 첫날이 아니면 `baseForDate(전날)`, 끝 = 마지막 날이 아니면 `baseForDate(그날)`). `routesByDate` 는 여행 시작·끝일(`TripRange`)을 받는다 — 하루 동선 Route Handler 는 날짜 하나만 넘기므로 여기서 전날을 계산해야 지도 칸과 서명이 맞는다. `DayRoute` 는 `start`·`end`(좌표 있는 것만), 패널은 `nightBaseId`·`morningBaseId`·`hasNight`·`routeBaseIds`. `setTripBaseAction` 은 마지막 날(밤 없음) 저장을 거절한다. 일정이 없는 날은 일정표가 구간을 묻지 않는다(숙소 이동 A → B 는 지도 탭에만, PR #92 남은 지적).
- **브라우저 확인 스크립트**: scratchpad 의 ESM 스크립트에서는 `import "playwright"` 가 안 된다 → `createRequire(import.meta.url)("playwright")`. DB 를 읽는 스크립트(`@neondatabase/serverless`)는 프로젝트 루트에 복사해 실행한다. 테스트 계정 넣기는 자동 권한 검사기가 막을 수 있다(#14: 사용자가 승인 창에서 허용).

- **일정 순서(#41)**: 정렬은 `date, position NULLS LAST, time NULLS LAST, created_at, id` 하나를 `listScheduleItems`(SQL)와 `compareScheduleItems`(`src/lib/schedule.ts`)가 같이 쓴다. 규칙은 `src/lib/schedule-order.ts`(`keepsTimeOrder`·`insertByTime`·`orderWithItem`) 하나. 순서에 영향을 주는 쓰기(끌어 놓기, 넣기, 날짜·시각 고치기)는 그날 전체 position 을 0..n-1 로 한 문(`writeDayOrder`)에 다시 쓴다. 손대지 않은 날은 모두 NULL 이라 예전 시각 순과 같다. 넣기·고치기는 쓰기 **전에** `listDayOrder` 로 그날 순서를 읽어 둔다(같은 날 시각 지우기는 "그 자리" 유지).
- **useOptimistic 과 router.refresh**: 낙관 갱신 전환 안에서 `router.refresh()` 를 부르면 새로 고침이 끝날 때까지 낙관 값이 남는다(실패한 순서가 1–2초 그대로 보임). 되돌린 뒤 effect 에서 부른다(`schedule-day-items.tsx`, #41 브라우저 확인).
- **Playwright 로 끌기**: 손잡이를 `scrollIntoViewIfNeeded` 한 뒤 `mouse.down` → 몇 px 이동(PointerSensor 4px) → 대상으로 `steps` 이동 → `mouse.up`. 화면 밖 좌표는 아무 일도 안 일어난다. 터치는 CDP `Input.dispatchTouchEvent`(iPhone 13 흉내)로 확인했다. 일정 추가 양식은 저장 뒤에도 열려 있다(연달아 넣기) — 줄 수로 저장 완료를 기다린다.

- **로그인한 화면의 브라우저 확인**: 클라우드 세션에는 Google 로그인용 키가 없고 `DATABASE_URL` 은 프로덕션 DB 다. 사용자 승인을 받아 임시 테스트 계정(`user`·`session` 행, id 접두어 `e2e-test-`, 이메일 `@example.invalid`; `session.updated_at` 은 DB 기본값이 없어 `now()` 를 함께 넣는다)을 넣고, 끝나면 지운다(넣기·지우기 전 SQL 전문을 보이고 각각 확인). 쿠키:
  - `npm run dev`: 이름 `better-auth.session_token`, 값 `encodeURIComponent(token + "." + base64(HMAC-SHA256("better-auth-secret-12345678901234567890", token)))`
  - production 빌드(`next build` + `next start`, 로컬 전용 `BETTER_AUTH_SECRET` 지정): 이름 앞에 `__Secure-`, 그 시크릿으로 서명
  - 테스트 서버를 다시 띄울 때는 이전 `next-server` 가 포트를 쥐고 있지 않은지 먼저 확인한다(#21 에서 고치기 전 빌드를 다시 시험할 뻔했다)
- **Next 16 Activity**: 지나온 화면을 `display:none` 으로 보관한다. Playwright 는 보이는 `main` 만 읽고(`main:visible`), 양식은 화면을 떠날 때 초기화한다(`trip-form.tsx`).
- **단위 시험**: `npm test`(`src/**/*.test.mjs`, `.ts` 를 바로 읽어 나는 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 옵션으로 끔). CI `check` 에서 돈다(#22). CI·`human-gate.yml` Node 는 Vercel 과 같은 26(#65 에서 게이트도 올림). 순수 모듈(`src/lib/*.ts` 중 시험 대상)은 다른 모듈을 import 하지 않는다.
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
- **바텀 시트 쓸어내리기(#97)**: `touch-action` 은 가장 가까운 스크롤 영역까지만 조상과 합쳐진다. 가로 스크롤 줄(날짜 칩 fieldset) 안에서 시작한 세로 끌기는 바깥 머리의 `touch-pan-x` 가 듣지 않아 브라우저가 가져간다(pointercancel). 그래서 시트 칩 줄에 직접 `touch-pan-x`(`DayChips panXOnly`). 위 날짜 줄에 주면 페이지 세로 스크롤이 막힌다. `<dialog>` 가 스크롤 영역이면 자기 스크롤바 누르기도 `target === dialog` 라 바깥 판정은 좌표로도 본다(`sheet-dialog.ts`).
- **DB 없이 화면 확인(#97)**: 테스트 계정 넣기를 auto 모드 권한 검사기가 막을 수 있다(#97 에서 막힘). 클라이언트 컴포넌트 동작은 커밋하지 않는 임시 라우트(`src/app/e2e-sheet/`)에 가짜 데이터로 그려 Playwright 로 본다. 실제 페이지처럼 `main w-full max-w-2xl` 로 감싸야 폭이 맞고, 지운 뒤에는 `.next/dev/types` 를 지워야 typecheck 가 옛 경로를 찾지 않는다. Next 개발 표시가 왼쪽 아래를 덮어 그 자리 tap 이 막히니 `position` 을 준다. CDP 터치로 끌기를 흉내 낼 수 있다.
- **마이그레이션 SQL 을 적용 전에 확인(#89)**: Neon MCP 는 읽기 전용이라 브랜치를 못 만든다. scratchpad 에 `@electric-sql/pglite`(0.2.x, Postgres 16)를 깔고 `drizzle/*.sql` 을 journal 순서로(`--> statement-breakpoint` 로 나눠) 적용한 뒤, `@/db` 만 PGlite 로 바꾼 require 훅으로 앱의 실제 쿼리 함수를 돌린다(`server-only` 는 빈 모듈로). 데이터를 바꾸는 CTE·FK cascade·부분 색인 `ON CONFLICT` 동작을 적용 전에 볼 수 있다.
- **롤백 금지선**(`CLAUDE.md` '마이그레이션 PR'): 아래 배포보다 이전 배포로 Instant Rollback 하지 않고, 고친 코드를 새로 배포한다.
  - 마이그레이션 0008(#89, 머지 커밋 `7ff21c0`): 옛 코드가 `budget_items.owner_user_id` 를 몰라 남의 내 돈 지출이 모두에게 보인다.
- **머지된 작업 브랜치 다시 쓰기**: auto 모드에서 `--force-with-lease` push 가 막힐 수 있다(#97). 그때는 새 main 위 커밋에 옛 원격 브랜치를 merge 해 일반 push 한다(squash 로 이미 들어간 내용이라 PR diff 는 새 변경만).
- **나라·지명(#100)**: 지명 표를 다시 만들려면 `cities15000.zip` 을 받아(`download.geonames.org`, 이 환경의 허용 호스트에 있음) `node scripts/build-place-names.mjs <txt>` 뒤 `npx biome format --write src/lib/place-names.ts`. 한 글자 이름·흔한 낱말("나라")은 스크립트가 버리고, GeoNames 에 없는 여행지·흔한 나라 이름(호주·터키·한국)은 스크립트의 `EXTRA` 에 더한다. 출처 표기는 나라 칸 아래.
- **React 양식 reset 과 제어 select(#100)**: `useActionState` 양식은 action 이 끝난 뒤(다시 그린 다음) React 가 `form.reset()` 한다. 제어 `<select value>` 는 첫 항목으로 돌아가고 React 가 다시 맞추지 않아, 검증 오류 뒤 다시 저장하면 그 값이 빠진다. `country-field.tsx` 처럼 form 의 `reset` 이벤트 뒤(microtask) 값을 되돌린다. 예산 설정 양식(`budget-forms.tsx`)의 select 들도 같을 수 있다(확인 안 함, PR #112 남은 지적).
- **공휴일**: Vercel 환경 변수 `DATA_GO_KR_SERVICE_KEY`(Production·Preview). 이 세션에서는 `apis.data.go.kr` 접속이 막혀 있다. 실패하면 Vercel 로그에 `[holidays]` 한 줄(키는 가림)이 남는다.

## 남은 확인

- #100 프로덕션: 머지 커밋 `2fbb46f` 배포 READY, 런타임 오류 없음. 마이그레이션 0010 적용 확인(적용 11개, 기존 여행 1개 null, CHECK). 적용 뒤 임시 테스트 계정으로 로컬 dev 확인 통과: 만들기 "오사카 교토" → 일본, 아래 판 예산 정하기 ¥ + 845.23(실제 Frankfurter), 고치기에서 고른 나라 유지·"선택 안 함" 저장 뒤 다시 열면 대한민국 짐작, 검증 오류 뒤에도 베트남 유지 → DB `VN`. 테스트 행 모두 지움. 남은 것: 사용자가 부산 여행 고치기를 열어 대한민국으로 저장(#36 이 켜지는 조건).
- #100 남은 지적(PR #112 본문): 예산 설정 양식 select 가 검증 오류 뒤 첫 항목으로 돌아갈 수 있음(기존, 재현 안 함), 미리 채우는 기준환율은 하루 전 값일 수 있음, 지명 표에 없는 작은 도시·지역은 직접 고름.

- #90 프로덕션: 머지 커밋 `70588f6` 배포 READY, 런타임 오류 없음. 마이그레이션 0009 적용 확인(칸·FK, 기존 일정 8개 모두 NULL). 적용 뒤 임시 테스트 계정 A·B·C 로 로컬 dev 에서 확인 통과: 두 사람 화면의 동선·이동 줄·지도 1일차 번호 차이, "누구" 칸·[내 돈] 처음 쪽, 요청 본문의 `forUserId` 를 무관한 C 로 바꾸면 필드 오류·DB 그대로, 낡은 양식 고치기 값 유지, 접힌 줄 펼치기, B 나가기 → "테스트B (나감)"·그대로 저장 통과, 혼자 남은 여행은 칸 숨김, 390px. 테스트 행 모두 지움. 남은 것: 실제 장소(가짜 Google id 라 이동 시간은 "불러오지 못했어요")로 사람별 이동 시간, 사용자가 실제 지인과 첫날 각자 오는 길을 써 본다.
- #90 남은 지적(PR #105 본문): 쓰기 여섯 분기의 SQL 모양을 지키는 시험 없음, 고치기 0행이면 일정을 한 번 더 읽음, 고치기에서 "누구"만 바꾸면 보이는 금액 탭이 빈 쪽으로 바뀔 수 있음.
- 브라우저 확인 팁(#90): `sr-only` 라디오는 `check({force})` 가 안 먹으니 감싼 `label` 을 누른다. 입력값을 DOM 에서 바꿔도 React 가 되돌리므로, 재전송 시험은 `page.route` 로 Server Action 요청 본문(`next-action` 헤더)을 바꾼다. 일정 줄의 장소 글자는 링크라 고치기를 열려면 제목을 누른다. 임시 스크립트를 지우는 `rm` 은 변수 없이 경로를 그대로 쓴다(안전 검사가 막음).

- #89 프로덕션: 머지 커밋 `7ff21c0` 배포 READY, 런타임 오류 없음. 마이그레이션 0008 적용 확인(새 칸·테이블·부분 색인, 기존 여행 모두 `mode = shared`). 적용 뒤 임시 테스트 계정 둘로 로컬 dev 에서 8가지 확인 통과: 둘 다 방식에서 서로의 내 돈이 화면·RSC 응답에 없음, B 쿠키로 A 의 내 돈 행 고치기·지우기 재전송 → 404·DB 그대로, 각자 방식에서 비주인은 방식 고르기 없음, 통화 바꾸면 내 예산 "다시 정해 주세요", 일정 삭제 → 남의 내 돈은 일정 밖 항목으로, 미리 결제한 실제·완료 풀어도 유지, 나가기 → 내 돈·내 예산 삭제(모임 행 유지), 390px. 테스트 계정·행은 모두 지움. 남은 것: 사용자가 실제 지인과 둘 다·각자 여행을 써 본다.
- #89 남은 지적(PR #101 본문): 통화 잠금은 남의 내 돈 행까지 봐서 "누군가 그 통화로 적었다"는 짐작 가능(설계에서 받아들임), 내보내지는 순간 적은 내 돈 행이 남을 수 있음(본인만 보고 본인은 접근 못 함), 일정 삭제로 옮긴 항목은 300건 상한을 넘을 수 있음, 완료 체크칸 실제 칸은 고른 쪽만 저장, `saveBudgetSettingsAction` 은 검증 전에 설정을 읽음(문서화한 예외).
- #89 배포 주의: 내 돈 행이 생긴 뒤에는 #89 이전 배포로 Instant Rollback 하면 옛 코드가 남의 내 돈 지출을 모두에게 보인다. 문제가 생기면 되돌리는 커밋으로 앞으로 고친다.

- #91 프로덕션: 사용자가 실제 여행(숙소를 옮긴 부산 여행)에서 밤 숙소 동선이 잘 된다고 확인함(2026-11-23). 머지 커밋 `9a705e4` 배포 READY, 런타임 오류 없음.
- #91 남은 지적(PR #92 본문): 일정 없는 숙소 이동일은 일정표에 이동 줄이 없음(지도 탭에만), 좌표 없는 숙소도 "아침엔 … 출발"에는 이름이 남음, 위치 정보 없음 안내가 이동 구간과 함께 보이는 경우는 브라우저로 띄워 보지 않음.
- 클라우드 컨테이너의 `node_modules` 가 lock 보다 낡을 수 있다(#91 에서 Biome 2.4.2 → lint 설정 오류). lint 가 `biome.json` 을 못 읽으면 `npm ci`.

- #80 프로덕션: 머지 커밋 `29a0b75`(`.github`·문서만 바뀌어 Vercel 빌드는 건너뜀). main CI 에서 SHA 로 고정한 액션이 정상으로 받아져 돌았고, 새 `human-gate.yml` 은 #85 에서 처음 돌아 통과했다.
- #80: 첫 Dependabot Actions PR 에서 SHA 와 `# vX.Y.Z` 주석이 함께 바뀌는지 본다.
- #80: 사용자가 저장소 설정 Actions → General "full-length commit SHA 고정 요구"를 켰다(2026-11-23). 켠 뒤 첫 PR(#86)에서 CI `check`·CodeQL 기본 설정(동적 워크플로, Analyze actions·javascript-typescript)·`human-gate`(`pull_request_target`)가 모두 통과했다. 동적 워크플로도 이 정책에 막히지 않는다. 앞으로 태그로 쓴 액션이 있는 워크플로는 실패하니 새 액션은 SHA 로 넣는다.
- #74 프로덕션: 머지 커밋 `7569b84` 배포 READY(타입만 바뀌어 실행 코드 변화 없음).
- #67·#68·#71 프로덕션: #71·#67 배포 READY(`b8bee1d`, 타입·CI 만 바뀌어 실행 코드 변화 없음). #68 은 `.github` 만 바뀌어 `ignoreCommand` 가 빌드를 건너뜀(CANCELED, 정상). main CI 는 #67 통과(#71 실행은 다음 push 에 밀려 취소됨). `human-gate` 의 setup-node v7 은 #68 리베이스 뒤 실행에서 실제로 돌아 정상(Node 26.13.1, 캐시 꺼짐). checkout v7 이 `human-gate` 에서 처음 도는 것은 이 status 갱신 PR 이다.
- #76 프로덕션: 머지 커밋 `a2d8df5` 배포 READY(개발 도구·쓰지 않는 SVG·동작이 같은 코드 정리라 화면 변화 없음). #76 은 #71·#67·#68·#77 보다 앞선 main 에서 검사했으므로, 머지 뒤 main 에서 lint·typecheck·test 를 다시 돌려 통과를 확인함.

- #65 첫 실행(2026-11-21 머지 직후) 확인함: 묶음대로 PR 6개 — #69 `npm-minor-and-patch`(check 통과), #67 setup-node 7·#68 checkout 7(Actions major, 통과), #71 `@types/node` 26(통과), #70 Biome 2.6.7(lint 실패, 예상), #72 TypeScript 7(typecheck 실패 → #74 로 고쳐 머지, 끝). Vercel 미리보기 없음, 프로덕션 배포 READY. `auth-db` 는 better-auth 1.7.27 이 7일 기다림 안이라 아직 없음.
  - `human-gate` 는 Dependabot PR 마다 3번 돈다(열기 + Dependabot 이 붙이는 라벨 2개의 `labeled`). 실패 사유는 모두 "라벨 필요"이고 권한 오류 없음. 사용자와 상의해 그대로 둔다(라벨 기능 유지, 다른 라벨 이벤트를 건너뛰면 건너뛴 검사가 통과로 쳐져 게이트가 뚫린다).
  - 끝: #69(사용자 머지), #72(#74), #67·#68·#71(세션 확인 뒤 사용자 라벨, 세션 머지), #70(#76). 사람이 라벨을 붙이면 Dependabot PR 에도 `github-actions[bot]` 승인 기록 댓글이 남는다(#68 에서 확인).
- #65 사용자: Neon 에 남은 `preview/…` 브랜치 6개(2026-11-17–18, `ccr-454f0d35-4gr8vb`·`claude/*` 5개)를 콘솔에서 지운다(Neon MCP 읽기 전용).

- #97 프로덕션: 머지 커밋 `2845241` 배포 READY, 런타임 오류 없음. 남은 것: 사용자가 실제 휴대폰(특히 iOS Safari)·PC 로 시트 열기·쓸어내리기·날짜 칩, 시트 안 저장 뒤 숫자 갱신, 예산 없는 여행에서 "예산 정하기" → 저장 뒤 아래 줄 전환을 써 본다. 로그인 화면은 세션에서 보지 못했다(테스트 계정 넣기 막힘, 작업 브랜치 미리보기 없음). 임시 화면 + 가짜 데이터로는 확인함(PR #98 본문).
- #97 남은 지적(PR #98 본문): 시트에서 양식을 쓰다 닫으면 입력이 경고 없이 사라짐(설계대로, [+ 지출] 판도 같음), 다크 모드에서 가림막이 뒤를 밝게 흐림(기존 판과 같음).
- #88 은 #97 로 바뀌어 예산 칸·줄 숨김 관련 남은 확인·지적은 없어졌다.
- #53 프로덕션: 사용자가 실제 기기로 여행 화면 전체가 정상 동작함을 확인함(2026-11-21).
- #53 남은 지적(PR #60 본문): 실제 없이 예상만 있을 때 [전체] 예산 카드에 여유·초과 문구가 두 번(설계대로 둠), 예상 0원뿐인 날의 "—".

- #15 프로덕션: 사용자가 실제 지인을 초대해 참여·접속까지 확인함(2026-11-20). 남은 것: 20명 상한 문구(계정 21개 필요), 카톡 앱 안 브라우저에서 바깥 브라우저로 넘어가는지(어느 경로로 열었는지는 기록 없음).
- #15 남은 지적(PR #54 본문): 동시 참여로 20명을 조금 넘을 수 있음, 실시간 반영 없음(두 사람 동시 고치기 경쟁은 #41·#14 남은 지적과 같음).

- #14 프로덕션 확인: 사용자가 실제 여행 하나에 예산 정하기 → 일정 예상 → 체크칸으로 실제(현지 통화면 결제일 기준환율이 들어가는지) → [전체]·[N일차] 카드. 클라우드에서 확인 못 한 것: 프로덕션 Vercel 에서 Frankfurter 호출(로그 `[fx]`), 실제 Google 로그인 화면.
- #14 남은 지적(PR #50 본문): 설정·금액 동시 쓰기 경쟁, 300행 상한은 일정 밖 항목 넣기에서만, 오늘 결제의 환율이 전 영업일 값으로 캐시될 수 있음, 날짜 옮기며 금액만 실패하면 안내가 사라질 수 있음, 지워진 일정 밖 항목 지우기 → 찾을 수 없음 화면, 예상 0원뿐인 날은 "—", 환율 소수 초과 문구, 실패 로그 두 줄, 다른 탭 통화 변경 뒤 낡은 양식.

- #41 남은 지적(PR #47 본문): 저장된 순서가 이미 시각 순과 어긋나면(두 창 동시 고치기) 그날 끌기가 모두 거절됨 — 시각을 한 번 고치면 풀림. 넣기·고치기 뒤 순서 쓰기만 실패하면 그 줄이 맨 뒤·옛 자리에 보임(로그 `[schedule-order]`).

- #37 프로덕션: 사용자가 이동 줄이 뜨는 것을 확인함(부산 여행). 남은 것: 지도 N일차 탭과 같은 날을 두 번 묻지 않는지(Vercel 로그의 `day-route` 요청 수).
- #37 남은 지적(PR #42 본문): 좌표 30일 갱신 순간 지도·일정표 서명이 달라 한 번 더 물을 수 있음(설계 §4.5), 지도 로딩 자리가 짧아 처음에 1–2일 미리 물을 수 있음, 저장소가 옛 서명 결과를 지우지 않음, 탭을 넘겨도 진행 중 요청을 끊지 않음, 아직 묻지 않은 날도 "불러오는 중…", 쓰지 않는 대비 코드 2곳.

- #35 프로덕션 확인: 일정 장소 칸에서 Google 장소 검색·저장, 제목 없이 저장. (할당량은 확인함: 자동완성이 막힐 걱정은 없다. 위 'Google 지도 플랫폼' 참고)
- #35 남은 지적(PR #38 본문): 같은 새 장소를 거의 동시에 저장하면 늦은 쪽은 "장소를 다시 골라 주세요", 브라우저 키 없을 때 검색칸 숨김은 띄워 보지 않음.

- 공휴일 캐시가 서버 인스턴스마다 따로다(#24 의 2번). 연말에 2029년 공휴일이 공개되면 달력 범위가 넓어져도 잘 받는지 본다.
- 여행 기간 상한이 없다. 수천 일짜리 여행은 일정 날짜 칸을 모두 그린다(#27 남은 지적). 상한을 둘지는 사용자 결정 — #24 에 넣을지 물어볼 것.
- 일정 화면을 실제 Google 로그인으로 프로덕션에서 한 번 써 본다(브라우저 확인은 로컬 dev + 테스트 계정으로만 했다).
- #13 프로덕션 확인: 사용자가 운영 브라우저 키와 Vercel Production 환경 변수 3개(`GOOGLE_MAPS_SERVER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`)를 넣은 뒤 지도·장소 검색·N일차 동선을 써 본다. 클라우드에서 확인 못 한 것: 서버 키가 틀릴 때, 핀 클릭 → 목록 강조, "그 밖 지역" 안내.
- #13 사용자 결정 대기: 기준점 장소를 지우면 앞 기준점이 이어진다(설계 §5.5 cascade). "그날부터 기준점 없음"을 원하면 후속 마이그레이션(`trip_bases.place_id` 를 on delete set null).
- #13 남은 지적(PR #31 본문): 하루 동선 요청 취소가 서버 Google 호출을 멈추지 않음, 장소 100개 상한은 넣기 전 셈(동시 넣기 시 조금 넘을 수 있음), 21번째 구간부터 직선만, 한국 짧은 구간은 걷기 시간 없이 직선.
