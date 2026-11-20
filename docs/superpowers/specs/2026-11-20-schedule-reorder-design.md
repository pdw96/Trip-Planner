# 일정 순서를 끌어서 바꾸기 (#41)

2026-11-20. 사용자 승인.

## 1. 왜

#37 설계 대화에서 나온 사용자 생각(이슈 #41).

- 확정 일정(교통편·예약)만 시각을 적고, 나머지는 시각 없이 두고 싶다.
- 그런데 시각 없는 일정은 그날 맨 뒤로 정렬돼 확정 일정 사이에 끼울 수 없다.
- 일정표·지도 N일차 동선·일정 사이 이동 시간(#37)이 모두 이 순서를 따르므로, 실제와 다른 구간("식당 → 인사동")이 나온다.

여행 중에도 쓴다. 예약 없이 "13시쯤" 간 곳에서 웨이팅이 길어 일정이 밀리면, 사용자는 남은 일정을 그대로 할지 몇 개를 뺄지 직접 정한다(설계 대화). 앱이 시각을 대신 계산하지 않고, 그 결정(순서 바꾸기·지우기·다른 날로 옮기기)을 휴대폰에서 바로 반영할 수 있으면 된다.

## 2. 목표 · 비목표 · 반목표

- 목표
  - 하루 안에서 일정 줄을 마우스·터치로 끌어 순서를 바꾼다(키보드로도 된다).
  - 시각 있는 일정끼리는 늘 시각 순서다. 그 안에서 시각 없는 일정은 원하는 자리에 둔다(사용자 결정 A).
  - 일정표·지도 N일차 동선·일정 사이 이동 시간이 바꾼 순서를 따른다.
- 비목표
  - 시각 자동 계산·채우기, 밀린 일정 자동으로 미루기(#37 과 같음, 사용자 확인).
  - "건너뜀" 같은 새 일정 상태. 필요하면 따로 이슈.
  - 다른 날로 끌어 옮기기. 날짜는 지금처럼 고치기 양식에서 바꾼다.
  - "쯤" 시각을 확정 시각과 다르게 다루기. "13시쯤"도 그냥 13:00 이다(사용자 확인).
- 반목표 (돌아가도 실패인 것)
  - 시각 있는 일정이 시각과 어긋난 순서로 저장된다(10:00 이 09:00 위).
  - 휴대폰에서 줄을 스크롤하려는데 끌기가 시작되거나, 줄을 눌러 고치려는데 끌기가 된다.
  - 끌어 놓은 뒤 저장이 끝날 때까지 줄이 원래 자리로 튀었다가 돌아온다.
  - 바꾼 순서와 맞지 않는 이동 시간 줄이 보인다("경복궁에서 → 인사동"이 인사동이 이미 다른 자리에 있는데 남아 있음).
  - 마이그레이션이 지금 있는 일정의 보이는 순서를 바꾼다.

## 3. 제약

- 마이그레이션 PR(CLAUDE.md '마이그레이션 PR'): 열 하나 추가, 파괴적 아님. 자동 머지 없이 사람이 SQL 을 보고 `human-approved` → `npm run db:migrate`(실행 직전 사람 확인) → 자동 머지.
- `drizzle/` 아래 생성 파일은 손으로 고치지 않는다 → 마이그레이션에 기존 행 채우기(backfill) SQL 을 넣을 수 없다. 그래서 순서 칸은 비울 수 있게(nullable) 하고, 비어 있으면 지금 정렬을 쓴다(§5.1).
- 위험 경로: `src/db/schema.ts`, `drizzle/**`, `package.json`, `package-lock.json`. 사람 승인 한 번에 함께 본다.
- neon-http 에 트랜잭션이 없다. 여러 행 쓰기는 한 SQL 문으로 한다.
- 여행 접근 조건은 `accessibleTrips(userId)` 하나(#15 공유가 그것만 바꾸도록). 하위 쿼리는 일정 id 와 여행 id 를 같은 문 안에서 함께 묶는다(`schedule-items.ts` 의 `itemCondition` 처럼).
- 단위 시험 대상 순수 모듈(`src/lib/*.ts`)은 다른 모듈을 import 하지 않는다.
- Next 16 Activity: 지나온 화면은 `display:none` 으로 보관된다.

## 4. 방법

### 4.1 시각과 순서가 부딪칠 때 (사용자가 A 를 고름)

| | 규칙 | 장점 | 단점 |
|---|---|---|---|
| **A** | **시각 있는 일정끼리는 늘 시각 순. 시각 없는 일정만 자유** | 확정 일정이 뼈대, 시각이 틀린 순서로 보일 일이 없다 | 시각 있는 일정은 앞뒤 확정 일정을 넘지 못한다 |
| B | 모든 일정 자유, 시각은 글자일 뿐(어긋나면 표시) | 가장 자유롭다 | 시각을 고쳐도 자리가 따라가지 않는다 |

### 4.2 옮기는 방법 (사용자가 1 을 고름, "마우스나 터치로 드래그")

| | 방법 | 장점 | 단점 |
|---|---|---|---|
| **1** | **`@dnd-kit/core` 6.3 + `@dnd-kit/sortable` 10** | 마우스·터치·키보드, 화면 끝 자동 스크롤, 스크롤과 끌기 구분이 이미 됨. React 19 와 씀 | `package.json` 위험 경로, 브라우저 코드 수십 KB |
| 2 | 직접 만들기(pointer 이벤트) | 의존성 없음 | 터치 스크롤 구분·자동 스크롤·키보드를 직접 만들고 유지. 휴대폰에서 어색할 위험이 가장 큼 |
| 3 | 브라우저 기본 HTML drag & drop | 코드 가장 적음 | 휴대폰 터치 지원이 고르지 않음 — 여행 중 휴대폰 사용과 어긋나 제외 |

`@dnd-kit/react`(0.x, 새 API)는 1.0 전이라 쓰지 않는다.

## 5. 설계

### 5.1 저장

`schedule_items` 에 열 하나.

```ts
// 그날 안의 순서(작을수록 위). 비어 있으면 그날은 아직 순서를 저장한 적이 없어 시각 순 정렬을 쓴다(#41).
position: integer("position"),
```

예상 마이그레이션(`npm run db:generate` 결과, 손으로 고치지 않음):

```sql
ALTER TABLE "schedule_items" ADD COLUMN "position" integer;
```

파괴적이지 않다(열 추가, nullable, 기본값 없음). 기존 행은 모두 NULL.

정렬(`listScheduleItems` 와 `compareScheduleItems` 를 같게):

```
date ASC, position ASC NULLS LAST, time ASC NULLS LAST, created_at ASC, id ASC
```

- 한 날은 "모두 NULL"(아직 손대지 않은 날) 아니면 "모두 값 있음"이 정상 상태다. 모두 NULL 이면 지금 정렬과 똑같다 → 마이그레이션 직후 보이는 순서가 바뀌지 않는다.
- 순서에 영향을 주는 쓰기는 늘 **그날 전체의 position 을 0, 1, 2, … 로 다시 쓴다**(한 문, §5.4). 그래서 손댄 날은 모두 값이 있다.
- 순서 쓰기가 실패해 한 행만 NULL 로 남으면 그 줄은 그날 맨 뒤로 간다(NULLS LAST). 사용자가 끌어 옮기면 다시 정상이 된다.

### 5.2 규칙 (사용자 결정 A 와 설계 대화에서 정한 것)

"시각 순서 조건": 그날 순서에서 시각 있는 일정만 골라 보면 시각이 줄지 않는다(같은 시각끼리는 어느 순서든 된다).

| 일 | 그날 순서 |
|---|---|
| 끌어 놓기 | 놓은 순서가 시각 순서 조건을 지키면 그대로. 아니면 놓을 수 없다 — 원래 자리로 돌아가고 "시각 순서대로만 옮길 수 있어요" 문구를 잠깐 보인다 |
| 새 일정, 시각 없음 | 그날 맨 뒤 |
| 새 일정, 시각 있음 | 그날 순서에서 시각이 이 일정보다 **늦은** 첫 일정 바로 앞. 없으면 맨 뒤. (사이에 시각 없는 일정 무리가 있으면 그 무리 뒤, 곧 다음 확정 일정 바로 앞이 된다) |
| 고치기, 날짜를 옮김 | 옮겨 간 날에서 새 일정과 같이. 떠난 날은 다시 쓰지 않는다(빈 번호는 괜찮다) |
| 고치기, 같은 날, 시각을 새로 적거나 바꿈 | 고치기 전 자리에서 새 시각으로 시각 순서 조건을 지키면 그 자리 그대로. 아니면 그 일정을 빼고 "새 일정, 시각 있음"처럼 다시 넣는다 |
| 고치기, 같은 날, 시각을 지움 | 고치기 전 자리 그대로 |
| 고치기, 시각·날짜 그대로 | 순서 쓰기 없음 |
| 지우기, 완료 체크 | 순서 쓰기 없음 |

- 시각 있는 일정도 끌 수 있다. 앞뒤 확정 일정 사이에서 시각 없는 일정들 앞뒤로 움직인다(설계 대화에서 예로 확인).
- 여행 기간 밖 일정도 날짜마다 같은 규칙으로 끌어 옮긴다.
- 손대지 않은 날(모두 NULL)에서 시각을 지우면 "고치기 전 자리"를 지키기 위해 그날 전체를 쓴다. 지금 정렬대로라면 맨 뒤로 가 버리기 때문이다.

### 5.3 순수 모듈 `src/lib/schedule-order.ts` (새 파일, import 없음, node --test)

규칙을 이 모듈 하나에 둔다. 서버 쿼리와 브라우저의 끌기 판정이 같은 함수를 쓴다.

- `keepsTimeOrder(items: { time: string | null }[]): boolean` — 시각 순서 조건.
- `insertByTime(order, item)` — "새 일정, 시각 있음/없음" 자리.
- `orderAfterEdit(before, edited)` — §5.2 고치기 행들. 순서를 쓸 필요가 없으면 null.
- 끌어 놓기 서버 검증: 보낸 id 목록이 그날 지금 일정 id 집합과 같은지(중복 없음) + `keepsTimeOrder`.

시각 비교는 "HH:MM" 이든 DB 의 "HH:MM:SS" 든 같은 꼴로 맞춰 비교한다(만드는 사람 몫).

### 5.4 서버

**쿼리** (`src/db/queries/schedule-items.ts`, 모두 `userId` 범위):

- `listDayOrder(userId, tripId, date)` — 그날 일정의 `id`·`time`·`position` 을 §5.1 정렬로. 끌어 놓기 검증과 넣기·고치기 뒤 자리 계산에 쓴다.
- `writeDayOrder(userId, tripId, date, orderedIds)` — 한 문:
  `UPDATE schedule_items SET position = v.pos FROM (VALUES …) v(id, pos) WHERE schedule_items.id = v.id AND schedule_items.date = $date AND <inAccessibleTrip(userId, tripId)>`.
  바뀐 행 수가 목록 길이와 다르면 false. `updated_at` 은 바꾸지 않는다(순서는 일정 내용 변경이 아니다 — 만드는 사람 판단으로 바꿔도 된다).
- **주의**: `createScheduleItem` 의 장소 경로는 `insert … select` 로 모든 열을 테이블 정의 순서대로 고른다. `position` 열을 더하면 그 select 에도 `position` (NULL)을 넣어야 한다. `createScheduleItemWithNewPlace`·`updateScheduleItemWithNewPlace` 는 열 이름을 적으므로 그대로 된다.

**Server Action** `reorderScheduleItemsAction(tripId, date, orderedIds)` → `{ ok: boolean }` (`schedule-actions.ts`):

1. `getCurrentUser()` 없으면 `redirect("/")`.
2. 입력 검증: `date` 는 날짜 문자열, `orderedIds` 는 문자열 배열이고 길이 1–200, 모두 uuid, 중복 없음. 아니면 `{ ok: false }`.
3. `listDayOrder` → 집합이 같고 `keepsTimeOrder` 이면 `writeDayOrder`. 다르면(그 사이 다른 창에서 넣거나 지움) `{ ok: false }`.
4. 성공하면 `revalidatePath`. 대상 없음·검증 실패·저장 실패를 모두 `{ ok: false }` 로(완료 체크처럼, 남의 일정이 있는지 드러나지 않게). 연결 실패(reject)도 같은 실패로 다룬다.

**넣기·고치기 뒤 자리** (`createScheduleItemAction`, `updateScheduleItemAction`):

- 일정 쓰기가 성공한 뒤 §5.2 대로 그날 순서를 계산해 `writeDayOrder`. 고치기는 쓰기 **전에** `listDayOrder` 로 고치기 전 순서를 읽어 둔다(이미 `getScheduleItem` 으로 고치기 전 날짜·시각을 안다).
- 순서 쓰기가 실패해도 일정 저장은 성공으로 돌려준다(저장은 됐으므로 "저장 실패"를 보이지 않는다). 그 줄은 맨 뒤나 옛 자리에 보일 수 있고 끌어서 고칠 수 있다(§5.1). 서버 로그에 한 줄 남긴다(시크릿 없음).
- Google 장소 경로(#35)든 아니든 일정 쓰기 뒤에 같은 방식으로 한다.

**함께 따라오는 것**: 지도 칸(`map-section.tsx`)·하루 동선 Route Handler(`day-route-loader.ts`)·일정표 이동 줄은 모두 `listScheduleItems` 순서를 쓰므로 정렬만 바꾸면 따라온다. `daySignature` 에 구간의 일정 id 가 들어 있어 순서가 바뀌면 서명이 바뀌고 이동 시간을 다시 묻는다.

### 5.5 화면

```
1일차 · 12월 3일 (목)
        ↓ ○○호텔에서 · 🚇 25분 · 2호선           길찾기 ↗
⠿ 09:30  경복궁                                   ☐
⠿        인사동                                   ☐
⠿        북촌                                     ☐
        ↓ 북촌에서 · 🚇 18분                       길찾기 ↗
⠿ 18:00  ○○식당                                   ☐
  + 일정 추가
```

- 줄 맨 왼쪽에 손잡이 ⠿. **손잡이로만** 끈다(줄을 눌러 고치기, 줄 위 터치 스크롤과 겹치지 않게). 손잡이에만 `touch-action: none`. 휴대폰에서 누르기 쉬운 크기(약 44px 높이 영역).
- 그날 일정이 하나뿐이면 손잡이를 보이지 않는다. 입력칸으로 열린 줄에는 손잡이가 없다.
- 끄는 동안 이동 시간 줄은 감춘다(어긋난 구간이 보이지 않게).
- 놓으면 바로 그 순서로 보이고(낙관적 갱신, `useOptimistic`) 저장한다. 성공하면 같은 전환 안에서 서버 값으로 바뀐다(튀지 않게). 실패하면 원래 순서로 돌아가고 "순서를 저장하지 못했어요. 다시 해 주세요." 를 잠깐(완료 체크와 같은 4초) 보인다. 집합이 달라 실패했을 수 있으므로 화면을 서버 값으로 새로 고친다.
- 저장이 끝나기 전(보이는 순서 ≠ 서버 순서)에는 그날 이동 시간 줄을 감춘다. 서버 값이 오면 새 서명으로 다시 묻는다(#37 그대로).
- 키보드: 손잡이에 포커스 → Space 로 들기, ↑↓ 로 옮기기, Space 로 놓기, Esc 로 취소(dnd-kit `KeyboardSensor` + `sortableKeyboardCoordinates`). 화면 읽기 프로그램 안내 문구는 한국어로 바꾼다(dnd-kit 기본은 영어).
- 손잡이 `aria-label`: "{일정 이름} 순서 옮기기".
- 여행 기간 밖 일정 묶음도 날짜마다 같은 목록 컴포넌트로 끈다(이동 줄은 없음).

### 5.6 만드는 사람 몫

- 끌기 목록 컴포넌트 구조(`schedule-day-items.tsx` 를 넓힐지 새 컴포넌트를 둘지). `<Fragment key={item.id}>` 로 줄을 묶는 #37 규칙은 지킨다.
- dnd-kit 센서 설정(손잡이 전용이므로 PointerSensor 짧은 거리 활성화면 충분할 것), 서버 렌더링 시 `DndContext` 의 `id` 를 고정해 hydration 경고를 막는 것.
- 끄는 중 놓을 수 없는 자리를 미리 표시할지(놓았을 때 되돌리기만 해도 목표는 채움).
- 시험: `schedule-order.ts` 단위 시험, `compareScheduleItems` 시험에 position 경우 추가. 브라우저 확인은 Playwright 로 마우스 끌기·터치 너비·키보드, 실패 되돌리기(Server Action 요청을 `page.route` 로 실패시킴), 소유권(남의 일정 id 를 섞어 보냄 → `{ ok: false }`, DB 그대로)(`docs/status.md` '알아 둘 것').

## 6. PR · 확인 순서

- 위험 경로(사람 확인 필요): `src/db/schema.ts`, `drizzle/**`(마이그레이션 0005), `package.json`·`package-lock.json`(`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`).
- 마이그레이션 PR: SQL 전문과 "파괴적 아님" 판정을 본문에. 자동 머지는 `human-approved` 와 `db:migrate` 성공 뒤.
- 인증·소유권 코드(새 Server Action·쿼리)를 건드리므로 `/security-review` 도.

PR 하나로, #12·#13 과 같은 순서로 한다. `DATABASE_URL` 은 프로덕션 DB 뿐이고, `schema.ts` 에 열을 더하면 `db.select().from(scheduleItems)` 가 그 열을 묻기 때문에 적용 전에는 로컬에서도 일정 화면이 열리지 않는다.

1. 순수 함수 시험, `npm run lint`, `npm run typecheck`, `npm run build`. 위험 경로 파일(`schema.ts`, 마이그레이션, `package.json`·lock)은 이 단계에서 **끝낸다**. 승인 뒤 다시 바꾸면 `human-gate` 가 라벨을 떼어 재승인이 필요하다.
2. draft PR 을 연다. 본문 맨 위 "사람 확인 필요", SQL 전문, 비파괴 판정.
3. 사람이 `human-approved` → `npm run db:migrate`(실행 직전 사람 확인). 열이 먼저 생겨도 지금 프로덕션 코드는 영향이 없다(열 이름을 적어 고르고, 넣을 때 `position` 은 NULL → 지금 정렬 그대로).
4. 그 뒤 브라우저 확인(§5.6, 테스트 계정 넣기·지우기는 `docs/status.md` 방식), `/code-review`, `/security-review`. 고칠 것은 위험 경로 밖 파일에서 고친다.
5. 리뷰 종료 기준을 채우면 draft 해제, 자동 머지.
