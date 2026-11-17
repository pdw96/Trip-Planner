# AI-Native 개발 흐름 설계

- 날짜: 2026-11-17
- 상태: 초안 (사람 승인 전)

## 1. 의도

이 프로젝트를 Claude가 끝까지 굴리고, 사람은 꼭 필요한 곳에서만 검수하는 방식으로 바꾼다.

프로젝트 전용 스킬·서브에이전트·훅은 모델이 좋아질수록 낡은 짐이 된다. 그래서 다음 원칙을 따른다.

- 공식 도구(Claude Code 기본 기능, superpowers 같은 공식 플러그인, GitHub·Vercel 기본 기능)를 중심에 둔다.
- 직접 만든 것은 최소로 남긴다.
- 남기는 것은 나중에 덜어내기 쉬운 형태로 둔다.

사용자는 본인과 지인 2명이다. 그중 한 명에게 실사용 후기를 부탁해 둔 상태이고, 후기는 카카오톡이나 전화로 사용자에게 직접 온다.

## 2. 목표 / 비목표 / 반목표

**목표**
- 후기가 이슈가 되고, 이슈가 배포까지 가는 흐름을 Claude가 진행한다. 사람이 개입하는 곳은 세 곳뿐이다.
  1. 할 이슈 고르기
  2. 기능의 설계 문서 승인
  3. 위험한 변경이 담긴 PR 승인
- 위험하지 않은 PR은 CI와 자동 리뷰를 통과하면 자동으로 머지되고, 바로 프로덕션에 배포된다.
- `.claude/`의 직접 만든 스킬·에이전트·훅을 지우거나 공식 수단으로 옮긴다. 남은 프로젝트 지식은 `CLAUDE.md`에 짧게 둔다.

**비목표**
- GitHub Actions 안에서 Claude를 돌리는 것. Claude Code 공식 Action, PR 자동 리뷰 Action이 여기에 해당하며, 나중에 필요하면 붙인다.
- 앱 안에 피드백 양식을 넣는 것.
- 테스트 프레임워크를 도입하는 것. 별도 작업으로 다룬다.
- 앱 기능 개발 자체.

**반목표.** 아래처럼 되면 실패로 본다.
- 직접 만든 설정을 지운 자리를 더 크고 복잡한 직접 만든 자동화로 채우는 것. 예를 들어 긴 단계별 프롬프트를 담은 Action은 안 된다.
- 사람이 보지 않은 마이그레이션이 프로덕션 DB에 적용되는 것.
- 사람 승인 게이트를 Claude가 스스로 조용히 약하게 만들 수 있는 구조.
- 사람이 매 PR마다 개입해야 하는 구조. 이렇게 되면 AI-Native라는 의도가 무너진다.

## 3. 제약

- **GitHub:** 저장소 `pdw96/Trip-Planner`는 public이다. 그래서 무료 플랜에서도 브랜치 보호 규칙(ruleset)과 자동 머지를 쓸 수 있다.
- **PR 작성자:** Claude가 여는 PR과 GitHub 작업은 사용자 계정(`pdw96`) 이름으로 기록된다. 지금까지의 PR이 모두 그렇다.
  - 따라서 GitHub의 "Approve" 리뷰로는 사람 승인을 표현할 수 없다. 자기 PR은 승인할 수 없기 때문이다.
  - 같은 이유로, 라벨을 붙인 주체가 사람인지 Claude인지 GitHub에서 구분할 수 없다.
- **배포:** Vercel이 `main`을 프로덕션에 배포하고, PR마다 프리뷰 배포를 만든다. 롤백은 Vercel 대시보드의 Instant Rollback으로 한다.
- **DB:** Neon `main` 브랜치가 프로덕션 DB다. 클라우드 세션의 `DATABASE_URL`도 이 DB를 가리킨다(`CLAUDE.md` '환경').
- **이슈 공개 범위:** 저장소가 public이므로 이슈도 공개된다. 후기 원문에 지인의 이름, 연락처 같은 개인 정보가 들어가면 안 된다.
- **기존 규칙 유지:** `CLAUDE.md`의 규칙은 그대로 유지한다. Better Auth 테이블 불변, 마이그레이션 손수정 금지, 파괴적 마이그레이션 보고 등이 여기에 해당한다.

## 4. 고려한 방식

| 방식 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A. Claude 세션 중심 (선택)** | 사용자가 Claude 앱에서 이슈를 지정하면 세션이 superpowers로 설계·계획·구현·`/code-review`·PR·자동 머지를 진행한다. GitHub에서는 Claude가 돌지 않고 정해진 규칙의 검사만 돈다. | 부품이 가장 적다. 시크릿이나 추가 비용이 없다. 설계 대화를 휴대폰에서 자연스럽게 할 수 있다. | 사람이 시작해야 움직인다. 다만 "이슈 고르기"가 원래 사람이 하는 단계라 문제가 되지 않는다. |
| B. GitHub Actions 중심 | 이슈에 `@claude`를 달면 공식 Action이 구현하고, PR마다 Action이 리뷰한다. | 완전히 이벤트로 움직이고, 기록이 GitHub에 남는다. | 저장소 시크릿에 토큰이 필요하다. 설계 대화를 이슈 코멘트로 해야 해서 불편하다. 플러그인을 따로 설정해야 한다. |
| C. 혼합 | A에 PR 자동 리뷰 Action만 더한다. | 작성 세션과 완전히 독립된 리뷰어가 생긴다. | 부품과 시크릿이 늘어난다. `/code-review`가 이미 별도 맥락으로 돌기 때문에 지금 규모에서는 얻는 게 작다. |

사용자는 A를 선택했다. 가장 가볍고 덜어내기 쉽다는 방향에 맞기 때문이다. 사용자가 늘거나 혼자 굴러가는 흐름이 필요해지면 C의 리뷰 Action을 그때 붙인다.

## 5. 사용자가 정한 것

- **검수 지점(C안):** 기능은 사람이 설계를 승인하고, 그 뒤는 Claude가 끝까지 진행한다. 위험한 변경은 사람이 PR을 승인해야 머지된다.
- **위험한 변경의 범위:**
  1. DB 마이그레이션
  2. 인증·권한 코드
  3. 프로덕션에 영향을 주는 설정

  그 밖의 PR은 자동 머지되고 바로 배포된다. 사용자 3명 규모이므로 잠깐의 문제는 롤백으로 감당한다.
- **줄이는 원칙:**
  - 모델이 똑똑해지면 필요 없어질 것은 지운다. 예: 버전별 API 리뷰어, 화면 만드는 절차 스킬.
  - 모델 성능과 무관한 사고 방지 장치는 남기되 공식 수단으로 옮긴다. 수단은 `settings.json` 권한, GitHub 브랜치 보호, CI다.
  - 프로젝트 고유 규칙은 `CLAUDE.md`에 몇 줄로 남긴다.
- **자동화 공정:** 뼈대(언제 돌고, 어디서 멈추고, 무엇을 통과해야 하는가)는 공식 부품으로 단단하게 만든다. 그 안의 지시는 한두 줄로 둔다.
- **후기 입구:** 사용자 본인이 입구다. 카톡 내용이나 통화 메모를 Claude 앱 세션에 넣으면 Claude가 이슈로 정리한다.

## 6. 설계

### 6.1 전체 흐름

```
후기(카톡·전화) → 사용자가 Claude 앱에 붙여 넣기
  → Claude가 GitHub 이슈로 정리 (bug / enhancement 판단, 재현 방법, 원인 후보)
  → [사람] 할 이슈를 고른다: "이슈 3, 5 진행해"
  → 그 세션이 이슈마다 새 Claude 세션을 하나씩 띄운다(create_session). 각 세션이 자기 PR을 끝까지 맡는다.
       기능: superpowers 브레인스토밍 → [사람] 설계 문서 승인 → 계획 → 구현
       버그: 바로 구현 (superpowers:systematic-debugging)
  → 검증(lint · typecheck · 필요하면 브라우저 확인) → /code-review → PR (본문에 "Closes #N")
  → CI: lint · typecheck · human-gate, Vercel 프리뷰 빌드
       위험 경로를 건드렸으면 → [사람] 확인 후 `human-approved` 라벨
  → 자동 머지(squash) → Vercel 프로덕션 배포 → 이슈 자동 종료
  → 사용자가 지인에게 "다시 써 봐"
```

### 6.2 후기 → 이슈

`CLAUDE.md`에 짧은 절차로 둔다. 별도 스킬은 만들지 않는다.

- 한 후기에 여러 건이 섞여 있으면 이슈 여러 개로 쪼갠다.
- 라벨:
  - 출처: `feedback`
  - 종류: `bug` 또는 `enhancement` 중 하나. 이 판단은 Claude가 하고, 근거를 본문에 적는다.
- 본문 구성:
  - 요약
  - 원문. 개인 정보를 지우고 "지인 A"처럼 익명으로 쓴다.
  - 재현 방법(버그인 경우)
  - Claude가 코드에서 찾은 원인 후보와 관련 파일
- 이슈를 만든 뒤 사용자에게 목록을 한 줄씩 보여 준다. 무엇을 할지는 사용자가 고른다.

### 6.3 이슈 → PR

`CLAUDE.md`의 "작업 흐름" 절에 적는다.

- **설계 여부:**
  - `enhancement`는 superpowers 브레인스토밍으로 설계 문서를 만들고, 사람이 승인한 뒤 진행한다.
  - `bug`는 설계 없이 진행한다.
  - 버그를 고치는 데 동작이나 화면을 바꾸는 결정이 필요하다면, 진행하기 전에 사용자에게 묻는다.
- **PR 전 검증:**
  - `npm run lint`, `npm run typecheck`
  - UI 변경은 브라우저로 확인한다. 기본 제공 `run` 스킬과 Playwright·next-devtools MCP를 쓴다.
  - `/code-review`
  - 인증·소유권 코드를 건드렸다면 `/security-review`도 돌린다.
- **PR:**
  - 본문에 `Closes #N`을 넣는다. 머지되면 이슈가 자동으로 닫히므로 "반영됨" 알림을 따로 만들지 않는다.
  - 자체 리뷰가 끝나면 draft를 해제하고 GitHub 자동 머지(squash)를 켠다. 마이그레이션 PR은 예외이고, 6.6을 따른다.
  - 위험 경로를 건드렸다면 PR 본문 맨 위에 "사람 확인 필요"와 그 이유를 적는다. 마이그레이션이라면 SQL 전문과 파괴적 여부 판정을 함께 적는다.
- **PR 이후:** 세션은 PR을 구독(`subscribe_pr_activity`)한다. CI 실패나 코멘트가 오면 고친다.
- **Claude가 하지 않는 것:** `human-approved` 라벨을 붙이거나 떼지 않는다.

### 6.4 사람 승인 게이트 (`human-gate`)

기존 CI 워크플로(`.github/workflows/ci.yml`)에 job 하나를 더한다. Claude를 부르지 않는, 정해진 규칙만 따르는 검사다.

**위험 경로**

| 분류 | 경로 |
|---|---|
| 마이그레이션 | `drizzle/**`, `src/db/schema.ts` |
| 인증·권한 | `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/app/api/auth/**` |
| 프로덕션 설정 | `next.config.ts`, `.env.example`, `package.json`, `package-lock.json` |
| 마이그레이션·DB 연결 설정 | `drizzle.config.ts`, `src/db/index.ts` |
| 배포·요청 경계 | `vercel.json`, `src/proxy.ts` (생기면) |
| 게이트·검사 자신 | `.github/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `biome.json`, `tsconfig.json` |

게이트·검사 자신의 경로를 넣는 이유는, Claude가 게이트·권한 규칙·lint·typecheck 기준을 조용히 약하게 만들지 못하게 하기 위해서다. 이 파일들은 드물게 바뀌므로 사람의 손이 크게 늘지 않는다고 판단했다. *(Claude의 판단)*

**동작**
- PR이 위험 경로를 하나라도 바꿨고 `human-approved` 라벨이 없으면 실패한다. 실패 메시지에는 걸린 파일 목록을 보여 준다.
- 위험 경로가 없으면 통과한다.
- 다음 PR 이벤트에서 다시 실행된다: `opened`, `synchronize`, `reopened`, `labeled`, `unlabeled`, `edited`(기준 브랜치 변경 등).
- 승인은 **라벨이 붙은 순간의 위험 변경**에 묶인다. 라벨이 붙으면 그때 PR 쪽 위험 변경의 해시를 github-actions 봇 코멘트로 기록한다. 이후 모든 실행은 지금의 위험 변경을 그 기록과 비교한다. 다르거나 기록이 없으면 `human-approved` 라벨을 떼고 실패한다. 사람이 본 위험 변경과 머지되는 위험 변경이 같아야 하기 때문이다. *(Claude의 판단, 최종 리뷰 반영)*
  - 직전 push와만 비교하면 안 된다. 중간 실행이 취소되거나 생략되면 승인 해제가 빠지기 때문이다.
  - 해시는 문맥 없는 diff에서 blob 해시와 줄 번호를 지우고 계산한다. 그래서 `main`이 같은 파일의 다른 줄을 고친 뒤 병합해도 승인이 유지된다.
  - `main`을 브랜치에 병합하는 것만으로는 무효가 되지 않는다. 그 병합으로 들어온 `main` 쪽 변경, 그리고 위험하지 않은 파일만 고친 push도 마찬가지다.
  - 이렇게 정한 이유가 있다. 이슈 세션 여러 개가 동시에 돌면 다른 PR이 머지될 때마다 브랜치를 갱신하게 되는데, 그때마다 사람이 다시 승인하게 만들지 않기 위해서다.
- 워크플로는 `pull_request_target`으로 실행한다. 그래서 게이트의 워크플로와 스크립트는 PR이 아니라 `main` 쪽 것이 쓰인다. PR이 게이트 자신을 고쳐 스스로 통과시키지 못하게 하기 위해서다. PR의 코드는 실행하지 않고 git 객체만 비교한다. *(Claude의 판단, 최종 리뷰 반영)*

**알려진 한계**
- 라벨을 붙인 사람이 사용자인지 Claude인지 GitHub에서 구분할 수 없다(3장).
- 이 게이트는 Claude의 실수와 망각은 막지만, 의도적인 우회는 막지 못한다. 그 부분은 `CLAUDE.md` 규칙과 Claude Code의 기본 행동 규범에 맡긴다.
- 소유권 검사(`userId`로 범위 좁히기)는 여러 파일에 흩어져 있어 경로로 잡을 수 없다. 이 부분은 `/code-review`, `/security-review`, `CLAUDE.md` 규칙이 맡는다.

### 6.5 GitHub 저장소 설정

**`main` ruleset**
- 머지는 PR로만 한다.
- 필수 상태 검사:
  - CI의 lint·typecheck job
  - `human-gate`
  - Vercel 프리뷰 배포 검사. Vercel이 만드는 실제 검사 이름은 구현할 때 확인한다.
- "머지 전 브랜치 최신화(up to date)" 요구는 끈다. 켜면 동시에 진행 중인 PR이 서로를 계속 막는다. 사용자 3명 규모에서는 머지 후 충돌을 프로덕션 롤백으로 감당한다. *(Claude의 판단)*
- 강제 push와 브랜치 삭제를 금지한다.
- bypass를 두지 않는다.

**저장소 옵션**
- "Allow auto-merge" 켜기
- "Automatically delete head branches" 켜기
- 머지 방식은 squash만 허용

**라벨:** `human-approved`, `feedback`, `bug`, `enhancement`. 뒤의 둘은 기본 라벨이 있으면 그대로 쓴다.

### 6.6 마이그레이션 적용

사용자는 "라벨 + 그 자리에서 한 번 더 확인"을 골랐다.

**순서**
1. 마이그레이션이 든 PR(`drizzle/**`에 새 파일)에는 Claude가 **자동 머지를 켜지 않는다**.
   - 라벨이 붙는 즉시 머지·배포되어, 컬럼이 없는 DB 위에서 새 코드가 도는 일을 막기 위해서다.
2. 사람이 PR 본문의 SQL과 파괴적 여부 판정을 보고 `human-approved` 라벨을 붙인다.
3. 그 PR을 맡은 세션이 라벨 이벤트를 받는다(PR 구독). 사용자가 그 세션에 "진행"이라고 말해도 된다.
4. 세션은 `npm run db:migrate`를 실행한다.
   - `settings.json`의 `permissions.ask` 때문에 실행 직전에 사람 확인이 뜬다.
   - 사람이 승인하면 프로덕션 DB에 적용된다.
5. 적용이 성공하면 Claude가 자동 머지를 켠다.

**예외와 실패**
- 파괴적 마이그레이션(DROP, 타입 변경, NOT NULL 추가)은 기존 규칙대로 PR을 열기 전에 멈추고 보고한다. 적용 순서도 사람과 정한다.
- 적용은 됐는데 PR이 머지되지 못할 수 있다(CI 실패, 충돌 등).
  - 추가형 변경이라면 프로덕션 DB가 `main`보다 앞서 있어도 기존 코드가 그대로 동작하므로 괜찮다. 세션은 PR을 고쳐서 마저 머지한다. *(Claude의 판단)*
  - PR을 포기하게 되면 적용된 변경을 되돌리는 방법을 사용자에게 보고한다.

### 6.7 `.claude/` 정리

| 현재 | 처리 | 대체 |
|---|---|---|
| `agents/next16-api-reviewer.md` | 삭제 | `AGENTS.md`(Next 공식, 번들 문서를 가리킴), next-devtools·context7 MCP |
| `agents/rsc-boundary-reviewer.md` | 삭제 | `/code-review`가 `CLAUDE.md` 규칙을 기준으로 리뷰 |
| `agents/authz-reviewer.md` | 삭제 | `/security-review`, `/code-review`, `CLAUDE.md` 인가 규칙 |
| `agents/migration-reviewer.md` | 삭제 | 사람 승인 게이트, PR 본문의 SQL과 파괴적 판정(6.3) |
| `skills/pre-pr` | 삭제 | superpowers의 `verification-before-completion`·`requesting-code-review`, `/code-review` |
| `skills/new-route`, `skills/server-action` | 삭제 | 핵심 규칙 몇 줄을 `CLAUDE.md`로(6.8). 나머지는 번들 문서와 기존 코드 |
| `skills/new-migration` | 삭제 | `CLAUDE.md` 마이그레이션 규칙, 사람 승인 게이트 |
| `skills/verify-ui` | 삭제 | 기본 제공 `run` 스킬, Playwright·next-devtools MCP |
| `hooks/protect-files.mjs` | 삭제 | `permissions.deny`: `Edit(./drizzle/**)`, `Write(./drizzle/**)`, `Edit(./.env*)`, `Write(./.env*)`, `Edit(./package-lock.json)`, `Write(./package-lock.json)`. `.env.example` 편집은 허용해야 한다(구현 시 규칙 우선순위 확인) |
| `hooks/guard-bash.mjs` | 삭제 | `drizzle-kit push/drop`은 기존 `permissions.deny`에 이미 있다. 커밋 전 lint는 CI가 잡는다. 셸로 `drizzle/`을 고치는 경우도 `human-gate`가 잡는다. DB 대상 표시는 사라지는데, 마이그레이션 적용이 사람 승인 이후로 옮겨 가므로 받아들인다. |
| `hooks/typecheck.mjs`, `hooks/format.mjs` | 삭제 | `CLAUDE.md`의 "커밋 전 lint·typecheck"와 CI |
| `settings.json` | 유지, `hooks` 제거 | 권한 규칙만 남긴다 |
| `.mcp.json` | 유지 | 공식 MCP 서버(Playwright, next-devtools, context7) |

### 6.8 `CLAUDE.md` 변경

전체 길이는 지금과 비슷하게 유지한다. 바꾸는 내용은 다음과 같다.

- **명령 절:** `/pre-pr`를 지운다. 검증과 리뷰는 6.3의 공식 도구를 쓴다고 적는다.
- **"작업 흐름" 절을 새로 만든다:** 6.2~6.4 요약, 위험 경로 목록, Claude가 하지 않는 것(라벨 조작, `main` 직접 push).
- **"구현 규칙" 몇 줄을 옮긴다.** 기존 스킬에서 프로젝트 고유한 것만 가져온다.
  - 사용자 데이터를 읽는 쿼리는 `src/db/queries/<테이블>.ts`에 두고 `import "server-only"`를 붙인다. 첫 인자로 `userId`를 받는다.
  - 남의 데이터와 없는 데이터는 똑같이 "찾을 수 없음"(`notFound()`)으로 처리한다. uuid 형식이 틀린 id는 쿼리 전에 걸러 `null`로 처리한다.
  - Server Action 순서: `getCurrentUser()` → 필드별 입력 검증(`FormData`를 통째로 넘기지 않음) → `userId`로 범위를 좁힌 쿼리 → 무효화.
  - 로그인 화면은 홈(`/`)이다. 비로그인 사용자는 `redirect("/")`.
  - 사용자에게 보여 주는 오류 문구는 한국어로 쓴다.
- **"정리 원칙" 절을 새로 만든다:** 직접 만든 스킬·에이전트·훅을 더하기 전에 공식 도구로 되는지 먼저 본다. 더한다면 왜 필요한지를 한 줄 남겨, 나중에 덜어낼지 판단할 수 있게 한다.

## 7. 구현자에게 맡기는 것

- `human-gate` job을 어떻게 구현할지. 공식 Action을 쓸 수도 있고 셸 스크립트로 짤 수도 있다. 단, 짧고 외부 의존이 적어야 한다.
- Vercel 검사의 정확한 이름 확인과 ruleset 설정 방법. Claude가 GitHub API로 설정할 수 없으면 사용자에게 클릭할 단계를 알려 준다.
- `permissions.deny`의 경로 문법과, `.env.example` 예외를 어떻게 처리할지.
- `CLAUDE.md` 문구.
- 작업 순서. 단, 게이트(6.4·6.5)를 먼저 세운 뒤 `.claude/`를 정리한다. 안전장치가 비는 구간을 만들지 않기 위해서다.
