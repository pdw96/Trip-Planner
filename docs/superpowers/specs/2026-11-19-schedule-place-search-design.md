# 일정 장소 칸에서 Google 검색, 장소가 있으면 제목은 선택 (#35)

2026-11-19. 사용자 승인 대기.

## 1. 왜

#13 을 프로덕션에서 써 본 사용자 피드백 두 가지.

1. **제목과 장소를 두 번 적는다.** "시부야 스카이"를 제목에도, 장소에도 적는다. (사용자가 가장 거슬린다고 한 것)
2. **일정에 장소를 이으려면 세 단계다.** 일정 쓰기 → '가 볼 곳'에서 Google 검색으로 장소 넣기 → 일정으로 돌아와 고치기를 열고 장소 고르기.

목표: 일정 하나를 "장소 하나 고르고 저장"으로 끝낼 수 있게 한다.

## 2. 목표 · 비목표 · 반목표

- 목표
  - 장소(이어진 장소든 직접 적은 글자든)가 있으면 제목을 비워 둘 수 있다. 제목이 없으면 일정 줄에 장소 이름이 제목 자리에 보인다.
  - 일정 양식(추가·고치기)의 장소 칸에서 Google 장소를 검색해 고를 수 있다. 저장하면 그 장소가 '가 볼 곳'에도 들어가고 일정에 이어진다.
- 비목표
  - 시각 자동 계산, 일정 사이 이동 시간 표시 → #37 로 따로.
  - '가 볼 곳'의 장소 넣기 화면 바꾸기.
- 반목표 (기술적으로 돌아가도 실패인 것)
  - 고르기만 하고 저장하지 않았는데 '가 볼 곳'에 장소가 생긴다. (사용자 결정: 저장할 때만 넣는다. '가 볼 곳'은 후보 목록이다)
  - 일정 저장은 실패했는데 장소만 남는다.
  - 이미 '가 볼 곳'에 있는 장소를 다시 골랐는데 중복 오류가 나거나 장소가 둘이 된다.
  - 지금의 "여행 장소 중 고르기", "직접 적기"가 사라지거나 불편해진다.

## 3. 제약

- Google 약관(#13 설계 §3.2): DB 에 저장하는 Google 값은 `google_place_id` 와 좌표(30일)뿐. 이름표(`label`)는 사용자가 확인한 값이다. 이번 흐름에서는 사용자가 Google 후보를 보고 고른 것을 확인으로 본다(이름표는 Google 표시 이름, '가 볼 곳'에서 언제든 고친다).
- neon-http 는 대화형 트랜잭션이 없다. 여러 쓰기를 묶으려면 한 SQL 문(데이터를 바꾸는 CTE)으로 한다(`updatePlace` 가 쓰는 방식).
- 여행 접근은 `accessibleTrips(userId)` 하나로만 판단하고, 하위 id 와 여행 id 를 같은 SQL 문 안에서 함께 묶는다(`docs/status.md`).
- 여행당 장소 100개 상한, 같은 여행·같은 Google 장소 유니크 제약(`places_trip_google_place_idx`).
- 하루 할당량: Places 300, 지도 로드 300.
- 일정 제목은 DB 에서 `NOT NULL` 이다 → 마이그레이션이 필요하다(§5.1).

## 4. 방법 (사용자 결정)

### 4.1 제목 비우기

| 안 | 내용 | 판단 |
|---|---|---|
| **가. 마이그레이션 (선택)** | `schedule_items.title` 을 nullable 로. 제목이 없으면 화면에 `place` 글자 | 의미가 분명하다. '가 볼 곳'에서 이름표를 고치면 `updatePlace` 가 이어진 일정의 `place` 글자를 이미 같이 바꾸므로, 제목 없는 일정은 따로 손대지 않아도 맞게 보인다 |
| 나. 빈 글자 `""` | 마이그레이션 없음 | "없음"을 빈 글자로 나타내는 꼼수 |
| 다. 이름표를 제목에 복사 | 마이그레이션 없음 | 이름표를 고치면 제목만 옛 이름으로 남는다. 두 번 적기를 저장소로 옮긴 것일 뿐 |

### 4.2 Google 장소를 고르고 저장 (사용자 결정 A: 저장할 때만 넣기)

| 안 | 내용 | 판단 |
|---|---|---|
| **가. 한 SQL 문 (선택)** | "장소 넣기(같은 Google 장소가 이미 있으면 그것) + 일정 넣기/고치기"를 CTE 한 문으로 | 함께 되거나 함께 안 된다. 장소만 남지 않는다 |
| 나. 장소 먼저 넣고 일정 저장, 실패하면 장소 지우기 | 지금 함수를 이어 붙임 | 지우기가 실패하거나 동시에 고치면 장소가 남는다 |
| 다. 고르는 순간 넣기 (사용자 결정 B 안) | `createPlaceAction` 재사용 | 사용자가 고르지 않음: 취소해도 장소가 남는다 |

## 5. 설계

### 5.1 마이그레이션 (위험 경로, 마이그레이션 PR 규칙)

- `src/db/schema.ts`: `scheduleItems.title` 에서 `.notNull()` 을 뺀다. `npm run db:generate` 로 생성. 예상 SQL:
  `ALTER TABLE "schedule_items" ALTER COLUMN "title" DROP NOT NULL;`
- 파괴적 여부: 아니다(제약을 푼다. 기존 행은 그대로).
- 되돌리기(PR 을 포기할 때): 제목 없는 행을 채운 뒤 제약을 다시 건다. `UPDATE schedule_items SET title = coalesce(place, '일정') WHERE title IS NULL; ALTER TABLE schedule_items ALTER COLUMN title SET NOT NULL;` (PR 본문에 적는다)
- 순서: 사람이 SQL 확인 → `human-approved` → `npm run db:migrate`(직전 사람 확인) → 자동 머지. 마이그레이션이 코드보다 먼저 적용되지만, 옛 코드는 제목을 늘 채워 쓰므로 null 행이 생기지 않는다.

### 5.2 입력 규칙 (`src/lib/schedule-input.ts`)

- 제목: 선택. 단 **제목·장소 글자·이어진 장소·Google 장소가 모두 없으면** 제목 칸에 "제목이나 장소를 적어 주세요." 길이 상한(100자)은 그대로.
- 저장값: 제목이 비면 `title = null`.
- Google 장소 필드(새로 추가, 양식이 숨은 값으로 보냄): `googlePlaceId`, `googleLabel`, `googleCategory`. 검증은 `src/lib/place-input.ts` 의 장소 규칙(Google 장소 id 형식, 이름표 길이, 종류 목록)을 그대로 따른다. 순수 모듈 규칙(다른 모듈을 import 하지 않음) 때문에 필요한 규칙은 옮겨 두거나 같은 값을 다시 정의한다(구현자 판단).
- 셋 중 우선순위: Google 장소가 있으면 그것, 아니면 `placeId`, 아니면 `place` 글자. 클라이언트는 한 번에 하나만 보내도록 만들지만, 서버는 이 우선순위로 하나만 쓴다.
- 클라이언트가 고른 Google 장소가 이미 이 여행의 장소면(`PlaceOption.googlePlaceId` 로 앎) Google 필드 대신 그 `placeId` 를 보낸다. 서버도 같은 경우를 처리한다(§5.3).

### 5.3 저장 (Server Action + 쿼리)

`createScheduleItemAction` · `updateScheduleItemAction` 에 Google 장소 경로를 더한다. 순서(`CLAUDE.md` Server Action 순서를 지킴):

1. `getCurrentUser()`.
2. 필드별 입력 검증(§5.2). 여행(·고치기면 일정) 접근 확인 — 남의 것이면 Google 을 부르기 전에 `notFound()`.
3. Google 장소면: 이 여행에 같은 `google_place_id` 장소가 이미 있는지 확인(`userId`·여행 범위). **있으면** 그 장소 id 로 지금의 `placeId` 경로를 탄다(Google 호출·상한 검사 없음).
4. **없으면**: 장소 수 상한 확인(`countPlaces`) → `fetchPlaceCoords`(서버 키) → 실패면 지금 장소 넣기와 같은 문구(`PLACE_NOT_FOUND`·`SAVE_FAILED`·`PLACE_LIMIT`)를 장소 칸 오류로.
5. 한 SQL 문으로 쓴다(새 쿼리 함수, `src/db/queries/schedule-items.ts` 또는 `places.ts`, `import "server-only"`, 첫 인자 `userId`):
   - `new_place`: 접근 가능한 여행일 때만 `places` 에 넣는다(`insert … select from trips where id = tripId and accessibleTrips`), `on conflict (trip_id, google_place_id) do nothing returning id, label`.
   - `chosen`: `new_place` 와, 같은 여행·같은 `google_place_id` 의 기존 장소(접근 조건 포함)를 합쳐 하나.
   - 추가: `insert into schedule_items … select … from chosen` (`place` = `chosen.label`, `place_id` = `chosen.id`). 고치기: `update schedule_items … from chosen where` 일정 조건(`itemCondition`).
   - 0행이면(여행이 그 사이 지워짐, 동시에 같은 장소가 들어와 이 문의 스냅숏에서 안 보임 등) 지금의 "장소를 다시 골라 주세요" / `notFound()` 처리와 같은 규칙을 따른다. 고치기에서 일정이 없으면 장소도 들어가지 않는다(한 문).
6. `revalidatePath`.

- 종류는 클라이언트가 `guessCategory` 로 짐작해 보낸 값을 서버가 종류 목록으로 검증한다. 메모는 비운다.
- 좌표는 클라이언트에게서 받지 않는다(지금과 같음).

### 5.4 화면

장소 칸(`schedule-item-form.tsx`):

```
장소 (선택)
[ 🔍 장소 검색 (Google)                 ]
[ 직접 적기 ▾ ]                         ← 이 여행 장소가 있을 때만
[ 장소 이름            ]                ← 직접 적기일 때만
```

Google 후보를 고른 뒤:

```
장소 (선택)
📍 시부야 스카이 · 가 볼 곳에 새로 넣어요     [✕]
```

- 고르면 고르기 목록·직접 적기 칸을 숨기고 위 표시를 보인다. 이미 '가 볼 곳'에 있는 장소면 "가 볼 곳에 있는 장소". [✕] 를 누르면 검색 전 상태로.
- 장소가 하나도 없는 여행에서도 검색칸을 보인다(지금은 글자 칸만).
- 제목 칸 이름은 "제목 (장소가 있으면 선택)". 초점은 지금처럼 제목 칸에 먼저 간다.
- 검증 오류로 돌아오면 고른 Google 장소가 유지된다(`state.values` 에 Google 필드 포함, 이 양식의 `resultKey` 다시 만들기 방식과 맞춘다).
- 브라우저 키(`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`)가 없으면 검색칸만 숨긴다. 자동완성에는 지도 ID 가 필요 없다.
- Google 스크립트: 지금은 지도 칸(`trip-map-panel.tsx`)의 `APIProvider` 안에서만 불러온다. 일정 칸에서도 쓸 수 있게 한다. 스크립트는 한 번만 불러오고 같은 설정(`language="ko"`)이어야 한다. 페이지 수준 공통 Provider 로 올릴지, 일정 칸에 따로 둘지는 구현자 판단(`@vis.gl/react-google-maps` 의 여러 Provider 동작 확인).
- 자동완성 요소는 `place-add-form.tsx` 의 `PlaceAutocompleteElement` 사용법(선택 → `fetchFields(["displayName","primaryType","types"])`, 실패 시 `PLACE_NOT_FOUND`)을 함께 쓰도록 뽑아낸다(구현자 판단).

일정 줄(`schedule-editor.tsx`):

- 제목이 있으면 지금 그대로(제목 + 그 아래 `📍 장소`).
- 제목이 없으면 제목 자리(누르면 고치기 여는 버튼)에 장소 이름을 보이고, 그 아래 `📍` 링크 줄은 `📍 지도에서 보기` 로 보인다. 완료 체크 `aria-label` 은 보이는 이름으로.

### 5.5 비용

- 자동완성 세션은 양식에 입력할 때만 생긴다. 고른 뒤 `fetchFields` 한 번(지금 '가 볼 곳'과 같음).
- 서버 Place Details(좌표)는 새 장소일 때만 한 번. 이미 있는 장소는 부르지 않는다.
- 지도를 만들지 않으므로 지도 로드는 늘지 않는다.
- **할당량 (사용자 결정: 지금 부품 그대로)**: `PlaceAutocompleteElement` 는 입력하는 동안 요청을 여러 번 보낸다(검색 한 번에 5–10번쯤). 하루 Places 300 이 자동완성 요청까지 세는지는 모른다(사용자도 모름). 센다면 하루 30–40번 검색쯤이고, 넘으면 그날은 검색·새 장소 좌표·30일 좌표 갱신이 멈춘다. 혼자 쓰는 앱이라 받아들이고, 모자라면 사용자가 콘솔에서 올린다. 직접 만든 검색칸(입력을 멈췄을 때만 묻기)은 구현량이 커서 하지 않는다.
  - 검색칸이 요청 오류를 알리면(요소의 오류 이벤트) 장소 칸에 "지금은 장소를 검색할 수 없어요. 직접 적거나 잠시 뒤 다시 해 주세요." 를 보인다. 서버 좌표 받기가 실패하면 지금처럼 `SAVE_FAILED`(일정 저장 안 됨, 장소 칸 오류). (Claude 판단)
  - 운영 배포 뒤 Google Cloud 콘솔에서 할당량 사용량을 한 번 본다(`docs/status.md` 남은 확인에 적는다).

## 6. 구현자에게 맡기는 것

- 쿼리 함수의 이름·위치, CTE 를 Drizzle 로 쓸지 `sql` 로 쓸지.
- 자동완성 공통 컴포넌트 뽑기, Provider 위치.
- 고치기에서 이어진 장소를 Google 검색으로 바꿀 때의 세부 상태 처리.

## 7. 확인

- 단위 시험: `schedule-input` 의 새 규칙(제목 선택, 모두 없을 때 오류, Google 필드 검증·우선순위).
- 브라우저(테스트 계정, `docs/status.md`): 장소 없는 여행·있는 여행에서 Google 으로 추가 → '가 볼 곳'에 생김·일정 이어짐 / 이미 있는 장소 다시 고름 → 장소 하나 / 고르고 닫기 → 장소 안 생김 / 제목 없이 저장한 일정 줄 표시 / 고치기에서 Google 장소로 바꾸기 / 휴대폰 너비에서 자동완성 목록.
- 소유권: Server Action 본문의 tripId·itemId 를 남의 것으로 바꿔 보내면 장소도 일정도 생기지 않는다(#12 방식). `/security-review`.
- 마이그레이션 PR: SQL 전문, 파괴적 아님, 되돌리기.
