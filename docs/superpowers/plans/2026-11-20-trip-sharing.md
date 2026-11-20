# 지인과 여행 함께 보기·고치기 (#15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 초대 링크로 여행에 "함께하는 사람"을 들여 주인과 똑같이 고치게 하고, 삭제·링크·내보내기는 주인만 하게 한다.

**Architecture:** 새 표 `trip_members` 와 `trips` 의 초대 해시 칸(마이그레이션 0007). 접근 조건 `accessibleTrips` 를 "주인 또는 멤버"로 넓히고 주인 전용 동작은 `ownedTrips` 를 쓴다. 초대는 `/invite/[token]` 페이지 + [참여] Server Action(한 SQL 문으로 확인·넣기). 카톡 앱 안 브라우저는 클라이언트 조각이 바깥 브라우저로 넘긴다.

**Tech Stack:** Next.js 16 App Router(Server Component·Server Action), Drizzle ORM + neon-http, Better Auth, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-trip-sharing-design.md`

## Global Constraints

- 사용자에게 보이는 문구는 한국어. 문구 상수는 `src/app/trips/messages.ts`.
- DB 접근은 `src/db/` 를 통해서만. 사용자 데이터 쿼리는 `import "server-only"`, 첫 인자 `userId`.
- Server Action 순서: `getCurrentUser()` → 필드별 입력 검증 → `userId` 로 범위를 좁힌 쿼리 → `revalidatePath`. 비로그인은 `redirect("/")`.
- 남의 것과 없는 것은 똑같이 `notFound()`. uuid 형식이 틀린 id 는 쿼리 전에 걸러 `null`/`false`.
- neon-http 트랜잭션 없음 → 조건부 쓰기는 한 SQL 문.
- 함께하는 사람 상한 `MAX_MEMBERS_PER_TRIP = 20`(주인 제외).
- 비밀값: 32바이트 난수 base64url(43글자, `/^[A-Za-z0-9_-]{43}$/`), DB 에는 SHA-256 hex 만.
- 화면에 이메일을 내지 않는다(쿼리에서 고르지 않음).
- `src/lib/auth.ts`·`session.ts` 는 고치지 않는다. `drizzle/` 는 손으로 고치지 않는다.
- 단위 시험 순수 모듈(`src/lib/*.ts`)은 앱 모듈을 import 하지 않는다(`node:crypto` 는 됨).
- 커밋 전 `npm run lint`, `npm run typecheck`, `node --test 'src/**/*.test.mjs'`.

## Review Focus

1. 주인이 자기 초대 링크를 연다 → 참여 화면이 아니라 여행 화면으로 간다(Task 4 `joinTrip` 은 주인에게 null, Task 7 페이지가 redirect).
2. 함께하는 사람이 삭제·링크 만들기·내보내기 Action 을 직접 보낸다 → `notFound()`, DB 그대로(Task 3·5 쿼리 조건, Task 9 확인 3).
3. 내보낸 사람이 열어 둔 화면에서 일정을 저장한다 → 실패(Task 9 확인 5).
4. 새 링크를 만든 뒤 옛 링크를 연다·[참여] 를 누른다 → 만료 안내(Task 7, Task 9 확인 5).
5. 형식이 틀린 비밀값(짧음, `%2F`, 44글자) → 쿼리 없이 만료 안내(Task 2 시험 `isInviteToken`).

---

### Task 1: 스키마와 마이그레이션 0007

**Files:**
- Modify: `src/db/schema.ts` (trips 에 칸 둘, `tripMembers` 표 추가)
- Create: `drizzle/0007_*.sql`, `drizzle/meta/*` (생성)

**Interfaces:**
- Produces: `tripMembers`(`tripId`, `userId`, `joinedAt`), `trips.inviteTokenHash: string | null`, `trips.inviteTokenCreatedAt: Date | null`, `type TripMember = typeof tripMembers.$inferSelect`

- [ ] **Step 1:** `trips` 에 `inviteTokenHash: text("invite_token_hash").unique()`, `inviteTokenCreatedAt: timestamp("invite_token_created_at", { withTimezone: true })` 추가.
- [ ] **Step 2:** `tripMembers = pgTable("trip_members", …)`: `trip_id uuid not null → trips.id on delete cascade`, `user_id text not null → user.id on delete cascade`, `joined_at timestamptz not null default now()`, `primaryKey({ columns: [t.tripId, t.userId] })`, `index("trip_members_user_id_idx").on(t.userId)`.
- [ ] **Step 3:** `npm run db:generate` → 생성된 SQL 이 `CREATE TABLE "trip_members"`, `ALTER TABLE "trips" ADD COLUMN` 두 줄, unique 제약, FK 두 개, 인덱스뿐인지 본다(DROP·타입 변경·NOT NULL 추가 없음 = 파괴적 아님).
- [ ] **Step 4:** `npm run lint && npm run typecheck` 통과.
- [ ] **Step 5:** 커밋·push. PR #54 본문 맨 위에 "사람 확인 필요(마이그레이션)", SQL 전문, 파괴적 아님 판정. 사용자에게 SQL 확인과 `human-approved` 라벨을 요청한다. 라벨이 붙으면 `npm run db:migrate` 직전에 사용자 확인 → 실행 → Neon MCP `describe_table_schema` 로 표·칸 확인. (기다리는 동안 Task 2–8 진행. 이후 위험 경로를 다시 바꾸면 라벨이 떨어지니 schema 는 이 Task 에서 끝낸다.)

### Task 2: 순수 모듈 — 초대 비밀값, 앱 안 브라우저 판별

**Files:**
- Create: `src/lib/invite-token.ts`, `src/lib/invite-token.test.mjs`, `src/lib/in-app-browser.ts`, `src/lib/in-app-browser.test.mjs`

**Interfaces:**
- Produces:
  - `generateInviteToken(): string` (randomBytes(32) → base64url)
  - `hashInviteToken(token: string): string` (sha256 hex, 64글자)
  - `isInviteToken(value: string): boolean`
  - `type InAppBrowser = "kakaotalk" | "other" | null`, `detectInAppBrowser(userAgent: string): InAppBrowser`
  - `kakaoOpenExternalUrl(href: string): string` → `"kakaotalk://web/openExternal?url=" + encodeURIComponent(href)`

- [ ] **Step 1: 실패하는 시험**
  - `generateInviteToken` 두 번 → 서로 다르고 둘 다 `isInviteToken` true, 길이 43.
  - `hashInviteToken("abc")` = `"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"`, 같은 입력 같은 값.
  - `isInviteToken`: `""`, 42글자, 44글자, `"a".repeat(42)+"/"`, `"a".repeat(40)+"%2F"` → false.
  - `detectInAppBrowser`: `"… KAKAOTALK 10.4.5"` → `"kakaotalk"`; `"… Instagram 300.0"`, `"… [FBAN/FBIOS;…"`, `"… Line/13.1.0"`, `"… NAVER(inapp; search; …)"`, `"Mozilla/5.0 (Linux; Android 14; SM-S911N; wv) …"` → `"other"`; 데스크톱 Chrome·iOS Safari → `null`. 카톡 문자열에 `; wv)` 가 함께 있어도 `"kakaotalk"`.
  - `kakaoOpenExternalUrl("https://x.test/invite/a?b=1")` = `"kakaotalk://web/openExternal?url=https%3A%2F%2Fx.test%2Finvite%2Fa%3Fb%3D1"`.
- [ ] **Step 2:** `node --test src/lib/invite-token.test.mjs src/lib/in-app-browser.test.mjs` → FAIL(모듈 없음).
- [ ] **Step 3:** 구현. 판별은 대소문자 무시 정규식, 카톡을 먼저 본다.
- [ ] **Step 4:** 같은 명령 → PASS.
- [ ] **Step 5:** 커밋.

### Task 3: 여행 접근 조건과 여행 쿼리

**Files:**
- Modify: `src/db/queries/trips.ts`, `src/app/trips/actions.ts`(필요 시 타입만)

**Interfaces:**
- Consumes: Task 1 `tripMembers`
- Produces:
  - `accessibleTrips(userId: string): SQL` — `or(eq(trips.userId, userId), exists(select 1 from trip_members where trip_id = trips.id and user_id = userId))`
  - `ownedTrips(userId: string): SQL` — `eq(trips.userId, userId)`
  - `type TripWithAccess = Trip & { isOwner: boolean }`; `getTrip(userId, tripId): Promise<TripWithAccess | null>`
  - `type TripListItem = Trip & { isOwner: boolean; ownerName: string }`; `listTrips(userId): Promise<TripListItem[]>` (`user` innerJoin, `user.name` 만)
  - `deleteTrip` 은 `ownedTrips`

- [ ] **Step 1:** 위 시그니처대로 고친다. `isOwner` 는 `sql<boolean>\`${trips.userId} = ${userId}\``. `updateTrip` 은 `accessibleTrips` 그대로.
- [ ] **Step 2:** `schedule-items.ts`·`places.ts`·`trip-bases.ts`·`budget.ts`·`day-route-loader.ts`·`src/app/trips/[id]/day-route/` 에서 여행 접근이 모두 `accessibleTrips`/`getTrip` 을 거치는지 `grep -n "trips\.\|userId" ` 로 확인하고, `trips.userId` 를 직접 비교하는 곳이 남아 있지 않은지 본다. `budget.ts` 의 `sql\`… WHERE ${accessibleTrips(userId)}\`` 처럼 FROM 에 별칭 없이 `trips` 를 쓰는지(상관 하위 쿼리가 바른 표를 가리키는지) 확인한다.
- [ ] **Step 3:** `npm run typecheck` 통과(`getTrip` 반환형이 넓어져 호출부 수정 없음 예상).
- [ ] **Step 4:** 커밋.

### Task 4: 멤버·초대 쿼리

**Files:**
- Create: `src/db/queries/trip-members.ts`

**Interfaces:**
- Consumes: Task 1, Task 3 `accessibleTrips`·`ownedTrips`, `isUuid`
- Produces (모두 `import "server-only"`, uuid 가 틀리면 쿼리 없이 null/false):
  - `MAX_MEMBERS_PER_TRIP = 20`
  - `type TripPerson = { userId: string; name: string; image: string | null; isOwner: boolean }`
  - `listTripPeople(userId, tripId): Promise<TripPerson[] | null>` — 접근 못 하면 null. 주인 먼저, 그다음 `joined_at` 순. `user.email` 은 고르지 않는다.
  - `getInviteCreatedAt(userId, tripId): Promise<Date | null>` — 주인이고 링크가 켜져 있을 때만 값.
  - `setInviteTokenHash(userId, tripId, hash: string): Promise<boolean>` — `ownedTrips`, 시각 `now()`.
  - `clearInviteToken(userId, tripId): Promise<boolean>` — `ownedTrips`.
  - `type InvitePreview = { tripId: string; title: string; startDate: string; endDate: string; ownerName: string; ownerId: string }`
  - `findInvite(hash: string): Promise<InvitePreview | null>`
  - `joinTrip(userId, hash): Promise<string | null>` — 스펙 §5.3 의 `insert … select … on conflict do nothing returning trip_id` 한 문. 주인·상한 초과·틀린 해시·이미 멤버면 null.
  - `countTripMembers(tripId: string): Promise<number>` — [참여] 실패 사유 판별용(초대 해시로 찾은 여행에만 쓴다).
  - `removeMember(ownerId, tripId, memberUserId: string): Promise<boolean>` — `trip_id in (select id from trips where ownedTrips(ownerId))`.
  - `leaveTrip(userId, tripId): Promise<boolean>` — 본인 행만.

- [ ] **Step 1:** 구현.
- [ ] **Step 2:** `npm run typecheck && npm run lint`.
- [ ] **Step 3:** (마이그레이션이 적용된 뒤) 프로젝트 루트의 임시 node 스크립트로 `joinTrip` SQL 을 테스트 계정 둘에 실행해 본다: 주인 → null, 남 → tripId, 같은 사람 다시 → null. 넣기·지우기 전 SQL 을 사용자에게 보이고 확인. 스크립트는 커밋하지 않는다.
- [ ] **Step 4:** 커밋.

### Task 5: 멤버·초대 Server Action

**Files:**
- Create: `src/app/trips/member-actions.ts`, `src/app/invite/actions.ts`
- Modify: `src/app/trips/messages.ts`, `src/app/trips/actions.ts`(deleteTrip 변경 없음 확인)

**Interfaces:**
- Consumes: Task 2 `generateInviteToken`·`hashInviteToken`·`isInviteToken`, Task 4
- Produces:
  - `createInviteLinkAction(tripId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>` — 주인이 아니면 `notFound()`. 원문 token 만 돌려주고 주소는 클라이언트가 `location.origin` 으로 만든다(Host 머리글을 믿지 않음).
  - `turnOffInviteLinkAction(tripId: string): Promise<{ error: string | null }>`
  - `removeMemberAction(tripId: string, memberUserId: string): Promise<{ error: string | null }>` — 바뀐 행이 없으면 `notFound()`.
  - `leaveTripAction(tripId: string): Promise<void>` — 성공하면 `redirect("/trips")`, 아니면 `notFound()`.
  - `joinTripAction(token: string): Promise<{ error: string }>` — 형식 틀림 → `INVITE_INVALID`. `joinTrip` 성공 → `redirect(/trips/${id})`. null 이면: `getTrip` 으로 이미 접근 가능 → redirect 같은 곳; `findInvite` null → `INVITE_INVALID`; `countTripMembers >= 20` → `MEMBER_LIMIT`; 그 밖 → `SAVE_FAILED`.
  - 모든 Action 뒤 `revalidatePath("/trips")`, `revalidatePath(\`/trips/${tripId}\`)`.
  - 문구(messages.ts): `INVITE_INVALID = "초대 링크가 만료됐거나 잘못됐어요. 여행을 만든 분께 새 링크를 받아 주세요."`, `MEMBER_LIMIT = "함께하는 사람이 너무 많아요(20명까지)."`

- [ ] **Step 1:** 구현. `memberUserId` 는 문자열·길이 1–200 검사 후 쿼리(Better Auth id 는 uuid 가 아니다).
- [ ] **Step 2:** lint·typecheck.
- [ ] **Step 3:** 커밋.

### Task 6: 여행 화면 — 함께하는 사람 칸, 주인 전용 버튼

**Files:**
- Create: `src/app/trips/[id]/members-section.tsx`(Server), `src/app/trips/[id]/invite-link-panel.tsx`(client), `src/app/trips/[id]/member-buttons.tsx`(client: 내보내기·나가기)
- Modify: `src/app/trips/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 3 `getTrip().isOwner`, Task 4 `listTripPeople`·`getInviteCreatedAt`, Task 5 Action
- Produces: `<MembersSection userId={string} trip={TripWithAccess} />`

- [ ] **Step 1:** 머리의 [삭제] 를 `trip.isOwner` 일 때만. `MembersSection` 을 머리 아래(지도 위)에 `Suspense` 로.
- [ ] **Step 2:** 칸 모양은 스펙 §5.4 스케치. 주인 줄 "· 주인", 본인 줄 "(나)". 사진은 `<img>`(없으면 이름 첫 글자 원).
- [ ] **Step 3:** `InviteLinkPanel` 상태: 꺼짐 → [초대 링크 만들기]; 방금 만듦 → 링크 글자(읽기 전용 input) + [복사] (clipboard 실패 시 input 선택) + "이 링크는 지금만 보여요. 다시 보내려면 새 링크를 만드세요."; 켜짐(새로 고친 뒤) → "초대 링크가 켜져 있어요 (11월 20일 만듦)" + [새 링크 만들기] + [끄기]. [새 링크 만들기] 는 `confirm("지금 링크는 더 이상 쓸 수 없어요. 이미 참여한 사람은 그대로예요.")`.
- [ ] **Step 4:** 내보내기 confirm: "○○님을 내보낼까요? 링크가 켜져 있으면 다시 들어올 수 있어요. 막으려면 새 링크를 만드세요." 나가기 confirm: "이 여행에서 나갈까요? 다시 들어오려면 새 초대 링크가 필요해요."
- [ ] **Step 5:** lint·typecheck, 커밋.

### Task 7: 초대 페이지와 로그인 돌아오기

**Files:**
- Create: `src/app/invite/[token]/page.tsx`, `src/app/invite/[token]/join-button.tsx`(client, `useActionState`)
- Modify: `src/app/auth-buttons.tsx` (`GoogleSignInButton({ callbackURL = "/" }: { callbackURL?: string })`)

**Interfaces:**
- Consumes: Task 2 `isInviteToken`·`hashInviteToken`, Task 3 `getTrip`, Task 4 `findInvite`, Task 5 `joinTripAction`, Task 8 `<InAppBrowserNotice />`

- [ ] **Step 1:** `export const metadata = { referrer: "no-referrer", title: … }` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` 의 `referrer` 확인).
- [ ] **Step 2:** 페이지 분기(스펙 §5.3 의 3): 비로그인 → "초대받은 여행에 참여하려면 로그인하세요" + `<InAppBrowserNotice />` + `<GoogleSignInButton callbackURL={\`/invite/${token}\`} />`(token 은 `isInviteToken` 을 통과한 값만; 틀리면 로그인 전에도 만료 안내). 로그인 → 형식 틀림/`findInvite` null → `INVITE_INVALID` 화면 + "내 여행으로" 링크; `getTrip` 이 값 → `redirect`; 그 밖 → "○○님의 '△△' 여행 (기간) 에 함께할까요?" + `<JoinButton token />`.
- [ ] **Step 3:** `getCurrentUser` 가 요청 데이터를 읽으므로 본문은 `Suspense` 안.
- [ ] **Step 4:** lint·typecheck, 커밋.

### Task 8: 앱 안 브라우저 안내

**Files:**
- Create: `src/app/in-app-browser-notice.tsx` (client)
- Modify: `src/app/page.tsx` (로그인 버튼 위에 `<InAppBrowserNotice />`)

**Interfaces:**
- Consumes: Task 2 `detectInAppBrowser`·`kakaoOpenExternalUrl`
- Produces: `<InAppBrowserNotice />` (props 없음)

- [ ] **Step 1:** 마운트 후 effect 에서 `navigator.userAgent` 판별(서버 렌더와 첫 렌더는 아무것도 안 그림 → hydration 불일치 없음). `"kakaotalk"` → `window.location.href = kakaoOpenExternalUrl(window.location.href)` 한 번, 그리고 "브라우저에서 열었어요. 열리지 않으면 아래 버튼을 눌러 주세요." + [브라우저로 열기](같은 URL `<a>`) + [링크 복사]. `"other"` → "Google 로그인은 이 앱 안에서는 안 돼요. 크롬이나 사파리에서 열어 주세요." + [링크 복사]. `null` → 아무것도 없음.
- [ ] **Step 2:** lint·typecheck, 커밋.

### Task 9: 여행 목록 표시, 브라우저 확인, 리뷰, PR

**Files:**
- Modify: `src/app/trips/page.tsx` (`TripSection` 의 `trips: TripListItem[]`, `!trip.isOwner` 이면 카드에 "{ownerName}님의 여행")
- Modify: `docs/status.md`(머지 뒤)

- [ ] **Step 1:** 목록 표시 구현, lint·typecheck·단위 시험, 커밋.
- [ ] **Step 2:** 브라우저 확인(마이그레이션 적용 뒤, 로컬 dev, `docs/status.md` '로그인한 화면의 브라우저 확인'). 테스트 계정 A·B·C(`e2e-test-` 접두어) 넣기·지우기 SQL 은 각각 사용자 확인. 스펙 §6 의 1–7 을 차례로, Review Focus 1–5 포함. 휴대폰 너비 스크린샷 한 장(여행 화면 함께하는 사람 칸, 초대 화면).
- [ ] **Step 3:** `/code-review`, `/security-review`. 막는 지적을 고치고 다시.
- [ ] **Step 4:** PR 본문: 맨 위 "사람 확인 필요"(마이그레이션·소유권), SQL 전문, 파괴적 아님, `Closes #15`, 남은 지적(스펙 §5.3 의 6, 동시 참여로 20명 조금 초과, 실시간 반영 없음, 카톡 동작은 프로덕션 확인). draft 해제 → Codex 리뷰 → 리뷰 종료 기준. 마이그레이션 PR 이라 자동 머지는 적용 성공 뒤에 켠다.
- [ ] **Step 5:** 머지·배포 확인 뒤 `docs/status.md` 갱신(별도 docs PR), 사용자에게 새 세션 권함.
