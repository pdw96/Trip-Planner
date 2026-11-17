---
name: pre-pr
description: 커밋·PR 전 점검. lint · typecheck · build 를 돌리고, 바뀐 파일에 맞는 리뷰 에이전트를 병렬로 실행해 결과를 하나로 합친다. 사용자가 /pre-pr 로 호출한다.
disable-model-invocation: true
argument-hint: "[--commit | --pr] (생략하면 점검만)"
---

# pre-pr

옵션: $ARGUMENTS

점검이 이 스킬의 일이다. 마이그레이션 **적용**(`db:migrate`)은 어떤 경우에도 하지 않는다.

## 1. 변경 범위

1. `git fetch origin main` 으로 기준을 최신으로 만든다. 실패하면 로컬 `main` 을 기준으로 쓰고 보고에 그렇게 적는다.
2. 아래 두 결과를 합쳐 변경 파일 목록을 만든다.
   - `git diff --name-only origin/main...HEAD` (커밋된 변경)
   - `git status --porcelain --untracked-files=all` (커밋 안 된 변경)
3. 변경이 없으면 그렇다고 말하고 끝낸다.

## 2. 기계 검사

순서대로 모두 돌리고, 하나가 실패해도 나머지를 계속 돌린다.

- `npm run lint`
- `npm run typecheck`
- `npm run build`

이번 변경 때문에 생긴 lint · typecheck 오류는 고치고 다시 돌린다. 변경과 무관한 기존 오류나, 환경 변수가 없어 생긴 build 실패(`DATABASE_URL is not set` 등)는 고치지 않고 보고만 한다. Better Auth 의 `BETTER_AUTH_SECRET` 경고가 나와도 build 가 끝까지 성공했으면 실패로 치지 않는다.

## 3. 리뷰 에이전트

변경 파일에 따라 고른다. 하나의 파일이 여러 행에 해당하면 해당하는 리뷰어를 모두 부른다.

| 변경 파일 | 리뷰어 |
|---|---|
| `src/**/*.ts(x)` 중 `src/app` · `src/db` · `src/lib` | `rsc-boundary-reviewer` |
| `'use server'` 파일, `route.ts`, `src/db/**`, `src/lib/session.ts`, `src/lib/auth.ts` | `authz-reviewer` |
| `src/**/*.ts(x)`, `next.config.ts` | `next16-api-reviewer` |
| 새로 생기거나 바뀐 `drizzle/*.sql` | `migration-reviewer` |

- `.claude/`, 문서, 설정 파일만 바뀌었으면 리뷰어는 부르지 않는다.
- 고른 리뷰어는 **한 메시지에서 동시에** 실행한다. 각 프롬프트에 기준 브랜치와 그 리뷰어에 해당하는 변경 파일 목록을 넣는다. 리뷰어가 다시 diff 를 계산하지 않아도 되게 하기 위해서다.
- 리뷰어 결과를 고치는 것은 이 단계의 일이 아니다. 보고하고 멈춘다. 사용자가 고치라고 하면 고친 뒤, 지적한 리뷰어만 다시 돌린다.

## 4. 보고

```
## pre-pr 결과
| 검사 | 결과 |
|---|---|
| lint | 통과 / 실패 (고침) / 실패 |
| typecheck | … |
| build | … |
| rsc-boundary-reviewer | 위반 없음 / 위반 N건 / 실행 안 함 |
| authz-reviewer | 문제 없음 / 주의 / 취약 / 실행 안 함 |
| next16-api-reviewer | … |
| migration-reviewer | 안전 / 주의 / 파괴적 / 실행 안 함 |
```

표 아래에 다음을 적는다.

- **막는 문제**: 실패한 검사, authz `취약`, migration `파괴적`, 리뷰어가 "확실한 위반"으로 분류한 것. 각각 `파일:줄` 과 한 줄 요약.
- **참고**: 판단이 갈리는 지적.
- **확인하지 못한 것**과 그 이유.

## 5. `--commit` / `--pr`

막는 문제가 하나도 없을 때만 진행한다. 있으면 진행하지 않았다고 쓰고 멈춘다.

- `--commit`: 변경을 커밋한다. 메시지는 `git log --oneline -10` 의 스타일을 따른다. 커밋할 때 Bash 가드 훅이 lint 를 한 번 더 돌린다.
- `--pr`: 커밋한 뒤 현재 브랜치를 push 하고 draft PR 을 연다. PR 본문에는 위 결과 표를 넣는다. `main` 에는 직접 push 하지 않는다.
- 새 마이그레이션이 포함돼 있으면 PR 본문에 "머지 후 `npm run db:migrate` 를 사람이 확인하고 적용해야 함"을 적는다.
