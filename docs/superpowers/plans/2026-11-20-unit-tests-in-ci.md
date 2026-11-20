# 단위 시험을 CI 에서 (#22) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 마다 `src/**/*.test.mjs` 를 돌리고, CI Node 를 운영(26)과 맞춘다.

**Architecture:** `npm test` 하나를 로컬·CI 가 같이 쓴다. CI `check` 잡에 단계 하나.

**Tech Stack:** Node test runner, GitHub Actions (`actions/setup-node@v5`)

**Spec:** `docs/superpowers/specs/2026-11-20-unit-tests-in-ci-design.md`

## Global Constraints
- 명령: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test 'src/**/*.test.mjs'` (glob 은 따옴표로 — Node 가 펼친다)
- CI `node-version: 26`. `human-gate.yml`·`.github/scripts/**` 는 손대지 않는다.

## Review Focus
1. 시험 하나가 실패하면 `npm test` 의 종료 코드가 0 이 아니어야 한다(CI 가 빨개짐) — Task 1 Step 3 에서 일부러 깨 보고 확인.
2. glob 이 셸에서 펼쳐지지 않아야 한다(npm 은 sh 로 돌린다. 작은따옴표로 Node 에 그대로 넘김) — 시험 수 184 로 확인.
3. Node 26 에서 `.ts` 타입 지우기·경고 끄기가 22 와 같게 동작 — CI 로그로 확인(이 세션은 26 설치 불가).

---

### Task 1: `npm test` + CI 단계 + 문서

**Files:**
- Modify: `package.json` (scripts 에 `test`)
- Modify: `.github/workflows/ci.yml` (`node-version: 26`, `- run: npm test` 를 게이트 시험 다음에, 머리 주석에 "단위 시험" 추가)
- Modify: `CLAUDE.md` '명령'에 `npm test` 한 줄
- Modify: `docs/status.md` '단위 시험' 줄

- [ ] **Step 1:** scripts 에 `"test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test 'src/**/*.test.mjs'"`
- [ ] **Step 2:** `npm test` → `# pass 184`, `# fail 0`, 종료 코드 0, 출력에 `MODULE_TYPELESS` 없음
- [ ] **Step 3:** 시험 하나의 기댓값을 잠시 바꿔 `npm test` 종료 코드 ≠ 0 확인 → 되돌림(`git diff` 깨끗)
- [ ] **Step 4:** ci.yml·CLAUDE.md·status.md 고침
- [ ] **Step 5:** `npm run lint`(출력은 파일로, 종료 코드 따로) · `npm run typecheck` 통과
- [ ] **Step 6:** 커밋 → push → draft PR(`Closes #22`, 맨 위 "사람 확인 필요": `.github/**`·`package.json`·`CLAUDE.md`) → CI 로그에서 Node 26·`# pass`·경고 없음·build 통과 확인
