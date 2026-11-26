# 메인 페이지와 아래 탭 (#122) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사람에게 홈(`/`) · 함께(`/together`) · 내 여행(`/mine`) 세 탭을 주고, 옛 `/trips` 목록을 이 세 화면으로 나눈다.

**Architecture:** 세 탭 화면을 route group `src/app/(tabs)/` 로 묶어 그 레이아웃에만 탭 막대를 둔다. 여행 나누기·남은 날·함께 간 사람 세기는 import 없는 순수 함수(`src/lib/trip-dates.ts`, 새 `src/lib/trip-people.ts`)로 두고 `node --test` 로 시험한다. DB 는 `listTrips` 에 칸 하나를 더하고 함께한 사람 쿼리 하나를 새로 둔다(스키마 변경 없음).

**Tech Stack:** Next.js 16 App Router(`cacheComponents: true`), React 19, Tailwind CSS 4, Drizzle ORM(neon-http), Biome, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-26-main-page-tabs-design.md`

## Global Constraints

- 스키마·마이그레이션·위험 경로(`next.config.ts`, `src/lib/session.ts`, `src/db/schema.ts`, `package.json` 등 `CLAUDE.md` '위험 경로') 변경 없음. 새 의존성 없음.
- Server Component 기본. `'use client'` 는 탭 막대와 "← 뒤로"(및 그것이 쓰는 작은 표시기)만.
- 사용자 데이터 쿼리는 `src/db/queries/<테이블>.ts`, `import "server-only"`, 첫 인자 `userId`, `accessibleTrips(userId)`(또는 `ownedTrips`)를 같은 SQL 문에. 이메일은 고르지 않는다.
- 요청 데이터(`getCurrentUser()` 등)를 읽는 컴포넌트는 `<Suspense>` 안(`cacheComponents`).
- 비로그인: `/` 는 지금 로그인 화면(탭 없음), `/together`·`/mine` 은 `redirect("/")`.
- 함께 간 사람의 `user.id` 는 서버 밖(클라이언트 컴포넌트 props, 렌더된 HTML)으로 나가지 않는다.
- `src/lib/*.ts` 순수 모듈은 다른 모듈을 import 하지 않는다.
- 색은 토큰만(`bg-surface`, `text-sub`, `border-rule`, `bg-foreground`, `text-on-ink` …). `dark:`·`zinc-*` 금지.
- 문구(스펙 그대로):
  - 함께 탭 제목 "함께 가는 여행", 설명 "다른 사람과 같이 계획하는 여행이에요. 여행이 끝나면 내 여행의 추억으로 옮겨 가요."
  - 함께 탭 빈 상태 "함께 가는 여행이 없어요" / "여행을 열고 초대 링크로 함께 갈 사람을 불러 보세요."
  - 내 여행 제목 "내 여행", 설명 "혼자 간 여행, 함께 간 여행, 떼어 낸 기록까지 내 여행을 모두 모았어요."
  - 앞으로 아래 글 "함께 가는 여행은 함께 탭에 있어요."(함께 탭에 여행이 있을 때만)
  - 칩 아래 "같은 사람과 여러 번 가도 한 명으로 세요."
  - 자리 표시 "다녀온 곳 지도" / "내가 쓴 돈", 각 "다음에 더해요"
  - 추억 빈 상태 "다녀온 여행이 아직 없어요. 여행이 끝나면 여기에 모여요."
  - 여행 없음 "아직 여행이 없어요" / "첫 여행을 만들거나, 친구에게 받은 초대 링크를 열어 함께 가는 여행에 들어가 보세요." + 버튼 "새 여행 만들기"
  - 다음 여행 없음 "다가오는 여행이 없어요" + "새 여행 만들기" + 링크 "내 여행에서 추억 보기"(`/mine`)
  - 연도 머리 "2026년 · 3번", 숫자 칸 "올해" / "모두" / "함께 간 사람", 칩 "민수 3번 함께"
- 커밋 전 `npm run lint`, `npm run typecheck`, `npm test` 통과.

## Review Focus

1. **오늘 끝나는 / 오늘 시작하는 여행**: 끝나지 않은 것으로 본다(함께 탭·앞으로·다음 여행), 하루 지나야 추억. → Task 1 시험 `groupTrips: 오늘 끝나는 여행은 아직 추억이 아니다`.
2. **같은 이름의 다른 사람, 같은 사람의 여러 여행**: 계정으로 갈라 세고 칩이 따로 나온다. → Task 2 시험 `countCompanions: 같은 이름 다른 사람은 따로`.
3. **비로그인 직접 접속**(`/together`, `/mine`, 옛 `/trips`): 오류 화면 없이 `/` 로그인 화면, 탭 막대 없음. → Task 6 브라우저 확인 목록.
4. **여행 화면을 링크로 바로 열고 "← 뒤로"**: 홈으로 간다(빈 화면·앱 밖으로 나가지 않음). → Task 5 Step, Task 6 브라우저 확인.
5. **함께하는 사람이 많은 여행**(4명 이상, 칩 13명 이상): "외 N명" 으로 줄어 줄이 넘치지 않는다. → Task 2 시험 `peopleLine: 3명 넘으면 외 N명`, `withNames: 3명 넘으면 외 N명과`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/trip-dates.ts` (수정) | `groupTrips`, `nextTripBadge` 추가 (`splitTrips` 재사용) |
| `src/lib/trip-people.ts` (새) | 함께한 사람: 여행별 이름 모으기, 서로 다른 사람 세기, 이름 줄 문구 |
| `src/db/queries/trips.ts` (수정) | `listTrips` 에 `hasMembers` |
| `src/db/queries/trip-members.ts` (수정) | `listTripCompanions(userId)` |
| `src/app/(tabs)/trip-lists.ts` (새, server-only) | 두 쿼리 + 순수 함수를 묶어 화면용 데이터 |
| `src/app/(tabs)/layout.tsx`, `tab-bar.tsx` (새) | 탭 틀, 휴대폰 아래 / 넓은 화면 위 |
| `src/app/(tabs)/page.tsx` (← `src/app/page.tsx` 옮김), `next-trip-section.tsx` (새) | 로그인 화면 또는 홈 |
| `src/app/(tabs)/together/page.tsx`, `mine/page.tsx` (새) | 두 탭 |
| `src/app/ui/trip-row.tsx` (새, ← `src/app/trips/page.tsx` 의 `TripRow`) | 목록 한 줄 |
| `src/app/trips/page.tsx` (수정) | `redirect("/")` 만 |
| `src/app/trips/[id]/back-link.tsx` (새, client) | "← 뒤로" |
| 링크·무효화 손볼 곳 | `trips/actions.ts`, `trips/member-actions.ts`, `invite/actions.ts`, `invite/[token]/page.tsx`, `trips/new/page.tsx`, `not-found.tsx`, `trips/[id]/page.tsx` |

결정(스펙에서 빌더에게 맡긴 것):
- 순수 모듈은 서로 import 할 수 없어 나누기 함수는 새 파일이 아니라 `splitTrips` 가 있는 `trip-dates.ts` 에 둔다(스펙 §5.2 의 `trip-groups.ts` 대신).
- 무효화는 `revalidatePath("/", "layout")` 한 번(세 탭과 여행 화면을 빠짐없이).
- "← 뒤로" 판별(스펙 §5.9): 탭 화면(`/`, `/together`, `/mine`)에서 여행 링크(`a[href^="/trips/"]`)를 누르면 `sessionStorage["tp:fromTab"] = "1"` 을 남긴다(탭 레이아웃의 클라이언트 컴포넌트가 document 클릭을 듣고, 누른 때의 `location.pathname` 이 탭 주소일 때만). 여행 화면의 "← 뒤로"는 마운트 때 이 표시를 읽고 바로 지운다. 표시가 있었으면 누를 때 `router.back()`(스크롤 자리 유지), 없었으면(링크로 바로 열기, 새 여행·고치기·초대를 거침) `<Link href="/">`. 양식을 거친 뒤에는 새로 마운트되며 표시가 없으므로 양식으로 돌아가지 않는다.
- 탭 막대 아래쪽은 `fixed` 가 아니라 `sticky bottom-0`(레이아웃 맨 끝, `body` 가 `min-h-full flex flex-col`). 본문을 가리지 않아 여백 계산이 필요 없다. 그러려면 `(tabs)/layout.tsx` 는 감싸는 요소 없이 fragment 로 `{top}{children}{bottom}` 을 돌려줘 `main`(flex-1)과 막대가 `body` 의 바로 아래 자식이 되게 한다.
- 내 여행 탭의 "아직 여행이 없어요"는 함께·앞으로·추억이 모두 빌 때만. 함께 여행만 있으면 추억 빈 안내 + "함께 가는 여행은 함께 탭에 있어요."(스펙 §5.5 의 빈틈, 계획 검토에서 찾음).

---

### Task 1: 여행 나누기와 다음 여행 표시 (순수 함수)

**Files:**
- Modify: `src/lib/trip-dates.ts`
- Test: `src/lib/trip-dates.test.mjs`

**Interfaces:**
- Produces:
  - `type Groupable = { startDate: string; endDate: string; createdAt: Date; hasMembers: boolean; detachedAt: Date | string | null }`
  - `groupTrips<T extends Groupable>(trips: T[], today: string): { next: T | null; together: T[]; ahead: T[]; memories: { year: string; trips: T[] }[]; memoryCount: number; thisYearCount: number }`
    - `together`: `hasMembers && endDate >= today`, `splitTrips` upcoming 순서.
    - `ahead`: `!hasMembers && endDate >= today`(기록 포함), upcoming 순서.
    - `memories`: `endDate < today`, `startDate.slice(0,4)` 로 묶고 연도 내림차순, 묶음 안은 `splitTrips` past 순서.
    - `next`: `together` ∪ `ahead` 중 `detachedAt === null` 인 것을 upcoming 순서로 첫 번째.
    - `thisYearCount`: 추억 중 `startDate` 연도 = `today` 연도.
  - `nextTripBadge(startDate: string, endDate: string, today: string): string` — 시작 전 `"D-N"`, 여행 중 `"여행 중 · N일째"`(첫날 1). 끝난 여행에는 부르지 않는다.

- [ ] **Step 1: 실패하는 시험 쓰기** (기존 `trip()` 도우미는 넷째 인자가 `createdAt` 이라 그대로 두고, 새 도우미 `t(id, startDate, endDate, { hasMembers = false, detachedAt = null } = {})` 를 따로 둔다. `createdAt` 은 고정값. `detachedAt` 기본값을 꼭 `null` 로: `undefined` 면 `next` 가 늘 null 이 된다)

```js
test("groupTrips: 표의 네 줄", () => {
  const today = "2026-11-26";
  const shared = t("shared", "2026-12-01", "2026-12-03", { hasMembers: true });
  const solo = t("solo", "2027-02-14", "2027-02-17");
  const rec = t("rec", "2026-12-10", "2026-12-11", { detachedAt: "2026-11-20T00:00:00Z" });
  const past = t("past", "2026-03-28", "2026-03-31", { hasMembers: true });
  const g = groupTrips([past, rec, solo, shared], today);
  assert.deepEqual(g.together.map((x) => x.id), ["shared"]);
  assert.deepEqual(g.ahead.map((x) => x.id), ["rec", "solo"]);
  assert.deepEqual(g.memories, [{ year: "2026", trips: [past] }]);
  assert.equal(g.next?.id, "shared");
  assert.equal(g.memoryCount, 1);
  assert.equal(g.thisYearCount, 1);
});

test("groupTrips: 모든 여행이 정확히 한 곳", () => { /* 위 네 개 + 여행 중 하나 + 지난 기록 하나: together+ahead+memories 의 id 를 모으면 입력 id 와 같고 겹침이 없다, 지난 기록은 memories 에 */ });

test("groupTrips: 오늘 끝나는 여행은 아직 추억이 아니다", () => {
  const g = groupTrips([t("a", "2026-11-24", "2026-11-26")], "2026-11-26");
  assert.equal(g.memories.length, 0);
  assert.equal(g.next?.id, "a");
});

test("groupTrips: 기록은 다음 여행이 아니다", () => {
  const rec = t("rec", "2026-11-27", "2026-11-28", { detachedAt: "2026-11-20T00:00:00Z" });
  const later = t("later", "2026-12-20", "2026-12-21");
  assert.equal(groupTrips([rec, later], "2026-11-26").next?.id, "later");
  assert.equal(groupTrips([rec], "2026-11-26").next, null);
});

test("groupTrips: 연도 묶음은 최근 먼저, 올해 세기", () => {
  // 2025-12-30–2026-01-02 여행은 시작 연도 2025 로 묶이고 올해(2026)로 세지 않는다
});

test("nextTripBadge", () => {
  assert.equal(nextTripBadge("2026-11-29", "2026-12-01", "2026-11-26"), "D-3");
  assert.equal(nextTripBadge("2026-11-27", "2026-11-28", "2026-11-26"), "D-1");
  assert.equal(nextTripBadge("2026-11-25", "2026-11-28", "2026-11-26"), "여행 중 · 2일째");
  assert.equal(nextTripBadge("2026-11-26", "2026-11-26", "2026-11-26"), "여행 중 · 1일째");
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: `groupTrips is not a function` 등으로 FAIL

- [ ] **Step 3: `groupTrips`·`nextTripBadge` 구현** (`splitTrips`·`utcDay` 재사용, 파일 머리 주석은 그대로)

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: PASS(모든 시험)

- [ ] **Step 5: 커밋** — `git commit -m "여행 나누기(함께·앞으로·추억)와 다음 여행 표시 (#122)"`

---

### Task 2: 함께한 사람 (순수 함수)

**Files:**
- Create: `src/lib/trip-people.ts`
- Test: `src/lib/trip-people.test.mjs`

**Interfaces:**
- Produces:
  - `type CompanionRow = { tripId: string; userId: string; name: string }` (여행 안 순서대로 들어온다)
  - `namesByTrip(rows: CompanionRow[]): Map<string, string[]>` — 여행마다 이름, 들어온 순서, 같은 여행 같은 사람 한 번.
  - `countCompanions(rows: CompanionRow[], tripIds: Iterable<string>): { name: string; count: number }[]` — `tripIds` 에 든 여행만, `userId` 로 가른 서로 다른 사람, 횟수 = 그 사람이 든 여행 수. 정렬: 횟수 내림차순, 같으면 `name.localeCompare(other, "ko")`. 결과에 `userId` 없음.
  - `peopleLine(names: string[]): string | null` — `"민수 · 지영 · 수진"`, 4명 이상이면 `"민수 · 지영 · 수진 외 2명"`, 없으면 null.
  - `withNames(names: string[]): string | null` — `"민수님, 지영님과"`, 4명 이상이면 `"민수님, 지영님, 수진님 외 2명과"`, 없으면 null.

- [ ] **Step 1: 실패하는 시험 쓰기**

```js
const rows = [
  { tripId: "t1", userId: "u1", name: "민수" },
  { tripId: "t1", userId: "u2", name: "지영" },
  { tripId: "t2", userId: "u1", name: "민수" },
  { tripId: "t3", userId: "u3", name: "민수" }, // 이름만 같은 다른 사람
  { tripId: "t9", userId: "u4", name: "수진" }, // 추억이 아닌 여행
];

test("countCompanions: 서로 다른 사람, 여행 수, 정렬", () => {
  assert.deepEqual(countCompanions(rows, ["t1", "t2", "t3"]), [
    { name: "민수", count: 2 },
    { name: "민수", count: 1 },
    { name: "지영", count: 1 },
  ]);
});

test("countCompanions: 같은 이름 다른 사람은 따로", () => {
  assert.equal(countCompanions(rows, ["t2", "t3"]).length, 2);
});

test("countCompanions: 결과에 userId 가 없다", () => {
  for (const p of countCompanions(rows, ["t1"])) assert.deepEqual(Object.keys(p).sort(), ["count", "name"]);
});

test("countCompanions: 같은 여행에 같은 사람이 두 번 와도 1", () => { /* t1 에 u1 행 두 개 → count 1 */ });

test("namesByTrip", () => {
  assert.deepEqual(namesByTrip(rows).get("t1"), ["민수", "지영"]);
});

test("peopleLine: 3명 넘으면 외 N명", () => {
  assert.equal(peopleLine(["가", "나", "다", "라", "마"]), "가 · 나 · 다 외 2명");
  assert.equal(peopleLine(["가"]), "가");
  assert.equal(peopleLine([]), null);
});

test("withNames: 3명 넘으면 외 N명과", () => {
  assert.equal(withNames(["민수", "지영"]), "민수님, 지영님과");
  assert.equal(withNames(["가", "나", "다", "라"]), "가님, 나님, 다님 외 1명과");
  assert.equal(withNames([]), null);
});
```

- [ ] **Step 2: 실패 확인** — `npm test` / FAIL(모듈 없음)
- [ ] **Step 3: 구현** (파일 머리 주석: 함께한 사람 이름·세기, `node --test` 라 import 없음, userId 는 세기에만 쓰고 돌려주지 않음)
- [ ] **Step 4: 통과 확인** — `npm test` / PASS
- [ ] **Step 5: 커밋** — `git commit -m "함께한 사람 세기와 이름 줄 (#122)"`

---

### Task 3: 쿼리와 화면용 데이터

**Files:**
- Modify: `src/db/queries/trips.ts` (`listTrips`, `TripListItem`)
- Modify: `src/db/queries/trip-members.ts`
- Create: `src/app/(tabs)/trip-lists.ts`

**Interfaces:**
- Consumes: Task 1 `groupTrips`, Task 2 `CompanionRow`, `namesByTrip`, `countCompanions`.
- Produces:
  - `TripListItem` 에 `hasMembers: boolean` (`EXISTS (SELECT 1 FROM trip_members WHERE trip_id = trips.id)`).
  - `listTripCompanions(userId: string): Promise<CompanionRow[]>` (trip-members.ts) — 세 출처를 한 문(`unionAll`, `drizzle-orm/pg-core`)으로, 각 가지는 `trips` 를 별칭 없이 FROM 에:
    1. 기록 아닌 접근 가능 여행의 주인(`trips.user_id <> userId`, `detached_at IS NULL`, `accessibleTrips(userId)`), 순서 키 0
    2. 접근 가능 여행의 멤버(`trip_members.user_id <> userId`, `accessibleTrips(userId)`), 순서 키 1 + `joined_at`
    3. 내 기록 여행의 동행(`ownedTrips(userId)`, `detached_at IS NOT NULL`, `trip_record_companions`), `was_owner` 먼저
    결과를 `trip_id`, 순서 키, `joined_at`, 이름 순으로. `user.email` 은 고르지 않는다.
  - `loadTripLists(userId: string, today: string): Promise<TripLists>` (trip-lists.ts, `import "server-only"`):
    ```ts
    type ListedTrip = TripListItem & { people: string[] }; // 나를 뺀 함께한 사람 이름, 순서대로
    type TripLists = ReturnType<typeof groupTrips<ListedTrip>> & { companions: { name: string; count: number }[] };
    ```
    `Promise.all([listTrips, listTripCompanions])` → `namesByTrip` 로 `people` 붙이기 → `groupTrips` → 추억 여행 id 로 `countCompanions`. `CompanionRow` 는 이 함수 밖으로 나가지 않는다.

- [ ] **Step 1: `listTrips` 에 `hasMembers` 추가**, 지금 `/trips` 화면이 그대로 컴파일되는지 — Run: `npm run typecheck` / Expected: 오류 없음
- [ ] **Step 2: `listTripCompanions` 구현** — 주석에 세 출처와 "user id 는 서버 집계에만, 화면으로 넘기지 않음(#103)" 을 적는다. 세 가지의 칸은 이름·타입을 맞추고 별칭을 단다(`trip_id`, `user_id`, `name`, `ord`, `joined_at` — 첫 가지·셋째 가지의 `joined_at` 은 `sql<Date | null>\`NULL::timestamptz\``). set operation 의 정렬은 결과 칸 이름으로(`orderBy(sql\`trip_id, ord, joined_at NULLS FIRST, name\`)` 처럼) 한다. 테이블 이름이 붙은 칸으로 정렬하면 실행 때 "column does not exist" 가 날 수 있다.
- [ ] **Step 2b: PGlite 로 SQL 확인** — scratchpad 에 하네스(커밋 안 함): `@electric-sql/pglite` 를 scratchpad 에 설치, `drizzle/*.sql` 을 차례로 적용, 시드(나 = A; A 주인·B 멤버 여행, C 주인·A 멤버 여행, A 의 기록(동행 B was_owner, D), A 와 상관없는 E 의 여행(F 멤버)). `listTripCompanions` 가 만드는 SQL(`.toSQL()` 또는 같은 쿼리를 `drizzle-orm/pglite` 로)을 실행해 확인: A 는 결과에 없음, E·F 여행은 없음, C 여행에서는 C 만, 기록에서는 B(먼저)·D, 여행 안 순서가 주인 → 참여 순.
- [ ] **Step 3: `loadTripLists` 구현**
- [ ] **Step 4: 확인** — Run: `npm run typecheck && npm run lint` / Expected: 오류 없음. 쿼리 결과 확인은 Task 6 브라우저 확인(테스트 계정 두 개, 함께 여행·기록 하나씩)에서 한다.
- [ ] **Step 5: 커밋** — `git commit -m "함께한 사람 쿼리와 탭 화면 데이터 (#122)"`

---

### Task 4: 탭 틀과 홈

**Files:**
- Create: `src/app/(tabs)/layout.tsx`, `src/app/(tabs)/tab-bar.tsx`, `src/app/(tabs)/next-trip-section.tsx`
- Move: `src/app/page.tsx` → `src/app/(tabs)/page.tsx` (`git mv`, import 경로 `./auth-buttons` → `../auth-buttons`, `./in-app-browser-notice` → `../in-app-browser-notice`)
- Modify: `src/app/trips/page.tsx` → 기본 내보내기가 `redirect("/")` 만 하는 페이지

**Interfaces:**
- Consumes: Task 3 `loadTripLists`, Task 1 `nextTripBadge`, `withNames`(Task 2), `MiniLine`, `recordBadge`.
- Produces:
  - `TabBar({ placement }: { placement: "top" | "bottom" })` — client, `usePathname()` 로 현재 칸(`/` 는 정확히 `/` 일 때만, 나머지는 `startsWith`). 칸 `[{ href: "/", label: "홈" }, { href: "/together", label: "함께" }, { href: "/mine", label: "내 여행" }]`, 시안의 인라인 선 SVG(`aria-hidden`), `aria-current="page"`, `<nav aria-label="주 메뉴">`.
    - `bottom`: `sm:hidden sticky bottom-0 z-30 grid grid-cols-3 border-t border-rule bg-background pb-[env(safe-area-inset-bottom)]`, 칸 `min-h-14`.
    - `top`: `hidden sm:block`, 머리 한 줄(앱 이름 + 세 칸 + "+ 새 여행" + `SignOutButton`), `max-w-2xl` 가운데.
  - `TripLinkMarker()` — client, `(tabs)/trip-link-marker.tsx`, 아무것도 그리지 않는다. 마운트 때 document 에 click 리스너(언마운트 때 제거): 누른 곳의 가장 가까운 `a[href^="/trips/"]` 가 있고 `location.pathname` 이 `/`·`/together`·`/mine` 중 하나면 `sessionStorage.setItem("tp:fromTab", "1")`. `try/catch`(저장 막힘). 레이아웃의 `bottom` TabNav 와 같은 Suspense 안(로그인일 때만)에 둔다.
  - `(tabs)/layout.tsx`: `children` 위에 `<Suspense fallback={null}><TabNav placement="top" /></Suspense>`, 아래에 `placement="bottom"`. `TabNav` 는 서버 컴포넌트로 `getCurrentUser()` 가 null 이면 null.
  - `NextTripSection({ userId }: { userId: string })` — 서버 컴포넌트, 스펙 §5.3 카드와 두 빈 상태.
- 홈(`(tabs)/page.tsx`, 로그인): 휴대폰 머리(앱 이름 + "+ 새 여행" + 로그아웃, `sm:hidden`) 아래 칸들을 차례로: 지금은 `<Suspense><NextTripSection userId=… /></Suspense>` 하나. 파일 주석에 "홈은 칸을 쌓는다. 홈만의 기능은 칸 하나로 더한다(#122)".
- `(tabs)/page.tsx` 구조: 지금은 가운데 정렬 `main`·큰 노선·h1 이 Suspense 밖에 있다. 이를 바꿔 `main` 전체를 Suspense 안 서버 컴포넌트가 로그인 여부로 고른다 — 비로그인이면 지금 로그인 `main` 그대로, 로그인이면 홈 `main`(`mx-auto w-full max-w-2xl flex-1 …`). fallback 은 중립 문구("불러오는 중…"). 지금의 `redirect("/trips")` 와 그 주석은 지운다.

- [ ] **Step 1: `git mv` 로 홈 옮기기, `(tabs)/layout.tsx`·`tab-bar.tsx` 만들기**
- [ ] **Step 2: `NextTripSection` 과 홈 화면**
- [ ] **Step 3: `src/app/trips/page.tsx` 를 `redirect("/")` 로** (지금 목록 코드는 Task 5 의 `TripRow` 로 옮긴 뒤 지운다. 이 단계에서는 `TripRow` 를 먼저 `src/app/ui/trip-row.tsx` 로 옮겨 둔다)
- [ ] **Step 4: 확인** — Run: `npm run typecheck && npm run lint && npm run build` / Expected: 오류 없음, 빌드 출력에 `/`, `/trips`(redirect) 경로
- [ ] **Step 5: 커밋** — `git commit -m "아래 탭 틀과 홈(다음 여행), /trips 는 / 로 (#122)"`

---

### Task 5: 함께 탭, 내 여행 탭, 링크 정리

**Files:**
- Create: `src/app/(tabs)/together/page.tsx`, `src/app/(tabs)/mine/page.tsx`, `src/app/trips/[id]/back-link.tsx`
- Modify: `src/app/ui/trip-row.tsx`(Task 4 에서 옮긴 것), `src/app/trips/[id]/page.tsx`, `src/app/trips/actions.ts`, `src/app/trips/member-actions.ts`, `src/app/invite/actions.ts`, `src/app/invite/[token]/page.tsx`, `src/app/trips/new/page.tsx`, `src/app/not-found.tsx`, `src/lib/trip-records.ts`(+ test)

**Interfaces:**
- Consumes: Task 3 `loadTripLists`/`ListedTrip`, Task 2 `peopleLine`, `withNames`, Task 1 결과 모양.
- Produces:
  - `TripRow({ trip, today, line, dim }: { trip: ListedTrip; today: string; line?: string | null; dim?: boolean })` — 지금 모양(제목 + 이름표, "목적지, 기간 · 남은 날", 노선). `line` 은 셋째 줄(함께 탭의 `peopleLine`), 추억 줄은 둘째 줄 끝에 `· withNames(...)`.
  - `BackLink()` — client. 늘 `<Link href="/">← 뒤로</Link>` 로 그린다(JS 없이도 동작). 마운트 때 `sessionStorage["tp:fromTab"]` 을 읽어 state 에 두고 바로 지운다. state 가 참이면 onClick 에서 `preventDefault()` 후 `router.back()`.
- 함께 탭·내 여행 탭은 스펙 §5.4·§5.5 그대로(문구는 Global Constraints). 각 페이지: 비로그인 `redirect("/")`, 머리(h1 + 설명 + 휴대폰에서만 "+ 새 여행").
- 칩은 12명까지, 13명 이상이면 12명 + "외 N명" 칩. 함께 간 사람이 0명이면 칩 줄 감춤(숫자 칸 "0명").

- [ ] **Step 1: 함께 탭 페이지**
- [ ] **Step 2: 내 여행 탭 페이지**
- [ ] **Step 3: `BackLink` 와 여행 화면의 "← 내 여행" 바꾸기**
- [ ] **Step 4: `/trips` 를 가리키던 곳 바꾸기**
  - `revalidatePath("/trips")` (actions.ts 3곳, member-actions.ts, invite/actions.ts) → `revalidatePath("/", "layout")`
  - `redirect("/trips")` (actions.ts 여행 지우기, member-actions.ts 나가기) → `redirect("/")`
  - `cancelHref="/trips"`, not-found 의 링크(문구 "내 여행으로" → "홈으로"), invite 의 `signedIn ? "/trips"`(문구 "내 여행으로" → "홈으로") → `/`
  - 확인 — Run: `grep -rn '"/trips"' src` / Expected: 출력 없음
- [ ] **Step 5: 안 쓰게 된 `splitRecords` 와 그 시험 지우기** — Run: `grep -rn splitRecords src` / Expected: 출력 없음
- [ ] **Step 6: 확인** — Run: `npm test && npm run typecheck && npm run lint && npm run build` / Expected: 모두 통과, 빌드에 `/together`, `/mine`
- [ ] **Step 7: 커밋** — `git commit -m "함께·내 여행 탭, 여행 화면 뒤로, /trips 링크 정리 (#122)"`

---

### Task 6: 브라우저 확인과 리뷰

**Files:** 없음(고칠 것이 나오면 해당 파일)

- [ ] **Step 1: 테스트 계정** — `docs/status.md` '로그인한 화면의 브라우저 확인'·'소유권 브라우저 확인' 방법으로 `e2e-test-` 계정 두 개(A, B)와 여행을 넣는다(넣기 전 SQL 전문을 사용자에게 보이고 확인). 날짜는 오늘 기준으로 정한다: A 주인·B 멤버 앞으로(오늘+3 ~ +5, 혼자 여행보다 먼저 시작해야 다음 여행 카드가 이것), A 혼자 앞으로(+60 ~ +63), A·B 함께 지난 여행(올해 시작, 끝이 오늘 전), A 의 기록(동행 B, 올해 시작, 끝이 오늘 전).
- [ ] **Step 2: `run` 스킬로 dev 서버, Playwright 확인** (휴대폰 390×844, 넓은 1280×800, 다크 모드 하나)
  - 홈: 다음 여행 카드(D-N, "B님과 함께"), 로그아웃 버튼
  - 함께 탭: 함께 여행 1개, 이름 줄 "B"; 내 여행 탭: 앞으로 1, 추억 2(기록 이름표), 숫자 "올해 2번"/"모두 2번"/"함께 간 사람 1명", 칩 "B 2번 함께"
  - 탭 이동과 `aria-current`, 휴대폰 아래 막대가 마지막 줄을 가리지 않음(끝까지 내려 마지막 줄 `getBoundingClientRect().bottom` ≤ 막대 top), 넓은 화면은 위쪽 머리
  - 여행 화면: 탭 없음, 예산 줄 그대로, 내 여행 탭을 내려 여행을 열고 "← 뒤로" → `/mine` 의 같은 스크롤 자리; 새 탭에서 여행 주소 바로 열고 "← 뒤로" → `/`; 여행 → 고치기 → 저장 → "← 뒤로" → `/`(양식으로 가지 않음)
  - `cacheComponents` 는 지나온 화면을 `display:none` 으로 DOM 에 남긴다. 탭 없음·`aria-current`·크기 확인은 `getByRole`(숨은 요소 제외)이나 `:visible` 로만 한다(`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md` 'Testing'). user id 검색은 숨은 DOM 까지 보는 `page.content()` 그대로.
  - 비로그인(쿠키 없음): `/` 로그인 화면·탭 없음, `/together`·`/mine`·`/trips` → `/`
  - B 로 로그인: 홈 카드에 A 의 여행이 "A님의 여행" 이름표로, 함께 탭 이름 줄 "A"
  - 빈 상태: 여행 없는 계정 C → 홈 "아직 여행이 없어요", 함께 탭·내 여행 탭 빈 안내; C 에 지난 여행 하나를 넣고 → 홈 "다가오는 여행이 없어요" + "내 여행에서 추억 보기", 칩 줄 감춤·"0명"
  - 렌더된 HTML 에 B 의 `user.id` 가 없는지: `page.content()` 에 `e2e-test-` id 문자열 검색 / Expected: 없음
- [ ] **Step 3: 테스트 계정 지우기**(SQL 전문을 보이고 확인)
- [ ] **Step 4: `/code-review`, `/security-review`**(새 소유권 쿼리), 막는 지적이 0건이 될 때까지 고치고 다시 리뷰
- [ ] **Step 5: 커밋·push, PR 본문 갱신**(`Closes #122`, 위험 경로 없음, 남은 지적), draft 해제 → Codex 리뷰 결과를 본 뒤 자동 머지
