# Dependabot 버전 업데이트 (#65) — 짧은 설계

## 왜
의존성 새 버전을 사람이 챙기지 않는다. 2026-11-21 기준 밀린 것: 작은 버전 better-auth 1.7.27, react·react-dom 19.3.1, tailwind 4.3.5, biome 2.6.8 / 큰 버전 TypeScript 7, `@types/node` 26.
새 버전 PR 을 저절로 받되, 사용자 손은 적게, 위험한 것은 확인을 거쳐 들어오게 한다.

## 목표 · 하지 않을 것
- 목표: `.github/dependabot.yml` 로 npm 과 GitHub Actions 새 버전 PR 을 주 1회 받는다. 안전한 것은 묶어서 CI 만 보고 넣고, 위험한 것은 세션이 확인한다.
- 하지 않을 것: 보안 알림·보안 업데이트·비밀값 검사·CodeQL(저장소 설정, 범위 밖). Node 런타임 버전 자동 갱신(Dependabot 이 못 함). 자동 머지.
- 실패로 볼 것: Dependabot PR 때문에 `human-gate` 를 느슨하게 하는 것(공급망 변경이야말로 사람이 볼 곳이다). PR 이 쏟아지거나 늘 빨간불이라 사용자가 무시하게 되는 것.

## 방식
- **고른 것: Dependabot (`.github/dependabot.yml`)**. GitHub 기본 기능이라 앱 설치·권한이 따로 없다(정리 원칙: 공식 도구 먼저).
- 버린 것: Renovate — 기능은 많지만 외부 앱 설치와 설정이 더 필요하고, 이 저장소 규모에서 얻는 게 적다.
- 처리 방식(사용자 결정, A안): PR 을 두 종류로 나눈다.
  - **CI 만 보고 넣는 PR** — `npm-minor-and-patch` 묶음, `actions` 묶음. 사용자가 GitHub 에서 CI `check` 통과를 보고 `human-approved` 를 붙여 머지한다. 세션 없음.
  - **세션이 확인하는 PR** — 그 밖 모두(큰 버전, 인증·DB 묶음, Biome). 사용자가 새 Claude 세션에 맡기고, 세션이 확인한 뒤 결과를 알리면 사용자가 라벨을 붙여 머지한다.
  - CI 만 보고 넣는 PR 이 빨간불이면 세션에 맡긴다.

## 설정 (`.github/dependabot.yml`)
공통: 주 1회 월요일 09:00 `Asia/Seoul`, `cooldown.default-days: 7`(갓 올라온 버전 — 오염된 배포 등 — 을 피함. 보안 업데이트에는 걸리지 않음, 문서 확인). 열린 PR 상한·라벨(`dependencies` 등)·`versioning-strategy`(앱이라 `increase`: `^1.0.0` → `^1.2.0`)는 기본값. 파일 맨 위에 왜 필요한지 한 줄(정리 원칙).

### npm (커밋·PR 제목 `prefix: "deps"`)
| 묶음 | 대상 | 업데이트 | 처리 |
|---|---|---|---|
| `auth-db` | `better-auth`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` | 전부 | 세션 |
| `react` | `react`, `react-dom`, `@types/react`, `@types/react-dom` | major | 세션 |
| `tailwind` | `tailwindcss`, `@tailwindcss/*` | major | 세션 |
| `dnd-kit` | `@dnd-kit/*` | major | 세션 |
| `npm-minor-and-patch` | `*`, 단 `auth-db` 4개와 `@biomejs/biome` 제외 | minor·patch | CI 만 |
| (묶음 없음) | 그 밖 major, `@biomejs/biome` 의 모든 업데이트 | — | 세션, 패키지마다 PR |

- `ignore`: `@types/node` `>=27` — 런타임(Vercel `nodeVersion: 26.x`, CI Node 26)보다 앞선 타입을 받지 않음. 런타임을 올릴 때 이 줄도 올린다.

이유:
- **짝 묶음(`react`·`tailwind`·`dnd-kit`)**: 큰 버전이 패키지마다 따로 오면 짝(`react`↔`react-dom` 등)이 어긋나 둘 다 깨진다. 작은 버전은 `npm-minor-and-patch` 에 함께 들어가므로 major 만 묶는다.
- **`auth-db`**: better-auth 는 작은 버전에서도 DB 칸 추가를 요구할 때가 있어 빌드는 통과해도 로그인이 깨질 수 있다(사용자 결정: 작은 버전도 세션). drizzle 은 0.x 라 Dependabot 이 "minor" 로 보는 0.45 → 0.46 도 깨지는 변경일 수 있고, drizzle-kit 은 마이그레이션 생성이 바뀔 수 있다. 넷이 서로 엮여(Drizzle 어댑터) 한 PR 로 받는다.
- **Biome 따로**: 2.6.8 을 지금 저장소에 돌려 보니 `biome check` 가 실패한다(새로 Markdown 서식을 검사해 `docs/`·`CLAUDE.md` 등 18개 파일 오류, `biome.json` 의 `$schema` 버전 불일치). Biome 은 올릴 때마다 설정 옮기기(`biome migrate`)·서식 정리가 따를 수 있어 묶음을 빨간불로 만든다.
- 묶음 판정(dependabot-core `dependency_group_engine.rb` 확인): 한 패키지가 여러 묶음 패턴에 맞아도 `update-types` 가 겹치지 않는 묶음끼리는 함께 받는다(예: `react` 의 minor 는 `npm-minor-and-patch`, major 는 `react`). 어느 묶음에도 맞지 않는 업데이트는 패키지마다 PR.

### github-actions (커밋·PR 제목 `prefix: "ci"`)
| 묶음 | 대상 | 업데이트 | 처리 |
|---|---|---|---|
| `actions` | `*` | 전부 | CI 만 |

## 함께 바꾸는 것
- `vercel.json`: `git.deploymentEnabled` 에 `"dependabot/**": false`. 이유: 미리보기마다 Neon 에 `preview/…` DB 브랜치가 생기고 지워지지 않는다(2026-11-17–18 것 6개가 아직 남음) → Dependabot PR 이 쌓이면 Neon 브랜치 한도에 걸릴 수 있다. 미리보기는 Vercel 로그인(SSO)으로 막혀 있고 Google 로그인도 미리보기 주소에서는 안 될 가능성이 커 쓸모가 적다. 빌드는 CI `check` 가 확인한다. 브랜치 이름이 `dependabot/npm_and_yarn/…` 처럼 `/` 가 둘이라 `*` 가 아니라 `**`(minimatch).
- `human-gate.yml` 의 Node 22 → 26(CI·Vercel 과 맞춤, 22 는 2027-04 지원 종료). Dependabot 은 `node-version` 을 올려 주지 않는다.
- `CLAUDE.md` '작업 흐름'에 **Dependabot PR** 단락:
  - CI 만 보고 넣는 PR(`npm-minor-and-patch`, `actions`)은 사용자가 CI 통과를 보고 라벨·머지. 빨간불이면 세션에 맡긴다. 문제 패키지만 빼려면 PR 에 `@dependabot ignore <패키지>`.
  - 그 밖 PR 은 사용자가 새 세션에 "Dependabot PR #N" 을 맡긴다. 세션은 릴리스 노트·마이그레이션 안내를 읽고, PR 브랜치에서 lint·typecheck·test·build, 화면에 영향이 있으면 브라우저 확인, `auth-db` 는 Better Auth 스키마 변경 요구와 drizzle-kit 생성 결과(`npm run db:generate` 로 빈 마이그레이션인지)를 보고, 결과를 PR 댓글로 남긴다.
  - 코드를 고쳐야 하면 Dependabot 브랜치에 push 하지 않고, 세션 브랜치에 올림+수정을 담아 새 PR 을 연다(본문에 Dependabot PR 번호. 올림이 main 에 들어가면 Dependabot PR 은 저절로 닫힌다). 스키마 변경이 필요하면 마이그레이션 PR 규칙을 따른다.
  - 받지 않기로 하면 PR 에 `@dependabot ignore this major version`(또는 `… minor version`).
  - Dependabot PR 은 자동 머지를 켜지 않는다. 머지는 사용자가.
- `docs/status.md`: 끝난 것·알아 둘 것.

## 확인한 사실
- Dependabot 이 연 PR 의 `pull_request` 워크플로는 쓰기 권한·Actions 시크릿이 없다. `ci.yml` 은 둘 다 쓰지 않는다(가짜 환경 변수로 build).
- `human-gate` 는 `pull_request_target` 이다. 기준 브랜치(main)를 Dependabot 이 만든 게 아니므로 보통 토큰을 받아 댓글·라벨을 다룰 수 있다(GitHub 문서 "Dependabot on GitHub Actions"). 사람이 라벨을 붙이는 `labeled` 실행은 사람이 행위자다. 저장소가 공개여도 PR 코드는 실행하지 않으므로 그대로 안전하다.
- 승인 뒤 Dependabot 이 PR 을 다시 만들면(rebase·새 버전) 위험 변경 해시가 바뀌어 게이트가 라벨을 뗀다. 안전한 쪽이며 그대로 둔다.
- `actions` 묶음처럼 `.github` 만 바꾼 커밋은 `vercel.json` 의 `ignoreCommand` 가 원래 빌드를 건너뛴다.

## 처음 켰을 때 예상
머지 직후 Dependabot 이 돌아(7일 기다림을 지난 버전만) PR 을 연다: `npm-minor-and-patch`(react·react-dom 19.3.1, tailwind 둘 4.3.5), `auth-db`(better-auth 1.7.27), Biome 2.6.8, TypeScript 7, `@types/node` 26, Actions 는 새 버전이 있으면 `actions`. TypeScript 7 은 Next 16 과 맞는지 세션이 판단한다(맞지 않으면 ignore).

## 사용자에게 맡긴 것
- Neon 에 남은 `preview/…` 브랜치 6개 지우기(Neon MCP 가 읽기 전용이라 콘솔에서).

## 구현자에게 남긴 것
- YAML 세부 서식, 주석 문구.
- 첫 Dependabot PR 들에서 묶음이 표대로 나뉘는지, `human-gate` 가 댓글·라벨을 다루는지, Vercel 미리보기가 생기지 않는지 확인해 status 에 적는다.
