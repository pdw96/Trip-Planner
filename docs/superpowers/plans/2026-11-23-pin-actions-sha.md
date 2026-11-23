# 워크플로 액션 SHA 고정 (#80) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 워크플로 4곳의 액션을 태그 대신 40자리 커밋 SHA + 세부 버전 주석으로 고정한다.

**Architecture:** `.github/workflows/*.yml` 의 `uses:` 줄만 바꾼다. Dependabot 설정은 그대로, 규칙 한 줄을 `docs/status.md` 에 적는다.

**Tech Stack:** GitHub Actions, Dependabot, Biome(YAML 서식 검사)

**Spec:** `docs/superpowers/specs/2026-11-23-pin-actions-sha-design.md`

## Global Constraints

- 형식: `uses: <owner>/<repo>@<40자리 SHA> # vX.Y.Z` (주석은 세부 버전 태그)
- `actions/checkout` → `3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
- `actions/setup-node` → `949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`
- `.github/dependabot.yml` 은 바꾸지 않는다.

## Review Focus

1. 고정한 SHA 가 지금 `v7` 태그와 다른 커밋 → 도는 코드가 바뀜. 커밋 직전 `git ls-remote` 로 다시 확인한다(Task 1 Step 1).
2. 한 곳이라도 태그로 남음 → Step 3 의 grep 이 잡는다.
3. 주석 앞 공백·들여쓰기가 Biome YAML 서식과 어긋남 → `npm run lint`.

---

### Task 1: 액션 SHA 고정 + 규칙 기록

**Files:**
- Modify: `.github/workflows/ci.yml:22-23`
- Modify: `.github/workflows/human-gate.yml:28,33`
- Modify: `docs/status.md` ('알아 둘 것' → 'Dependabot(#65)' 목록)

- [ ] **Step 1: SHA 다시 확인**

Run: `for r in checkout setup-node; do git ls-remote --tags https://github.com/actions/$r.git | grep -E 'refs/tags/v7(\.|$)'; done`
Expected: checkout `v7`·`v7.0.1` 이 `3d3c42e5…b1`, setup-node `v7`·`v7.1.0` 이 `949feb24…c1`. 다르면 멈추고 보고한다.

- [ ] **Step 2: 4곳 `uses:` 를 Global Constraints 값으로 바꾼다** (다른 줄·주석은 그대로)

- [ ] **Step 3: 태그로 남은 곳이 없는지 확인**

Run: `grep -rnE 'uses: [^@]+@' .github/workflows | grep -vE '@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+$'`
Expected: 출력 없음

- [ ] **Step 4: `docs/status.md` 'Dependabot(#65)' 목록에 한 줄**

"액션은 40자리 커밋 SHA + `# vX.Y.Z` 주석으로 고정한다(#80). 새 액션을 넣을 때도 `git ls-remote --tags` 로 확인한 SHA 를 쓴다. Dependabot 이 SHA 와 주석을 함께 올린다."

- [ ] **Step 5: 검사**

Run: `npm run lint > /tmp/lint.log 2>&1; echo $?` · `npm run typecheck > /tmp/tc.log 2>&1; echo $?`
Expected: 둘 다 `0`

- [ ] **Step 6: 커밋**

```bash
git add .github/workflows docs/status.md docs/superpowers
git commit -m "ci: 워크플로 액션을 커밋 SHA 로 고정 (#80)"
```
