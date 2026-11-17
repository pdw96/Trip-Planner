# Trip-Planner

@AGENTS.md

## 스택
- Next.js 16 (App Router, `src/`), React 19, Tailwind CSS 4, TypeScript
- DB: Neon Postgres + Drizzle ORM (`@neondatabase/serverless`, neon-http 드라이버)
- 인증: Better Auth + Google 로그인 (`src/lib/auth.ts`, Drizzle 어댑터)
- 배포: Vercel
- 포맷/린트: Biome (`npm run lint`, `npm run format`)

## 환경
- Neon 프로젝트: `Trip-Planner` (`round-haze-44237754`, ap-southeast-1). 개인 조직이 아니라 Vercel 이 관리하는 조직 "Vercel: pdw96's projects"(`org-calm-heart-03203548`)에 있다. Neon MCP 에서는 `project_id` 를 이 값으로 넘긴다.
  - `main` 브랜치(기본 브랜치, Vercel 프로덕션)가 앱이 쓰는 DB 다. `preview/*` 브랜치는 Vercel 프리뷰 배포용이다.
- 클라우드 세션에는 `.env.local` 이 없다. `DATABASE_URL` 등은 클라우드 환경 변수로 주입되므로 `process.env` 에서 바로 쓸 수 있다. 연결 대상을 확인할 때는 비밀번호를 빼고 호스트만 출력한다:
  `node -e 'const u=new URL(process.env.DATABASE_URL);console.log(u.hostname,u.pathname)'`

## 명령
- `npm run dev` / `npm run build`
- `npm run lint` · `npm run typecheck` — 커밋 전 둘 다 통과
- `npm run db:generate` — schema.ts 변경 후 마이그레이션 생성
- `npm run db:migrate` — 마이그레이션 적용 (사람이 확인한 뒤에만)

## 규칙
- 기본은 Server Component. `'use client'` 는 상호작용이 필요한 말단 컴포넌트에만.
- 데이터 변경은 Server Action, DB 접근은 `src/db/` 를 통해서만.
- 서버에서 현재 사용자는 `src/lib/session.ts` 의 `getCurrentUser()` 로만 읽는다. Server Action 과 Route Handler 는 DB 를 건드리기 전에 이를 확인하고, 사용자 소유 데이터 쿼리는 항상 `userId` 로 범위를 좁힌다.
- Better Auth 테이블(`user` · `session` · `account` · `verification`)은 이름과 타입을 바꾸지 않는다.
- 스키마는 `src/db/schema.ts` 만 고치고, `drizzle/` 아래 생성된 마이그레이션은 손으로 고치지 않는다 (훅이 막음).
- 시크릿은 `.env.local` 에만. `.env.example` 에 키 이름만 적는다.
- 파괴적 마이그레이션(DROP, 타입 변경, NOT NULL 추가)은 적용 전에 멈추고 보고한다.
