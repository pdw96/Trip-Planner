# AI-Native 개발 흐름 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험 경로를 건드린 PR은 사람 라벨이 있어야 머지되게 하는 게이트를 세운다. 그 위에서 `.claude/`에 직접 만든 스킬·에이전트·훅을 걷어 내고, 공식 도구와 `CLAUDE.md`로 대체한다.

**Architecture:**
- `human-gate`는 정해진 규칙만 따르는 검사로 만든다. 의존성이 없는 Node 스크립트 하나와 GitHub Actions 워크플로 하나로 구성한다.
- 순서는 정해져 있다. 게이트를 먼저 이 브랜치(PR #8)에 올린다. 사용자가 그 검사를 필수로 지정한 ruleset을 설정한다. 그 뒤에 기존 장치를 지운다.
- 이 PR 자체가 위험 경로(`.github/`, `.claude/`, `CLAUDE.md`)를 건드리므로, 게이트가 실제로 막는지 이 PR에서 바로 확인된다.

**Tech Stack:** Node 22 내장 모듈(`node:test`, `node:child_process`, `fetch`), GitHub Actions, GitHub ruleset, Claude Code `settings.json` 권한 규칙.

**Spec:** `docs/superpowers/specs/2026-11-17-ai-native-workflow-design.md`

## Global Constraints

- **브랜치:** 작업 브랜치는 `claude/wizardly-maxwell-918njv`이고, PR은 [pdw96/Trip-Planner#8](https://github.com/pdw96/Trip-Planner/pull/8)이다. `main`에 직접 push하지 않는다.
- **의존성 금지:** 새 npm 의존성을 추가하지 않는다. 게이트 스크립트는 Node 내장 기능만 쓴다.
- **라벨 이름:** 승인 라벨 `human-approved`, 후기 라벨 `feedback`, 종류 라벨 `bug` / `enhancement`.
- **필수 검사 이름:** `check`(기존 CI job), `human-gate`(새 job), `Vercel`(Vercel 커밋 상태). PR #8에서 실제 이름을 확인했다.
- **위험 경로 (정확히 이 목록):**
  - 정확한 파일:
    - `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`
    - `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`
    - `next.config.ts`, `.env.example`, `package.json`, `package-lock.json`
    - `vercel.json`, `proxy.ts`, `src/proxy.ts`
    - `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `biome.json`, `tsconfig.json`
  - 접두어: `drizzle/`, `src/app/api/auth/`, `.github/`, `.claude/`
- **Claude가 하지 않는 것:**
  - `human-approved` 라벨을 붙이거나 떼지 않는다. 게이트 스크립트가 승인을 무효로 할 때만 예외다.
  - `npm run db:migrate`를 실행하지 않는다.
- **커밋 전 검사:** `npm run lint`와 `npm run typecheck`가 모두 통과해야 한다.
- **문구:** 사용자에게 보이는 문구와 문서는 한국어로 쓴다.

## Review Focus

1. **`main`을 PR 브랜치에 병합하는 push.** 승인된 위험 PR에 `main`을 병합해도 라벨은 유지된다(Task 1 테스트 `riskyPatch: main 병합만으로는 바뀌지 않는다`).
2. **위험 파일의 이름 변경·삭제.** 위험 경로에서 빠져나가는 rename이나 삭제도 위험 변경으로 센다(Task 1 테스트 `riskyFiles: rename 의 옛 경로와 삭제도 센다`).
3. **force-push로 `before` 커밋이 사라진 경우.** 비교할 수 없으면 승인을 무효로 한다(Task 1 테스트 `riskyChangedSince: before 커밋이 없으면 바뀐 것으로 본다`).
4. **위험하지 않은 PR에 라벨이 붙은 경우.** 그냥 통과하고 라벨은 건드리지 않는다(Task 1 테스트 `decide: 위험 파일이 없으면 라벨과 무관하게 통과`).
5. **이름이 비슷한 안전한 경로.** `src/lib/authz.ts`, `drizzle-notes.md`, `src/app/api/authors/x.ts`, `docs/.github/x`는 위험이 아니다(Task 1 테스트 `isRisky: 비슷한 이름은 위험이 아니다`).

---

### Task 1: `human-gate` 스크립트와 워크플로

**Files:**
- Create: `.github/scripts/human-gate.mjs`
- Create: `.github/scripts/human-gate.test.mjs`
- Create: `.github/workflows/human-gate.yml`
- Modify: `.github/workflows/ci.yml` (`check` job에 게이트 테스트 단계 추가, 상단 주석 갱신)

**Interfaces:**
- Produces (`.github/scripts/human-gate.mjs`의 named export):
  - `RISKY_FILES: readonly string[]`, `RISKY_PREFIXES: readonly string[]`: Global Constraints의 목록 그대로.
  - `isRisky(file: string): boolean`
  - `riskyFiles(baseSha: string, headSha: string, cwd?: string): string[]`
    - 내부: `git diff --name-only --no-renames <merge-base> <head>` 결과를 `isRisky`로 거른 것.
  - `riskyPatch(baseRef: string, sha: string, cwd?: string): string`
    - 내부: `git diff <merge-base(baseRef, sha)> <sha> -- <그 diff의 위험 파일들>`의 출력.
  - `riskyChangedSince(baseRef: string, beforeSha: string, afterSha: string, cwd?: string): boolean`
    - 두 시점의 `riskyPatch`가 다르면 `true`.
    - git 명령이 실패하면(커밋 없음 등) `true`.
  - `decide({ risky: string[], hasLabel: boolean, changedSinceApproval: boolean }): { pass: boolean, removeLabel: boolean, message: string }`
  - 직접 실행되면(`import.meta.url === pathToFileURL(process.argv[1]).href`) `main()`을 실행한다.
- Produces: 워크플로 job 이름 `human-gate`. Task 2에서 필수 검사로 지정한다.

- [ ] **Step 1: 실패하는 테스트 작성** (`.github/scripts/human-gate.test.mjs`, `node:test` + `node:assert/strict`)

  git이 필요한 테스트는 `mkdtempSync`로 만든 임시 저장소에서 `git init -b main`부터 시작한다. `user.name`과 `user.email`은 저장소 로컬 설정으로 넣는다.

  ```js
  test("isRisky: 목록의 파일과 접두어는 위험", () => {
    for (const f of ["src/db/schema.ts", "drizzle/0002_x.sql", "drizzle/meta/_journal.json",
      "src/app/api/auth/[...all]/route.ts", ".github/workflows/ci.yml",
      ".claude/settings.json", "CLAUDE.md", "package-lock.json", "src/proxy.ts"])
      assert.equal(isRisky(f), true, f);
  });
  test("isRisky: 비슷한 이름은 위험이 아니다", () => {
    for (const f of ["src/lib/authz.ts", "drizzle-notes.md", "src/app/api/authors/x.ts",
      "docs/.github/x", "src/app/page.tsx", "docs/CLAUDE.md"])
      assert.equal(isRisky(f), false, f);
  });
  test("decide: 위험 파일이 없으면 라벨과 무관하게 통과", () => {
    for (const hasLabel of [true, false])
      assert.deepEqual(
        pick(decide({ risky: [], hasLabel, changedSinceApproval: true })),
        { pass: true, removeLabel: false });
  });
  test("decide: 위험 파일이 있고 라벨이 없으면 실패, 메시지에 파일 목록", () => {
    const r = decide({ risky: ["CLAUDE.md"], hasLabel: false, changedSinceApproval: false });
    assert.equal(r.pass, false); assert.equal(r.removeLabel, false);
    assert.match(r.message, /CLAUDE\.md/); assert.match(r.message, /human-approved/);
  });
  test("decide: 라벨 있고 승인 뒤 위험 변경 없음 → 통과", () => {
    assert.deepEqual(pick(decide({ risky: ["CLAUDE.md"], hasLabel: true, changedSinceApproval: false })),
      { pass: true, removeLabel: false });
  });
  test("decide: 라벨 있지만 승인 뒤 위험 변경 → 실패 + 라벨 제거", () => {
    assert.deepEqual(pick(decide({ risky: ["CLAUDE.md"], hasLabel: true, changedSinceApproval: true })),
      { pass: false, removeLabel: true });
  });
  test("riskyFiles: rename 의 옛 경로와 삭제도 센다", () => {
    // main: src/lib/session.ts, src/db/index.ts 존재
    // 브랜치: git mv src/lib/session.ts src/lib/sess.ts, git rm src/db/index.ts
    assert.deepEqual(riskyFiles("main", "HEAD", dir).sort(), ["src/db/index.ts", "src/lib/session.ts"]);
  });
  test("riskyPatch: main 병합만으로는 바뀌지 않는다", () => {
    // 브랜치가 CLAUDE.md 수정 → before = HEAD
    // main 에 README.md 커밋 → 브랜치에 git merge main → after = HEAD
    assert.equal(riskyChangedSince("main", before, after, dir), false);
  });
  test("riskyChangedSince: 브랜치가 위험 파일을 다시 고치면 true", () => {
    // before 이후 브랜치에서 CLAUDE.md 를 한 번 더 수정
    assert.equal(riskyChangedSince("main", before, after, dir), true);
  });
  test("riskyChangedSince: 브랜치가 안전한 파일만 고치면 false", () => {
    // before 이후 브랜치에서 src/app/page.tsx 만 수정
    assert.equal(riskyChangedSince("main", before, after, dir), false);
  });
  test("riskyChangedSince: before 커밋이 없으면 바뀐 것으로 본다", () => {
    assert.equal(riskyChangedSince("main", "0".repeat(40), "HEAD", dir), true);
  });
  ```

  `pick`은 `({ pass, removeLabel }) => ({ pass, removeLabel })`인 테스트 내부 도우미다.

- [ ] **Step 2: 실패 확인**

  Run: `node --test .github/scripts/`
  Expected: FAIL. `human-gate.mjs`가 없어서 import 오류가 난다.

- [ ] **Step 3: `.github/scripts/human-gate.mjs` 구현**

  git 호출은 `execFileSync("git", args, { cwd, encoding: "utf8" })`로 한다(셸을 거치지 않음).

  `decide`의 메시지:
  - 실패: 걸린 파일 목록과 "사람이 확인한 뒤 `human-approved` 라벨을 붙이세요"를 포함한다.
  - 승인 무효: "승인 이후 위험 경로가 다시 바뀌어 승인을 해제했습니다"를 포함한다.

  `main()`이 하는 일:
  1. `GITHUB_EVENT_PATH`의 JSON에서 다음을 읽는다.
     - `action`
     - `before`: `synchronize`일 때만 있다.
     - `pull_request.number`, `pull_request.base.ref`, `pull_request.head.sha`
     - `pull_request.labels[].name`
  2. 기준 브랜치를 `origin/<base.ref>`로 잡아 `riskyFiles`를 구한다.
  3. `changedSinceApproval`는 `action === "synchronize" && hasLabel`일 때만 `riskyChangedSince(origin/<base.ref>, before, head.sha)`로 계산한다. 그 밖의 경우는 `false`다.
  4. `decide`를 호출한다.
  5. `removeLabel`이면 라벨을 제거한다.
     - 요청: `DELETE ${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${number}/labels/human-approved`
     - 헤더: `Authorization: Bearer ${GITHUB_TOKEN}`
     - 404는 무시한다.
  6. 메시지를 stdout과 `GITHUB_STEP_SUMMARY`(있으면)에 쓴다. 실패면 `process.exitCode = 1`로 끝낸다.

- [ ] **Step 4: 테스트 통과 확인**

  Run: `node --test .github/scripts/`
  Expected: 모든 테스트 PASS.

- [ ] **Step 5: 워크플로 작성**

  `.github/workflows/human-gate.yml`:
  - `on.pull_request.types`: `[opened, synchronize, reopened, labeled, unlabeled]`
  - `permissions`: `contents: read`, `pull-requests: write`, `issues: write`
  - `concurrency`: `human-gate-${{ github.event.pull_request.number }}`, `cancel-in-progress: true`
  - job id와 이름: `human-gate`
  - 단계:
    1. `actions/checkout@v5`, `fetch-depth: 0`. 체크아웃되는 것은 PR 머지 커밋이다. 그래서 스크립트는 `HEAD`가 아니라 이벤트의 `head.sha`를 쓴다.
    2. `actions/setup-node@v5`, `node-version: 22`
    3. `node .github/scripts/human-gate.mjs`, env `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`

  `ci.yml`의 `check` job에서 `npm run typecheck` 다음에 `node --test .github/scripts/` 단계를 추가한다. 상단 주석에서 "Claude Code 훅" 언급을 지우고, "lint · typecheck · 게이트 스크립트 테스트"로 고친다.

- [ ] **Step 6: 로컬 검사**

  Run: `npm run lint && npm run typecheck && node --test .github/scripts/`
  Expected: 모두 통과. Biome이 `.github/scripts/*.mjs`도 검사하므로, 포맷 오류가 나면 `npx biome check --write .github`로 고친다.

- [ ] **Step 7: 커밋·push 후 PR #8에서 동작 확인**

  ```bash
  git add .github && git commit -m "ci: 위험 경로 PR 에 사람 승인을 요구하는 human-gate 추가"
  ```

  ```bash
  git push
  ```

  Expected: PR #8의 `human-gate` 검사가 **실패**하고, 실패 요약에 `.github/workflows/human-gate.yml` 등이 나온다. `mcp__github__pull_request_read`의 `get_check_runs`로 확인한다. `check`는 성공해야 한다.

### Task 2: GitHub 저장소 설정 (사용자 작업 + 확인)

Claude에게 저장소 설정·ruleset·라벨을 만드는 도구가 없다. 그래서 사용자에게 단계를 안내하고, 결과를 Claude가 확인한다.

**Files:** 없음.

**Interfaces:**
- Consumes: Task 1의 `human-gate` 검사. 한 번 실행된 검사여야 ruleset에서 고를 수 있다.
- Produces: 이후 모든 PR에 적용되는 `main` ruleset과 라벨. Task 5가 이것을 전제로 한다.

- [ ] **Step 1: 사용자에게 아래 단계를 한 메시지로 안내**
  1. **Settings → General → Pull Requests:**
     - "Allow squash merging"만 켜고 merge commit과 rebase는 끈다.
     - "Allow auto-merge"를 켠다.
     - "Automatically delete head branches"를 켠다.
  2. **Settings → Rules → Rulesets → New branch ruleset:**
     - 이름: `main`
     - Enforcement: Active
     - Target: default branch
     - Bypass list: 비움
     - 켤 규칙:
       - "Restrict deletions"
       - "Block force pushes"
       - "Require a pull request before merging". 필요 승인 수는 0이고, 승인은 라벨로 대신한다.
       - "Require status checks to pass": `check`, `human-gate`, `Vercel`을 추가한다. "Require branches to be up to date"는 끈다.
  3. **Issues → Labels:**
     - `human-approved` (설명: "위험 경로 변경을 사람이 확인함") 생성
     - `feedback` (설명: "지인 실사용 후기에서 나옴") 생성
     - `bug`와 `enhancement`는 기본 라벨이 있으면 그대로 쓴다.
- [ ] **Step 2: 사용자가 완료했다고 하면 확인**

  `mcp__github__pull_request_read`의 `get`으로 PR #8의 `mergeable_state`를 확인한다.
  Expected: `blocked`. `human-gate`가 실패 중이기 때문이다.

  `mcp__github__get_label`로 `human-approved`와 `feedback` 라벨이 있는지도 확인한다.

### Task 3: 권한 규칙으로 훅 대체

**Files:**
- Modify: `.claude/settings.json`
- Delete: `.claude/hooks/` 전체 (`format.mjs`, `guard-bash.mjs`, `protect-files.mjs`, `typecheck.mjs`)

**Interfaces:**
- Consumes: Task 1, Task 2. 게이트와 ruleset이 이미 서 있어야 한다.
- Produces: `hooks` 키가 없는 `settings.json`.

- [ ] **Step 1: `settings.json`에서 `hooks` 키 전체 삭제, `permissions` 수정**
  - `allow`: 기존 항목을 그대로 두고 `Bash(node --test .github/scripts/)`를 추가한다.
  - `ask`: 그대로 둔다. `db:migrate` 확인은 설계 6.6의 안전망이다.
  - `deny`: 기존 항목에 아래를 추가한다.
    - `Edit(./drizzle/**)`
    - `Edit(./.env)`, `Edit(./.env.local)`, `Edit(./.env.production*)`, `Edit(./.env.development*)`
    - `Edit(./package-lock.json)`
  - `.env.example`은 deny에 걸리지 않게 `.env*` 와일드카드를 쓰지 않는다.
  - Claude Code 문서상 `Edit(...)` 규칙은 파일을 고치는 모든 내장 도구(Write 포함)에 적용된다. 확실하지 않으면 claude-code-guide 에이전트로 확인한다.

- [ ] **Step 2: 훅 디렉터리 삭제**

  ```bash
  git rm -r .claude/hooks
  ```

- [ ] **Step 3: 검증**

  ```bash
  node -e 'const s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8"));if(s.hooks)throw 1;console.log(s.permissions.deny)'
  ```

  ```bash
  grep -rn "hooks/" .claude CLAUDE.md .github || echo none
  ```

  ```bash
  npm run lint && npm run typecheck
  ```

  Expected: deny 배열이 출력되고, grep 결과는 `none`이고, lint와 typecheck가 통과한다.

- [ ] **Step 4: 커밋**

  ```bash
  git add -A .claude && git commit -m "chore: 직접 만든 훅을 권한 규칙과 CI 로 대체"
  ```

### Task 4: 스킬·에이전트 삭제와 `CLAUDE.md` 개편

**Files:**
- Delete: `.claude/agents/` 전체, `.claude/skills/` 전체
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 3.
- Produces: 새 `CLAUDE.md`. 이후 모든 세션이 이 파일의 "작업 흐름"을 따른다.

- [ ] **Step 1: 삭제**

  ```bash
  git rm -r .claude/agents .claude/skills
  ```

- [ ] **Step 2: `CLAUDE.md` 수정.** 기존 "스택", "환경", "규칙" 절은 유지한다. 그 밖에는 아래만 바꾸고, 전체 길이는 지금의 약 1.5배를 넘기지 않는다.
  - **"명령" 절:**
    - `/pre-pr` 줄을 지운다.
    - "Bash 가드 훅이 lint 를 다시 확인" 문구를 지운다.
    - `node --test .github/scripts/`(게이트 스크립트 테스트)를 추가한다.
  - **"구현 규칙" 절을 새로 만든다.** 설계 6.8의 다섯 줄을 그대로 옮긴다.
  - **"작업 흐름" 절을 새로 만든다.** 아래 내용을 모두 담는다.
    - 후기 → 이슈:
      - 쪼개기
      - 라벨 `feedback` + `bug`|`enhancement`(판단 근거를 본문에)
      - 원문은 이름·연락처를 지우고 "지인 A"처럼 익명으로
      - 재현 방법
      - 원인 후보와 관련 파일
      - 저장소가 public이라 이슈가 공개됨을 명시
      - 만든 뒤 목록을 보여 주고 사용자가 고르게 함
    - 이슈 진행:
      - 사용자가 고른 이슈마다 `create_session`으로 세션 하나
      - `enhancement`는 superpowers 브레인스토밍 → 사람이 설계를 승인한 뒤 진행
      - `bug`는 바로 진행. 동작이나 화면을 바꾸는 결정이 필요하면 먼저 묻는다.
    - PR 전 검증:
      - `npm run lint`, `npm run typecheck`
      - UI 변경은 `run` 스킬과 Playwright·next-devtools MCP로 브라우저 확인
      - `/code-review`
      - 인증·소유권 코드를 건드렸으면 `/security-review`
    - PR:
      - 본문에 `Closes #N`
      - 위험 경로를 건드렸으면 맨 위에 "사람 확인 필요"와 이유
      - 마이그레이션이면 SQL 전문과 파괴적 여부 판정
      - 자체 리뷰가 끝나면 draft를 해제하고 `enable_pr_auto_merge`(squash)
      - `subscribe_pr_activity`로 PR을 지켜본다.
    - 마이그레이션 PR: 설계 6.6의 순서.
      1. 자동 머지를 켜지 않는다.
      2. 라벨이 붙으면 `npm run db:migrate`를 실행하고, 사람이 확인한다.
      3. 적용이 성공하면 자동 머지를 켠다.
      4. 적용 뒤 PR을 포기하게 되면 되돌리는 방법을 보고한다.
    - 위험 경로 목록: Global Constraints 그대로. `.github/scripts/human-gate.mjs`가 기준임을 적는다.
    - Claude가 하지 않는 것: `human-approved` 라벨 조작, `main` 직접 push.
  - **"정리 원칙" 절을 새로 만든다.** 직접 만든 스킬·에이전트·훅을 더하기 전에 공식 도구로 되는지 먼저 본다. 더한다면 그 이유를 파일 맨 위에 한 줄 남긴다.

- [ ] **Step 3: 검증**

  ```bash
  grep -rnE "pre-pr|new-route|server-action|new-migration|verify-ui|authz-reviewer|rsc-boundary|next16-api|migration-reviewer|guard-bash|protect-files" --exclude-dir=node_modules --exclude-dir=docs . || echo none
  ```

  ```bash
  npm run lint && npm run typecheck
  ```

  Expected: grep 결과는 `none`이고, lint와 typecheck가 통과한다.

- [ ] **Step 4: 커밋·push**

  ```bash
  git add -A .claude CLAUDE.md && git commit -m "chore: 직접 만든 스킬·에이전트를 걷어 내고 CLAUDE.md 에 작업 흐름 정리"
  ```

  ```bash
  git push
  ```

### Task 5: 게이트 끝단 확인과 마무리

**Files:** 없음 (PR #8 본문 갱신).

**Interfaces:**
- Consumes: Task 1~4가 모두 push된 PR #8, Task 2의 ruleset.

- [ ] **Step 1: 라벨 없는 상태 확인**

  Expected:
  - `human-gate` 실패. 요약에 `.claude/`, `CLAUDE.md`, `.github/` 파일이 나온다.
  - `check`와 `Vercel` 성공.
  - `mergeable_state`는 `blocked`.

- [ ] **Step 2: PR #8 본문 갱신 후 사용자에게 요청**
  - PR 본문에 다음을 적는다.
    - 바뀐 것 요약
    - 맨 위에 "사람 확인 필요: 게이트·권한·CLAUDE.md 변경"
  - 사용자에게 diff를 확인하고 `human-approved` 라벨을 붙여 달라고 요청한다.
  - Claude는 라벨을 붙이지 않는다.
- [ ] **Step 3: 라벨이 붙은 뒤 확인**

  Expected: `labeled` 이벤트로 `human-gate`가 다시 돌아 성공하고, `mergeable_state`가 `clean`이 된다.

- [ ] **Step 4: 승인 무효화 확인** (위험하지 않은 커밋)

  설계 문서의 상태 줄을 "승인됨"으로 고친다(`docs/`는 위험 경로가 아님). 그다음 커밋하고 push한다.

  Expected: `synchronize`로 돈 `human-gate`가 성공하고, 라벨이 유지된다.

- [ ] **Step 5: 사용자 요청으로 머지**

  Claude는 사용자가 머지를 요청할 때만 `enable_pr_auto_merge`를 켜거나 머지한다. 이 PR은 흐름을 세우는 PR이라 자동 머지 규칙의 적용 대상이 아니다.
