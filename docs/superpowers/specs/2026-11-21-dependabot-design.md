# Dependabot 버전 업데이트 (#65) — 짧은 설계

## 왜
의존성 새 버전을 사람이 챙기지 않는다. 2026-11-21 기준 밀린 것: 작은 버전 better-auth 1.7.27, react·react-dom 19.3.1, tailwind 4.3.5, biome 2.6.8 / 큰 버전 TypeScript 7, `@types/node` 26.
새 버전 PR 을 저절로 받되, 사용자 손은 적게, 큰 버전은 확인을 거쳐 들어오게 한다.

## 목표 · 하지 않을 것
- 목표: `.github/dependabot.yml` 로 npm 과 GitHub Actions 새 버전 PR 을 주 1회 받는다. 작은 버전은 한 PR, 큰 버전은 패키지마다 따로.
- 하지 않을 것: 보안 알림·보안 업데이트·비밀값 검사·CodeQL(저장소 설정, 범위 밖). Node 런타임 버전 자동 갱신(Dependabot 이 못 함). 자동 머지.
- 실패로 볼 것: Dependabot PR 때문에 `human-gate` 를 느슨하게 하는 것(공급망 변경이야말로 사람이 볼 곳이다). PR 이 쏟아져 사용자가 무시하게 되는 것.

## 방식
- **고른 것: Dependabot (`.github/dependabot.yml`)**. GitHub 기본 기능이라 앱 설치·권한이 따로 없다(정리 원칙: 공식 도구 먼저).
- 버린 것: Renovate — 기능은 많지만 외부 앱 설치와 설정이 더 필요하고, 이 저장소 규모에서 얻는 게 적다.
- 처리 방식(사용자 결정, A안):
  - **작은 버전 묶음**(npm patch·minor 한 PR, Actions 한 PR): 사용자가 GitHub 에서 CI `check` 통과를 보고 `human-approved` 를 붙여 머지한다. 세션 없음.
  - **큰 버전**(패키지마다 PR): 사용자가 새 Claude 세션에 맡긴다. 세션이 바뀐 점을 읽고 확인한 뒤 결과를 알리고, 사용자가 라벨을 붙여 머지한다.

## 설정 (`.github/dependabot.yml`)
| 항목 | npm | github-actions |
|---|---|---|
| 주기 | 주 1회 월요일 09:00 `Asia/Seoul` | 같음 |
| 묶음 | `npm-minor-and-patch`(update-types minor·patch). major 는 묶지 않아 패키지마다 PR | `actions`(모든 업데이트 한 PR) |
| 기다림(`cooldown`) | `default-days: 7` — 갓 올라온 버전(오염된 배포 등)을 피함. 보안 업데이트에는 걸리지 않음(문서) | `default-days: 7` |
| 커밋·PR 제목 | `prefix: "deps"` | `prefix: "ci"` (저장소의 `ci:`·`docs:`·`fix:` 와 맞춤) |
| 무시 | `@types/node` `>=27` — 런타임(Vercel `nodeVersion: 26.x`, CI Node 26)보다 앞선 타입을 받지 않음. 런타임을 올릴 때 이 줄도 올린다 | 없음 |
| 그 밖 | 열린 PR 상한·라벨(`dependencies` 등)·`versioning-strategy`(앱이라 `increase`: `^1.0.0` → `^1.2.0`)는 기본값 | 기본값 |

파일 맨 위에 왜 필요한지 한 줄(정리 원칙).

## 함께 바꾸는 것
- `human-gate.yml` 의 Node 22 → 26(CI·Vercel 과 맞춤, 22 는 2027-04 지원 종료). Dependabot 은 `node-version` 을 올려 주지 않는다.
- `CLAUDE.md` '작업 흐름'에 **Dependabot PR** 단락:
  - 작은 버전 묶음은 사용자가 CI 통과를 보고 라벨·머지.
  - 큰 버전은 사용자가 새 세션에 "Dependabot PR #N" 을 맡긴다. 세션은 릴리스 노트·마이그레이션 안내를 읽고, PR 브랜치에서 lint·typecheck·test·build, 화면에 영향이 있으면 브라우저 확인을 하고, 결과를 PR 댓글로 남긴다.
  - 코드를 고쳐야 하면 Dependabot 브랜치에 push 하지 않고, 세션 브랜치에 올림+수정을 담아 새 PR 을 연다(`Closes` 대신 본문에 Dependabot PR 번호. 올림이 main 에 들어가면 Dependabot PR 은 저절로 닫힌다).
  - 받지 않기로 하면 PR 에 `@dependabot ignore this major version`.
  - Dependabot PR 은 자동 머지를 켜지 않는다. 머지는 사용자가.
- `docs/status.md`: 끝난 것·알아 둘 것.

## 확인한 사실
- Dependabot 이 연 PR 의 `pull_request` 워크플로는 쓰기 권한·Actions 시크릿이 없다. `ci.yml` 은 둘 다 쓰지 않는다(가짜 환경 변수로 build).
- `human-gate` 는 `pull_request_target` 이다. 기준 브랜치(main)를 Dependabot 이 만든 게 아니므로 보통 토큰을 받아 댓글·라벨을 다룰 수 있다(GitHub 문서 "Dependabot on GitHub Actions"). 사람이 라벨을 붙이는 `labeled` 실행은 사람이 행위자다.
- 승인 뒤 Dependabot 이 PR 을 다시 만들면(rebase·새 버전) 위험 변경 해시가 바뀌어 게이트가 라벨을 뗀다. 안전한 쪽이며 그대로 둔다.
- `vercel.json` 은 `dependabot/*` 브랜치 미리보기를 끄지 않는다 → Dependabot PR 마다 미리보기 빌드(하루 100회 계정 한도를 씀). 묶음으로 주에 몇 번 수준이고, 새 버전을 실제 배포에서 볼 수 있어 그대로 둔다.

## 처음 켰을 때 예상
머지 직후 Dependabot 이 돌아(7일 기다림을 지난 버전만) PR 을 연다: npm 작은 버전 묶음 1개, 큰 버전 TypeScript 7·`@types/node` 26 각 1개, Actions 는 새 버전이 있으면 1개. TypeScript 7 은 Next 16 과 맞는지 세션이 판단한다(맞지 않으면 ignore).

## 구현자에게 남긴 것
- YAML 세부 서식, 주석 문구.
- 첫 Dependabot PR 에서 `human-gate` 가 실제로 댓글·라벨을 다루는지 확인해 status 에 적는다.
