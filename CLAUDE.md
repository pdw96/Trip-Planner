# Trip-Planner

@AGENTS.md

## 스택
- Next.js 16 (App Router, `src/`), React 19, Tailwind CSS 4, TypeScript
- DB: Neon Postgres + Drizzle ORM (`@neondatabase/serverless`, neon-http 드라이버)
- 인증: Better Auth + Google 로그인 (`src/lib/auth.ts`, Drizzle 어댑터)
- 배포: Vercel (`main` → 프로덕션, PR → 프리뷰)
- 포맷/린트: Biome (`npm run lint`, `npm run format`)

## 환경
- Neon 프로젝트: `Trip-Planner` (`round-haze-44237754`, ap-southeast-1). 개인 조직이 아니라 Vercel 이 관리하는 조직 "Vercel: pdw96's projects"(`org-calm-heart-03203548`)에 있다. Neon MCP 에서는 `project_id` 를 이 값으로 넘긴다.
  - `main` 브랜치(기본 브랜치, Vercel 프로덕션)가 앱이 쓰는 DB 다. `preview/*` 브랜치는 Vercel 프리뷰 배포용이다.
- 클라우드 세션에는 `.env.local` 이 없다. `DATABASE_URL` 등은 클라우드 환경 변수로 주입되므로 `process.env` 에서 바로 쓸 수 있다. 연결 대상을 확인할 때는 비밀번호를 빼고 호스트만 출력한다:
  `node -e 'const u=new URL(process.env.DATABASE_URL);console.log(u.hostname,u.pathname)'`

## 명령
- `npm run dev` / `npm run build`
- `npm run lint` · `npm run typecheck` — 커밋 전 둘 다 통과 (CI 의 `check` 가 다시 확인)
- `npm test` — `src/**/*.test.mjs` 단위 시험 (CI `check` 에서도 돈다)
- `node --test '.github/scripts/*.test.mjs'` — 사람 승인 게이트(`human-gate`) 스크립트 테스트
- `npm run db:generate` — schema.ts 변경 후 마이그레이션 생성
- `npm run db:migrate` — 마이그레이션 적용 (사람 승인 뒤에만, 아래 '작업 흐름')

## 규칙
- 기본은 Server Component. `'use client'` 는 상호작용이 필요한 말단 컴포넌트에만.
- 데이터 변경은 Server Action, DB 접근은 `src/db/` 를 통해서만.
- 서버에서 현재 사용자는 `src/lib/session.ts` 의 `getCurrentUser()` 로만 읽는다. Server Action 과 Route Handler 는 DB 를 건드리기 전에 이를 확인하고, 사용자 소유 데이터 쿼리는 항상 `userId` 로 범위를 좁힌다.
- Better Auth 테이블(`user` · `session` · `account` · `verification`)은 이름과 타입을 바꾸지 않는다.
- 스키마는 `src/db/schema.ts` 만 고치고, `drizzle/` 아래 생성된 마이그레이션은 손으로 고치지 않는다 (권한 규칙이 막음).
- 시크릿은 `.env.local` 에만. `.env.example` 에 키 이름만 적는다. 셸(`cat` 등)로도 시크릿 파일을 읽지 않는다.
- 파괴적 마이그레이션(DROP, 타입 변경, NOT NULL 추가)은 PR 을 열기 전에 멈추고 보고한다.

## 구현 규칙
- 사용자 데이터를 읽는 쿼리는 `src/db/queries/<테이블>.ts` 에 두고 `import "server-only"`. 첫 인자로 `userId` 를 받는다.
- 남의 것과 없는 것은 똑같이 "찾을 수 없음"(`notFound()`). uuid 형식이 틀린 id 는 쿼리 전에 걸러 `null`.
- Server Action 순서: `getCurrentUser()` → 필드별 입력 검증(`FormData` 를 통째로 넘기지 않음) → `userId` 로 범위를 좁힌 쿼리 → 무효화.
- 로그인 화면은 홈(`/`)이다. 비로그인 사용자는 `redirect("/")`.
- 사용자에게 보이는 오류 문구는 한국어.

## 작업 흐름
사람이 개입하는 곳은 세 곳뿐이다: 할 이슈 고르기, 기능의 설계 승인, 위험 경로 PR 승인. 나머지는 Claude 가 끝까지 진행한다. 설계: `docs/superpowers/specs/2026-11-17-ai-native-workflow-design.md`.

**요청 → 이슈.** 사용자가 할 일을 말하면 GitHub 이슈로 정리한다. 라벨은 `bug` 또는 `enhancement`(판단 근거를 본문에), 버그면 재현 방법과 코드에서 찾은 원인 후보를 적는다. 무엇을 진행할지는 사용자가 고른다.

**이슈 → PR.** 사용자가 고른 이슈 하나는 세션 하나가 끝까지 맡는다: 설계, 구현, PR, 리뷰, 배포 확인, 그 배포에서 나온 버그 수정까지.
- 다음 이슈는 사용자가 앱에서 새 세션을 연다. Claude 가 `create_session` 으로 띄운 세션에는 계정 플러그인(superpowers)이 따라오지 않으므로 쓰지 않는다.
- 새 세션은 이 파일, `docs/status.md`, 고른 이슈를 읽고 시작한다.
- 이슈가 끝나면(PR 머지, 배포 확인) `docs/status.md` 의 '다음 할 일' 을 고치고, 새로 알게 된 함정·도구 팁만 '알아 둘 것' 에 더한다. 끝난 일은 적지 않는다(PR 과 git 이 기록한다). 배포 확인 결과(머지 커밋, READY, 런타임 오류)는 PR 댓글로 남긴다. 사용자가 실제로 해 볼 확인은 열린 '실제로 써 볼 것' 이슈(지금 #117, 없으면 만든다)에, 사용자 결정이 필요한 것은 새 이슈로 남긴다. 그리고 사용자에게 새 세션을 권한다. 이유는 집중과 비용이다(긴 대화는 매번 다시 읽힌다). 이미 정한 것을 다시 묻거나 같은 실수가 되풀이될 때도 권한다.
- `enhancement`: superpowers 브레인스토밍으로 설계 문서를 만들고 사람이 승인한 뒤 진행.
- `bug`: 바로 진행. 동작이나 화면을 바꾸는 결정이 필요하면 먼저 묻는다.
- PR 전: `npm run lint`, `npm run typecheck`, UI 변경은 `run` 스킬과 Playwright·next-devtools MCP 로 브라우저 확인, `/code-review`. 인증·소유권 코드를 건드렸으면 `/security-review` 도.
- PR 본문에 `Closes #N`. 위험 경로를 건드렸으면 맨 위에 "사람 확인 필요" 와 이유. 마이그레이션이면 SQL 전문과 파괴적 여부 판정.
- `/code-review` 가 끝나면 draft 를 해제한다(Codex 리뷰가 자동으로 돈다). **Codex 결과가 나온 뒤에** 자동 머지(squash)를 켠다. 자동 머지는 필수 검사만 기다려 Codex 가 끝나기 전에 머지될 수 있다(#57·#58). `subscribe_pr_activity` 로 PR 을 지켜보며 CI 실패와 코멘트를 처리한다.

**리뷰 종료 기준.** 횟수가 아니라 결과로 멈춘다.
- 막는 지적은 리뷰어의 등급표가 아니라 효과로 정한다. 그대로 머지하면 잘못된 머지·보안 우회·데이터 손상이 생기면 막는 지적이다. 막는 쪽으로 틀리는 것(불필요한 재승인 등)·불편·스타일은 막지 않는다. 판단 근거를 리뷰 스레드 답글에 적는다.
- 직전 리뷰 라운드(`/code-review`, Codex 등)에서 막는 지적이 0건이면 끝낸다. 막는 지적이 있으면 고치고 다시 리뷰받는다. 횟수 상한은 없다.
- 같은 파일·기능에서 막는 지적이 3 라운드 연속 나오면 혼자 계속하지 않고 사용자에게 넘긴다. 리뷰를 더 돌릴 문제가 아니라 설계를 다시 볼 신호다.
- 막지 않는 지적은 맞으면 고친다. 고치지 않은 것은 PR 본문 "남은 지적"에 적고, 열린 '남은 지적 모음' 이슈(지금 #120, 없으면 만든다)에 PR 링크와 한 줄로 더한다.
- Codex 지적을 고쳐 커밋을 올렸으면 막든 막지 않든 PR 에 `@codex review` 로 마지막 커밋 기준 재리뷰를 요청하고, 그 결과를 본 뒤 자동 머지를 켠다(사용자 요청, 2026-11-21). 끝낼지는 위 기준(막는 지적 0건)으로 정한다.

**Dependabot PR.** `.github/dependabot.yml` 이 주 1회(월 09:00) 새 버전 PR 을 연다(#65). 모두 위험 경로라 `human-approved` 가 필요하고, 자동 머지는 켜지 않는다. 머지는 사용자가 한다.
- CI 만 보고 넣는 PR(`npm-minor-and-patch`, `actions` 묶음): 사용자가 CI 통과를 보고 라벨을 붙여 머지한다. 빨간불이면 세션에 맡긴다. 문제 패키지의 그 업데이트만 빼려면 PR 에 `@dependabot ignore <패키지> minor version`(또는 `patch version`). 범위 없는 `@dependabot ignore <패키지>` 는 그 패키지를 영영 받지 않으니 쓰지 않는다. ignore 를 걸면 `docs/status.md` 에 적고, 풀 때는 `@dependabot unignore <패키지>`.
- 그 밖(npm·Actions 큰 버전, 짝 묶음 `react`·`tailwind`·`dnd-kit`, `auth-db`, Biome): 사용자가 새 세션에 "Dependabot PR #N" 을 맡긴다. 세션은 릴리스 노트·마이그레이션 안내를 읽고, PR 브랜치에서 lint·typecheck·test·build, 화면에 영향이 있으면 브라우저 확인을 한다. `auth-db` 는 Better Auth 의 스키마 변경 요구와 `npm run db:generate` 결과(새 마이그레이션이 생기지 않는지)도 본다. Actions 큰 버전이 `human-gate.yml` 을 바꾸면 PR 에서는 main 의 옛 게이트가 돌아 새 단계가 시험되지 않으니 릴리스 노트로 바뀐 동작을 확인한다. 결과는 PR 댓글로 남긴다.
- 코드를 고쳐야 하면 Dependabot 브랜치에 push 하지 않고, 세션 브랜치에 올림과 수정을 함께 담아 새 PR 을 연다(본문에 Dependabot PR 번호. 올림이 main 에 들어가면 Dependabot PR 은 저절로 닫힌다). 스키마 변경이 필요하면 마이그레이션 PR 규칙을 따른다.
- 받지 않기로 하면 패키지 하나짜리 PR 은 `@dependabot ignore this major version`(또는 `this minor version`), 묶음 PR 은 패키지마다 `@dependabot ignore <패키지> major version`. `docs/status.md` 에 적는다.

**마이그레이션 PR.** 자동 머지를 켜지 않는다. 사람이 SQL 을 보고 `human-approved` 라벨을 붙이면 `npm run db:migrate` 를 실행하고(실행 직전 사람 확인), 적용이 성공하면 자동 머지를 켠다(검사가 이미 다 통과했으면 바로 squash 머지). 적용 뒤 PR 을 포기하게 되면 되돌리는 방법을 보고한다.
- 배포는 순간에 바뀌지 않아 옛 코드가 새 DB 에서 도는 때가 두 번 있다. PR 본문 "옛 코드와 새 DB" 에 둘 다 판정한다(안전 / 깨짐: 무엇이 얼마나 / 보안·데이터 손상).
  1. 적용부터 새 배포 READY 까지(몇 분). 비어도 되는 칸·새 테이블은 대개 안전하고, 기본값 없는 NOT NULL 칸이나 색인·제약 교체는 옛 쿼리를 깰 수 있다(#89 `ON CONFLICT`).
  2. 그 뒤 옛 배포로 되돌릴 때(Instant Rollback). 새 모양 데이터가 쌓인 뒤라 칸 추가도 위험하다. 옛 코드가 새 칸을 모르고 지나치면 그 칸이 막던 것이 풀린다(#89 `owner_user_id`).
- 1이 깨지면 받아들일 위험을 적는다. 보안·데이터 손상이면 받아들이지 않고 PR 을 나눈다. 추가와 삭제가 섞이면 늘 나눈다(추가는 DB 먼저, 삭제는 코드 먼저).
- 칸·테이블 삭제는 코드 먼저: `human-approved` → 머지 → 배포 READY 확인 → 적용. 이때 1은 "머지부터 적용까지 새 코드 + 옛 DB" 로 판정한다. Drizzle 은 쿼리에 스키마의 칸 이름을 적어 `schema.ts` 에서 지운 코드는 칸이 남은 DB 에서도 돈다. 기본값 없는 NOT NULL 칸은 NOT NULL 을 푸는 마이그레이션부터 따로 넣는다. 머지한 세션이 READY 직후 적용하고, 적용 전에 세션이 끝나면 `docs/status.md` 머리 아래 '적용 안 된 마이그레이션' 절(없으면 만들고, 적용하면 지운다)에 적는다(다음 `db:migrate` 가 함께 적용하므로 그 PR 본문에도 SQL 을 적는다).
- 2가 보안·데이터 손상이면 그 배포보다 이전 배포로는 되돌리지 않고, 고친 코드를 새로 배포한다. `docs/status.md` '알아 둘 것' 의 "롤백 금지선" 에 적는다. 마이그레이션 PR 의 머지 커밋은 revert 하지 않는다(코드가 되돌아가는 것은 롤백과 같고, 마이그레이션 파일·journal 만 사라져 DB 와 어긋난다). 되돌릴 것은 새 마이그레이션으로 한다.

**위험 경로.** 아래를 바꾼 PR 은 `human-approved` 라벨이 있어야 `human-gate` 검사가 통과한다. 기준은 `.github/scripts/human-gate.mjs` 이다. 승인 뒤 위험 경로를 다시 바꾸면 게이트가 라벨을 떼므로, PR 에 무엇이 바뀌었는지 적고 사람에게 다시 확인을 요청한다.
- `drizzle/**`, `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`
- `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/app/api/auth/**`
- `next.config.ts`, `.env.example`, `package.json`, `package-lock.json`, `vercel.json`, `proxy.ts`, `src/proxy.ts`
- `.github/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `biome.json`, `tsconfig.json`

**Claude 가 하지 않는 것.** `human-approved` 라벨을 붙이거나 떼지 않는다. `main` 에 직접 push 하지 않는다. `human-gate` 가 실패하면 게이트 스크립트·워크플로를 고쳐 통과시키지 않고 사용자에게 알린다.

## 정리 원칙
- 프로젝트 전용 스킬·서브에이전트·훅을 더하기 전에 공식 도구(Claude Code 기본 기능, 공식 플러그인, GitHub·Vercel 기능)로 되는지 먼저 본다.
- 더한다면 파일 맨 위에 왜 필요한지 한 줄 남긴다. 모델이 좋아져 필요 없어지면 덜어낸다.
