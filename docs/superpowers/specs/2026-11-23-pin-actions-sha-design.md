# 워크플로 액션을 커밋 SHA 로 고정 (#80)

작은 변경이라 짧은 설계다. 2026-11-23 사용자 승인.

## 왜

워크플로가 액션을 태그(`@v7`)로 부른다. 태그는 액션 주인이 다른 커밋으로 옮길 수 있어, 주인 계정·저장소가 털리면 우리 워크플로가 바뀐 코드를 그대로 돈다(tj-actions/changed-files 사고 유형). 특히 `human-gate.yml` 은 `pull_request_target`(쓰기 권한 토큰)으로 돌아 영향이 가장 크다. 40자리 커밋 SHA 로 고정하면 그 커밋에 묶인다.

## 목표 · 목표 아님

- 목표: 4곳(`ci.yml` 22·23, `human-gate.yml` 28·33)을 SHA + 버전 주석으로 고정. Dependabot 이 계속 올려 줄 수 있게 한다.
- 목표 아님: 앱 동작 변화, Dependabot 묶음 규칙 변경, 다른 공급망 강화(권한 축소 등).
- 실패로 볼 것: 고정한 SHA 가 지금 태그와 다른 커밋이라 실제로 도는 코드가 바뀌는 것.

## 정한 것

- 형식: `uses: actions/checkout@<40자리 SHA> # v7.0.1`. 주석은 메이저 태그(`v7`)가 아니라 그 SHA 를 가리키는 세부 버전 태그로 적는다(Dependabot 이 주석을 정확한 버전으로 고친다).
- SHA(2026-11-23 `git ls-remote --tags` 로 확인, 가벼운 태그라 값이 곧 커밋):
  - `actions/checkout`: `v7` = `v7.0.1` = `3d3c42e5aac5ba805825da76410c181273ba90b1`
  - `actions/setup-node`: `v7` = `v7.1.0` = `949feb2413d6458794dcd2491c4babbbce0c15c1`
  - 메이저 태그와 같은 커밋이라 지금 도는 코드는 그대로다.
- `.github/dependabot.yml` 은 바꾸지 않는다. Dependabot `github-actions` 는 SHA 고정도 올리고 버전 주석도 고친다. `actions` 묶음(minor·patch)과 major 개별 PR 규칙은 그대로.
- `docs/status.md` 'Dependabot' 항목에 규칙 한 줄: 액션은 40자리 SHA + `# vX.Y.Z` 주석, 새 액션도 `git ls-remote` 로 확인한 SHA.
- PR 본문에 SHA 마다 확인 명령과 결과.
- 저장소 설정 Actions → General "full-length commit SHA 고정 요구"는 **이 PR 머지 뒤 사용자가 켠다**. 이 설정이 GitHub 가 돌리는 동적 워크플로(CodeQL 기본 설정, Dependabot 업데이트)에 걸리는지 세션에서 확인하지 못했다(docs.github.com 접속 막힘). 켠 뒤 다음 PR 에서 CodeQL 분석·CI·`human-gate` 가 통과하는지 세션이 보고, 깨지면 사용자가 끈다.

## 고려한 방법

1. **SHA + 세부 버전 주석(택함)**: 고정되고, Dependabot 이 그대로 관리한다.
2. 태그 유지 + 주석만: 막아 주는 것이 없다. 택하지 않음.
3. SHA 만(주석 없음): 어느 버전인지 사람이 읽을 수 없고 Dependabot PR 제목·리뷰가 불편하다. 택하지 않음.

## 제약 · 흐름

- `.github/**` 라 위험 경로 PR: `human-approved` 필요, 자동 머지 안 함.
- `human-gate.yml` 은 PR 에서 main 의 옛 게이트가 돌아 새 내용이 시험되지 않는다. 머지 뒤 다음 PR(status 갱신)에서 게이트가 정상 동작하는지 확인한다.
- Dependabot 이 SHA 고정 PR 을 제대로 여는지는 다음 Actions 업데이트 때 확인한다(지금은 두 액션 모두 최신이라 바로 열 PR 이 없다).
- `npm run lint`(Biome 가 `.github/*.yml` 서식 검사).
