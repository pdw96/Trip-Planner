# Dependabot 버전 업데이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.github/dependabot.yml` 로 npm·GitHub Actions 새 버전 PR 을 주 1회 받고, 처리 규칙을 `CLAUDE.md` 에 적는다.

**Architecture:** 설정 파일 하나(`.github/dependabot.yml`)와 주변 설정 두 줄(`vercel.json` 미리보기 끄기, `human-gate.yml` Node 26), 문서(`CLAUDE.md`·`docs/status.md`). 앱 코드는 바뀌지 않는다. 시험은 설정 파일 검증(스키마·글롭)으로 한다.

**Tech Stack:** Dependabot v2 설정, Vercel `git.deploymentEnabled`(minimatch), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-21-dependabot-design.md`

## Global Constraints

- 주기: 주 1회 `monday` `09:00` `Asia/Seoul`, `cooldown.default-days: 7` (npm·actions 둘 다)
- 커밋 접두어: npm `deps`, actions `ci`
- `ignore`: `@types/node` `versions: [">=27"]`
- 묶음 이름·대상·업데이트 종류는 설계 표 그대로(`auth-db`, `react`, `tailwind`, `dnd-kit`, `npm-minor-and-patch`, `actions`)
- 자동 머지 없음, `human-gate` 손대지 않음(Node 버전만)
- 위험 경로(`.github/**`, `vercel.json`, `CLAUDE.md`)를 바꾸므로 PR 맨 위에 "사람 확인 필요"
- 커밋 전 `npm run lint`(출력은 파일로, 종료 코드 따로)·`npm run typecheck`

## Review Focus

1. 패키지가 두 묶음 패턴에 맞을 때(예: `react` minor) — `npm-minor-and-patch` 로 가야 한다. `update-types` 가 겹치지 않게 짝 묶음은 `["major"]` 만. (Task 1 검증 스크립트가 짝 묶음의 update-types 가 `["major"]` 인지 확인)
2. `auth-db` 4개와 `@biomejs/biome` 가 `npm-minor-and-patch` 에 들어가면 CI 만 보고 머지된다 — `exclude-patterns` 에 다섯 개가 다 있어야 한다. (Task 1 검증)
3. `dependabot/npm_and_yarn/next-16.4.7` 같은 두 단계 브랜치가 Vercel 미리보기에서 빠져야 하고, `main`·사람 브랜치는 그대로여야 한다. (Task 2 minimatch 확인)
4. 설정 키 오타(`update-types` vs `update_types`, `default-days`)는 Dependabot 이 머지 뒤에야 오류를 낸다 — 스키마 검증. (Task 1)
5. `human-gate.yml` 을 바꿔도 PR 에서는 main 의 워크플로가 돈다(`pull_request_target`) — 이 PR 의 게이트 결과는 옛 Node 22 로 나온다. 실패가 아니라 예상된 동작임을 PR 본문에 적는다. (Task 3)

---

### Task 1: `.github/dependabot.yml`

**Files:**
- Create: `.github/dependabot.yml`

**Interfaces:**
- Produces: 묶음 이름 `auth-db`, `react`, `tailwind`, `dnd-kit`, `npm-minor-and-patch`, `actions` — Task 3 의 `CLAUDE.md` 단락이 이 이름을 쓴다.

- [ ] **Step 1: 파일 작성**

맨 위 한 줄: 왜 필요한지(의존성 새 버전 PR 을 받는다, 처리 규칙은 `CLAUDE.md` 'Dependabot PR'). `version: 2`, `updates` 두 개:
- `npm`, `directory: "/"`, 공통 schedule·cooldown, `commit-message.prefix: "deps"`, `ignore` (`@types/node`, `>=27`), `groups` 를 이 순서로:
  - `auth-db`: `patterns: [better-auth, drizzle-orm, drizzle-kit, "@neondatabase/serverless"]` (update-types 없음 = 전부)
  - `react`: `patterns: [react, react-dom, "@types/react", "@types/react-dom"]`, `update-types: [major]`
  - `tailwind`: `patterns: [tailwindcss, "@tailwindcss/*"]`, `update-types: [major]`
  - `dnd-kit`: `patterns: ["@dnd-kit/*"]`, `update-types: [major]`
  - `npm-minor-and-patch`: `patterns: ["*"]`, `exclude-patterns: [better-auth, drizzle-orm, drizzle-kit, "@neondatabase/serverless", "@biomejs/biome"]`, `update-types: [minor, patch]`
- `github-actions`, `directory: "/"`, 공통 schedule·cooldown, `commit-message.prefix: "ci"`, `groups.actions.patterns: ["*"]`

각 묶음 위에 한 줄 주석으로 이유(설계 '이유' 요약).

- [ ] **Step 2: 스키마 검증**

```bash
curl -sSL -o "$SCRATCH/dependabot-schema.json" https://json.schemastore.org/dependabot-2.0.json
python3 -c "import json,yaml,jsonschema,sys; jsonschema.validate(yaml.safe_load(open('.github/dependabot.yml')), json.load(open(sys.argv[1]))); print('schema ok')" "$SCRATCH/dependabot-schema.json"
```
Expected: `schema ok`

- [ ] **Step 3: 묶음 규칙 검증 (Review Focus 1·2)**

scratchpad 의 python 스크립트로 확인: `react`·`tailwind`·`dnd-kit` 의 `update-types == ["major"]`; `npm-minor-and-patch` 의 `update-types == ["minor","patch"]` 이고 `exclude-patterns` 가 `auth-db.patterns + ["@biomejs/biome"]` 를 모두 포함; `auth-db` 에 `update-types` 없음; `package.json` 의 의존성 이름마다 어느 묶음(또는 묶음 없음)인지 표를 출력해 설계 표와 눈으로 맞춘다.
Expected: 단언 통과, `@biomejs/biome` 는 minor/patch 에서 "묶음 없음".

- [ ] **Step 4: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: Dependabot 버전 업데이트 설정 (#65)"
```

### Task 2: `vercel.json` — Dependabot 브랜치 미리보기 끄기

**Files:**
- Modify: `vercel.json` (`git.deploymentEnabled`)

- [ ] **Step 1: `"dependabot/**": false` 를 `claude/*`·`ccr-*` 옆에 더한다**

- [ ] **Step 2: minimatch 로 확인 (Review Focus 3)**

scratchpad 에 `npm i minimatch@11` 뒤, `vercel.json` 의 키마다 아래 브랜치를 맞춰 본다:
- 꺼져야 함: `dependabot/npm_and_yarn/next-16.4.7`, `dependabot/npm_and_yarn/npm-minor-and-patch-8f3a1c2b9e`, `dependabot/github_actions/actions-1a2b3c4d5e`, `ccr-07857a6b-9gu31a`, `claude/keen-keller-uqwxmf`
- 켜져야 함(어느 키에도 안 맞음): `main`, `feature/x`

Expected: 꺼져야 할 것은 하나 이상 키에 맞고, 켜져야 할 것은 어느 키에도 맞지 않음. 참고로 `dependabot/*` 는 첫 줄에 맞지 않음을 함께 출력해 `**` 가 필요한 이유를 확인한다.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: Dependabot 브랜치 Vercel 미리보기 끄기 (#65)"
```

### Task 3: `human-gate.yml` Node 26, `CLAUDE.md`·`docs/status.md`

**Files:**
- Modify: `.github/workflows/human-gate.yml` (`node-version: 22` → `26`, 위에 "CI·Vercel 과 맞춘다" 한 줄)
- Modify: `CLAUDE.md` ('작업 흐름'의 '마이그레이션 PR' 앞에 **Dependabot PR** 단락)
- Modify: `docs/status.md`

**Interfaces:**
- Consumes: Task 1 의 묶음 이름.

- [ ] **Step 1: `human-gate.yml` Node 26**

- [ ] **Step 2: 게이트 스크립트 시험을 Node 26 으로**

Run: `npx -y node@26 --test '.github/scripts/*.test.mjs'` (안 되면 CI `check` 가 이미 Node 26 으로 같은 시험을 돈다는 것을 근거로 적는다)
Expected: 모두 pass

- [ ] **Step 3: `CLAUDE.md` Dependabot PR 단락**

설계 '함께 바꾸는 것'의 `CLAUDE.md` 항목 다섯 개를 이 파일 문체(짧은 평서문, 굵은 머리말)로 옮긴다. 묶음 이름은 Task 1 그대로. 처리 구분: CI 만 = `npm-minor-and-patch`, `actions` / 그 밖 = 세션.

- [ ] **Step 4: `docs/status.md`**

'끝나서 배포된 것' 표에 #65 줄(PR #66, 머지 뒤 확정), '다음 할 일'의 Dependabot 제안 줄 삭제, '알아 둘 것'에 **Dependabot(#65)** 항목: 묶음·처리 구분 요약, `@types/node` ignore 는 런타임을 올릴 때 함께, Biome 2.6 은 Markdown 서식 검사로 lint 실패(올릴 때 `biome migrate`·서식 정리), Dependabot 브랜치는 Vercel 미리보기 없음, Neon `preview/…` 브랜치는 저절로 지워지지 않음. '남은 확인'에 첫 Dependabot PR 확인 3가지(묶음 분리, `human-gate` 댓글·라벨, 미리보기 없음)와 사용자의 Neon 브랜치 6개 정리.

- [ ] **Step 5: 검사**

Run: `npm run lint > "$SCRATCH/lint.txt" 2>&1; echo $?` 와 `npm run typecheck; echo $?`
Expected: 둘 다 `0`

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/human-gate.yml CLAUDE.md docs/status.md
git commit -m "docs: Dependabot PR 처리 규칙, human-gate Node 26 (#65)"
```
