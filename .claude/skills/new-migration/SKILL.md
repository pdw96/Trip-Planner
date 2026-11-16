---
name: new-migration
description: Drizzle 스키마를 바꾸고 마이그레이션을 생성·검토하는 절차. 테이블/컬럼/인덱스를 추가·변경할 때 사용자가 /new-migration 으로 호출한다.
disable-model-invocation: true
argument-hint: "[바꾸려는 스키마 변경 설명]"
---

# new-migration

요청된 변경: $ARGUMENTS

스키마 변경은 항상 아래 순서로 진행한다. 마이그레이션 **적용**은 이 절차에 포함되지 않는다.

## 1. 스키마 수정

- `src/db/schema.ts` 만 고친다. `drizzle/` 아래 파일은 손으로 만들거나 고치지 않는다 (훅이 막음).
- `drizzle-orm/pg-core` 의 `pgTable` 을 쓰고, 테이블·컬럼 이름은 snake_case 로 맞춘다.
- 기존 테이블에 컬럼을 추가할 때는 nullable 이거나 `default` 가 있어야 한다. 그렇지 않으면 3번의 파괴적 변경에 해당한다.

## 2. 마이그레이션 생성

```bash
npm run db:generate
```

- drizzle-kit 이 rename 여부를 대화형으로 물으면 추측하지 말고 멈춰서 사용자에게 묻는다.
- "No schema changes" 가 나오면 1번 수정이 실제로 export 됐는지 확인한다.

## 3. 생성된 SQL 검토

새로 생긴 `drizzle/*.sql` 을 처음부터 끝까지 읽고 다음을 찾는다.

| 패턴 | 위험 |
|------|------|
| `DROP TABLE`, `DROP COLUMN` | 데이터 손실 |
| `ALTER COLUMN ... SET DATA TYPE` | 캐스팅 실패, 테이블 재작성 |
| `SET NOT NULL`, default 없는 `NOT NULL` 컬럼 추가 | 기존 행 때문에 실패 |
| `DROP CONSTRAINT`, `DROP INDEX` | 무결성·성능 저하 |
| 컬럼/테이블이 DROP + ADD 쌍으로 나옴 | rename 이 삭제 후 재생성으로 잡힘 |

하나라도 해당하면 **파괴적 변경**이다. 더 진행하지 말고 해당 SQL 문, 영향받는 데이터, 안전한 대안(nullable 로 추가 → 백필 → NOT NULL 처럼 단계 나누기)을 보고한다.

SQL 이 의도와 다르면 생성된 파일을 고치지 말고, schema.ts 를 고친 뒤 사용자 확인을 받아 방금 생성된 마이그레이션을 지우고 다시 생성한다.

## 4. 검증

```bash
npm run lint
```

```bash
npm run typecheck
```

둘 다 통과해야 한다.

## 5. 보고

- 바뀐 스키마 요약
- 생성된 마이그레이션 파일 이름과 SQL 전문
- 파괴적 변경 여부 판정과 근거
- 적용 명령: `npm run db:migrate` — 사용자가 SQL 을 확인한 뒤 직접 실행하거나 명시적으로 지시했을 때만 실행한다.
