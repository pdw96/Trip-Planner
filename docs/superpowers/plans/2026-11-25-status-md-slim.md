# status.md 줄이기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/status.md` 의 남은 일을 이슈 4개로 옮기고, 지난 기록을 지우고, `CLAUDE.md` 갱신 규칙을 바꿔 다시 쌓이지 않게 한다.

**Architecture:** 코드 변경 없음. GitHub 이슈 4개(MCP `issue_write`) → `docs/status.md` 다시 쓰기 → `CLAUDE.md` '작업 흐름' 몇 줄 → PR #116 본문.

**Tech Stack:** Markdown, GitHub MCP, Biome(Markdown lint).

**Spec:** `docs/superpowers/specs/2026-11-25-status-md-slim-design.md`

## Global Constraints

- 새 이슈는 모두 마일스톤 없음, 라벨 `enhancement`, 본문에 판단 근거(`enhancement` 로 본 이유).
- `알아 둘 것` 의 기존 내용은 그대로 둔다(나누기는 범위 밖). 옮겨 오는 항목만 더한다.
- `남은 확인` 의 줄은 하나도 흔적 없이 사라지면 안 된다: 이슈로, `알아 둘 것` 으로, 또는 "끝난 기록이라 지움" 셋 중 하나.
- 남은 지적 모음에서 빼는 것은 PR 본문에 "설계에서 받아들임"·"설계대로"라고 적힌 지적뿐이다.
- `human-approved` 라벨은 붙이지 않는다. `CLAUDE.md` 가 바뀌므로 PR 맨 위에 "사람 확인 필요".
- 사용자에게 보이는 문구는 한국어, 지금 문서의 말투(쉬운 말, "~다" 체)를 따른다.

## Review Focus

- `CLAUDE.md` 의 다른 `status.md` 언급(65·68행 Dependabot ignore → '알아 둘 것' 의 'Dependabot', 75행 '남은 확인' 의 "적용 안 된 마이그레이션", 76행 롤백 금지선)이 새 구조에서 가리키는 곳이 실제로 있어야 한다 → Task 3 Step 3 grep.
- 남은 확인의 "남은 것:" 이 붙은 프로덕션 줄이 체크리스트에서 빠지기 쉽다 → Task 1 Step 2 대조.
- 이슈 번호를 status.md 에 적은 뒤 번호가 틀리면 안내가 틀린다 → Task 2 Step 3.
- Biome 가 Markdown 을 lint 한다(#76) → Task 4 `npm run lint`.

---

### Task 1: 이슈 4개 만들기

**Files:** 없음(GitHub). 원문: `docs/status.md` 152행부터 '남은 확인', PR #31·#38·#42·#47·#50·#54·#60·#92·#98·#101·#105·#112·#114 본문 "남은 지적".

**Produces:** 이슈 번호 4개 — `N_지적`(남은 지적 모음), `N_확인`(실제로 써 볼 것), `N_기준점`(기준점 장소를 지우면), `N_상한`(여행 기간 상한). Task 2·3 이 쓴다.

- [ ] **Step 1: PR 13개 본문의 "남은 지적" 절을 읽고, 항목마다 "받아들임/설계대로" 여부를 표시한다.** status.md 줄과 PR 본문이 다르면 PR 본문을 따른다.
- [ ] **Step 2: "실제로 써 볼 것" 체크리스트를 status.md 의 "남은 것:"·"프로덕션 확인"·"사용자:" 줄과 한 줄씩 대조해 만든다.** 디자인 문서 표의 11개 항목이 모두 있어야 한다. 항목마다 출처 이슈 번호.
- [ ] **Step 3: 이슈 4개를 만든다** (`mcp__github__issue_write`, owner `pdw96`, repo `trip-planner`, labels `["enhancement"]`, 마일스톤 없음). 제목:
  - `남은 지적 모음 (PR 리뷰에서 고치지 않은 것, #13–#36)`
  - `실제로 써 볼 것 (사용자 확인 체크리스트)`
  - `기준점 장소를 지우면 그날부터 기준점 없음으로 할지`
  - `여행 기간 상한을 둘지`
  남은 지적 모음 본문 맨 위에 "새 남은 지적은 PR 링크와 한 줄로 여기에 더한다(`CLAUDE.md`)" 한 줄, 실제로 써 볼 것 본문 맨 위에 "끝나면 체크하거나 지운다" 한 줄. 모두 "출처: #108" 줄.
- [ ] **Step 4: 만든 번호 4개를 기록한다.**

### Task 2: `docs/status.md` 다시 쓰기

**Files:** Modify: `docs/status.md`

**Consumes:** Task 1 의 번호 4개.

- [ ] **Step 1: 새 모양으로 다시 쓴다.** 순서:
  1. `# 지금 상태` + 기준 날짜 줄 + "무엇을 적고 무엇을 적지 않는지는 `CLAUDE.md` '이슈 → PR'" 한 줄.
  2. (적용 안 된 마이그레이션이 있을 때만 `## 적용 안 된 마이그레이션` — 지금은 없으므로 절을 만들지 않는다.)
  3. `## 다음 할 일`: 지금 39–51행의 이슈 안내 유지, 새 이슈 4개를 한 줄씩 더함. 쿼리 구조 두 문단(52–54행)은 빼서 아래로.
  4. `## 찾는 곳`: 설계 `docs/superpowers/specs/`(날짜-주제 이름), 계획 `docs/superpowers/plans/`, 이슈별 내용·남은 지적은 PR 본문, 남은 지적 `#N_지적`, 사용자 확인 `#N_확인`.
  5. `## 알아 둘 것`: 지금 내용 그대로, 맨 앞에 "**쿼리 구조**" 항목(옮겨 온 두 문단), 그리고 옮겨 오는 팁: #90 브라우저 확인 팁 → 기존 "로그인한 화면의 브라우저 확인" 근처, #91 `node_modules` → 새 한 줄 항목, #80 SHA 정책(저장소 설정이 SHA 고정 요구, 태그 액션 워크플로는 실패, 동적 CodeQL 은 안 막힘) → 'Dependabot' 의 SHA 줄에 합침, #65 `human-gate` 3번 도는 이유 → 'Dependabot' 에 한 줄.
  6. `## 끝나서 배포된 것`, `## 남은 확인` 절은 없음.
- [ ] **Step 2: 대조.** 옛 `남은 확인` 의 각 줄이 Global Constraints 의 세 갈래 중 어디로 갔는지 확인한다(옛 파일은 `git show HEAD:docs/status.md`).
- [ ] **Step 3: 확인.** `grep -o '#[0-9]\+' docs/status.md | sort -u` 에 `N_지적`·`N_확인`·`N_기준점`·`N_상한` 이 있고, `wc -c docs/status.md` 가 줄었는지(기대: 약 30K 안팎).

### Task 3: `CLAUDE.md` 갱신 규칙

**Files:** Modify: `CLAUDE.md:50`, `CLAUDE.md:75`, 필요하면 `CLAUDE.md:61`

- [ ] **Step 1: 50행을 바꾼다.** 뜻(문구 다듬기는 자유, 지금 말투):
  - 이슈가 끝나면 `docs/status.md` '다음 할 일' 을 고치고, 새로 알게 된 함정·도구 팁만 '알아 둘 것' 에 더한다. 끝난 기록·프로덕션 확인 기록은 적지 않는다(PR 과 git 이 기록).
  - 사용자가 실제로 해 볼 확인은 '실제로 써 볼 것' 이슈에, 사용자 결정이 필요한 것은 새 이슈로.
  - 이어서 지금의 "사용자에게 새 세션을 권한다 …" 부분은 그대로.
- [ ] **Step 2: 61행 "고치지 않은 것은 PR 본문 \"남은 지적\"에 적는다" 뒤에 "그리고 '남은 지적 모음' 이슈에 PR 링크와 한 줄을 더한다" 를 붙인다.**
- [ ] **Step 3: 75행의 "`docs/status.md` '남은 확인' 에" 를 "`docs/status.md` '적용 안 된 마이그레이션' 절(없으면 만든다)에" 로 바꾼다.** 확인: `grep -n "status.md" CLAUDE.md` 의 모든 줄이 가리키는 절('다음 할 일', '알아 둘 것', '적용 안 된 마이그레이션', 'Dependabot', '롤백 금지선')이 새 `status.md` 에 있거나(있을 때만 생기는 절은 그 규칙대로) 문구상 만들게 되어 있다.

### Task 4: 검사·커밋·PR

**Files:** `docs/status.md`, `CLAUDE.md`, 이 계획 파일.

- [ ] **Step 1: `npm run lint > /tmp/…/lint.txt; echo $?`** (scratchpad 경로) → 0. `npm run typecheck` → 0(코드 변경 없음, 확인만).
- [ ] **Step 2: 커밋·push.** 메시지 `docs: status.md 줄이기 — 남은 일은 이슈로, 갱신 규칙 바꿈 (#108)` + attribution.
- [ ] **Step 3: PR #116 본문 갱신.** 맨 위 "사람 확인 필요: `CLAUDE.md` 작업 흐름 규칙이 바뀜(위험 경로)". 새 이슈 4개 링크, 줄어든 바이트(전 56,918 → 후), 옮긴 곳 요약, `Closes #108`, 남은 지적 절.
- [ ] **Step 4: `/code-review` → draft 해제 → Codex 결과 → 사용자 `human-approved` 대기 → 자동 머지.** (`CLAUDE.md` '작업 흐름')
