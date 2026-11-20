# 단위 시험을 CI 에서 (#22) — 짧은 설계

2026-11-20 사용자 승인.

## 왜
`src/**/*.test.mjs`(20개 파일, 184개 시험: 입력 검증·날짜·달력·예산·동선 규칙)는 로컬에서만 돈다. CI `check` 는 `.github/scripts/*.test.mjs` 만 돌려, 나중 PR 이 규칙을 깨도 초록으로 남는다.

## 목표 / 하지 않는 것
- 목표: PR 마다 단위 시험이 돌고, 실패하면 필수 검사 `check` 가 빨개진다. 로컬과 CI 가 같은 명령을 쓴다.
- 함께: CI Node 를 운영(Vercel 프로젝트 `nodeVersion: 26.x`)과 맞춘다(지금 22).
- 하지 않음: `human-gate.yml`(Node 22)과 게이트 스크립트는 손대지 않는다. Dependabot 은 별도.

## 방법 (고른 것)
시험이 `.ts` 를 바로 읽어 파일마다 `MODULE_TYPELESS_PACKAGE_JSON` 경고가 난다.
1. **명령에서 그 경고만 끈다** `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` — 고름. 앱 빌드 영향 없음.
2. `package.json` 에 `"type": "module"` — 원인은 없애지만 Next·Vercel 빌드 전체의 모듈 해석이 바뀐다. 1이 안 되면 이리로 바꾼다(그때는 빌드·브라우저 확인 다시).
3. 그대로 둠 — CI 로그에 경고 20줄.

## 바꿀 것
- `package.json` scripts: `"test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test 'src/**/*.test.mjs'"`
- `.github/workflows/ci.yml` `check`: `node-version: 26`, 게이트 스크립트 시험 다음에 `npm test`
- `CLAUDE.md` '명령'에 `npm test`, `docs/status.md` '단위 시험' 줄 갱신

## 확인
- 로컬(Node 22): `npm test` 통과, 경고 없음. Node 26 은 이 세션에 설치가 막혀 CI 로그로 확인(통과·경고 없음·lint·typecheck·build 통과).
- 위험 경로(`.github/**`, `package.json`, `CLAUDE.md`) → PR 맨 위 "사람 확인 필요", `human-approved` 필요.
