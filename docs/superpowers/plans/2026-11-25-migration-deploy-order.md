# 마이그레이션과 배포 순서 판정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `CLAUDE.md` '마이그레이션 PR' 에 옛 코드·새 DB 두 창 판정, 삭제 순서, 롤백 금지선 규칙을 넣고 `docs/status.md` 에 롤백 금지선을 둔다.

**Architecture:** 문서 두 곳만 바꾼다. 코드·마이그레이션·CI 변경 없음.

**Tech Stack:** Markdown

**Spec:** `docs/superpowers/specs/2026-11-25-migration-deploy-order-design.md`

## Global Constraints

- 새 문서를 만들지 않는다(이 계획·설계 문서는 예외).
- `CLAUDE.md` 는 위험 경로 → PR 맨 위 "사람 확인 필요", `human-approved` 필요.
- 문장은 설계 문서 '바꾸는 것' 의 두 블록을 그대로 쓴다(뜻을 바꾸지 않는 다듬기만).

## Review Focus

- 기존 '마이그레이션 PR' 첫 문단의 절차(적용 → 자동 머지, 실행 직전 사람 확인, 포기 시 되돌리는 방법 보고)가 빠지지 않았는가.
- 삭제 순서(머지 → READY → 적용)가 '규칙' 의 "파괴적 마이그레이션은 PR 을 열기 전에 멈추고 보고" 와 부딪히지 않는가(그대로 적용됨).
- `docs/status.md` 의 '자동 머지' 줄(clean status 이면 바로 squash)과 새 `CLAUDE.md` 괄호가 서로 어긋나지 않는가.
- 롤백 금지선의 머지 커밋 `7ff21c0` 이 실제 #101 머지 커밋인가.

---

### Task 1: 규칙과 롤백 금지선

**Files:**
- Modify: `CLAUDE.md` ('작업 흐름' 의 **마이그레이션 PR.** 문단)
- Modify: `docs/status.md` ('알아 둘 것' 의 **마이그레이션과 배포 사이** 줄)

- [ ] **Step 1:** `CLAUDE.md` 의 **마이그레이션 PR.** 문단을 설계 문서 첫 블록으로 바꾼다.
- [ ] **Step 2:** `docs/status.md` 의 **마이그레이션과 배포 사이** 줄을 설계 문서 둘째 블록(롤백 금지선)으로 바꾼다.
- [ ] **Step 3:** `git log --oneline main | grep 7ff21c0` 로 #101 머지 커밋 확인. 출력에 `(#101)` 이 있어야 한다.
- [ ] **Step 4:** `npm run lint > /tmp/lint.log 2>&1; echo $?` → `0`, `npm run typecheck` → 종료 코드 0.
- [ ] **Step 5:** 커밋 `docs: 마이그레이션 PR 에 옛 코드·새 DB 판정과 롤백 금지선 (#107)`.
