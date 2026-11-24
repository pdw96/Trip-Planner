import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Google 값은 place id 와 좌표(30일)만 저장(§3.2).
// Drizzle 스키마. 테이블 변경 후 `npm run db:generate` 로 마이그레이션을 만들고, CLAUDE.md '작업 흐름'의 마이그레이션 PR 순서를 따릅니다.

// --- 인증 (Better Auth) ---
// user · session · account · verification 은 Better Auth 가 요구하는 테이블입니다.
// 테이블·컬럼 이름과 타입은 Better Auth 의 Drizzle 스키마를 그대로 따르므로 임의로 바꾸지 않습니다.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// --- 여행 ---

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    destination: text("destination").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    notes: text("notes"),
    // 초대 링크(#15). 비밀값 원문은 저장하지 않고 SHA-256 hex 만 둔다. null 이면 링크가 꺼져 있다.
    inviteTokenHash: text("invite_token_hash").unique(),
    inviteTokenCreatedAt: timestamp("invite_token_created_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("trips_user_id_idx").on(t.userId),
    check("trips_dates_check", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

// --- 함께하는 사람 (#15) ---
// 주인은 trips.user_id 이고 여기에는 주인이 아닌 사람만 넣는다.

export const tripMembers = pgTable(
  "trip_members",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.userId] }),
    index("trip_members_user_id_idx").on(t.userId),
  ],
);

export type TripMember = typeof tripMembers.$inferSelect;

// --- 장소 ---
// Google 값은 google_place_id(무기한)와 lat·lng(30일, coords_fetched_at 기준)만 저장한다. label 은 사용자가 확인한 이름표다.

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    googlePlaceId: text("google_place_id").notNull(),
    label: text("label").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    coordsFetchedAt: timestamp("coords_fetched_at", {
      withTimezone: true,
    }).notNull(),
    category: text("category").notNull(),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("places_trip_google_place_idx").on(t.tripId, t.googlePlaceId),
    index("places_trip_id_idx").on(t.tripId),
    check(
      "places_category_check",
      sql`${t.category} in ('lodging', 'sight', 'food', 'cafe', 'etc')`,
    ),
  ],
);

export type Place = typeof places.$inferSelect;

// --- 일정 ---
// 여행 기간 검사 제약은 걸지 않는다. 여행 날짜를 줄여도 일정을 남겨 "여행 기간 밖 일정"으로 보이기 위해서다.

export const scheduleItems = pgTable(
  "schedule_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // 분 단위만 쓴다("HH:MM"). 읽으면 "HH:MM:SS" 로 온다.
    time: time("time"),
    // 장소가 있으면 비울 수 있다(#35). 비면 화면에 place 글자를 제목 자리에 보인다.
    title: text("title"),
    place: text("place"),
    placeId: uuid("place_id").references(() => places.id, {
      onDelete: "set null",
    }),
    memo: text("memo"),
    done: boolean("done").notNull().default(false),
    // 그날 안의 순서(작을수록 위). 비어 있으면 그날은 아직 순서를 저장한 적이 없어 시각 순 정렬을 쓴다(#41).
    // 순서에 영향을 주는 쓰기는 그날 전체를 0, 1, 2, … 로 다시 쓴다.
    position: integer("position"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("schedule_items_trip_id_date_idx").on(t.tripId, t.date)],
);

export type ScheduleItem = typeof scheduleItems.$inferSelect;

// --- 기준 숙소 ---
// 여행의 날짜별 기준점(숙소 장소). 장소가 지워지면 행도 함께 지운다.

export const tripBases = pgTable(
  "trip_bases",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    placeId: uuid("place_id").references(() => places.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.startDate] })],
);

export type TripBase = typeof tripBases.$inferSelect;

// --- 예산 (#14) ---
// 금액은 통화 최소 단위 정수(원·엔은 1, 달러는 센트), 10^12 미만. 환율은 "현지 통화 1 = 예산 통화 몇".
// 설정이 바뀌어도 금액의 통화가 사라지지 않도록, 통화 바꾸기 조건은 쓰기 쿼리가 확인한다(설계 §5.2).

export const tripBudgets = pgTable(
  "trip_budgets",
  {
    tripId: uuid("trip_id")
      .primaryKey()
      .references(() => trips.id, { onDelete: "cascade" }),
    currency: text("currency").notNull(),
    // #89: 모임 예산 총액. 각자(personal) 여행은 비어 있을 수 있다.
    totalAmount: bigint("total_amount", { mode: "number" }),
    // #89: 여행 방식(여행 주인만 고른다). 새로 적을 때의 "누구 돈"과 보이는 카드를 정한다.
    mode: text("mode").notNull().default("shared"),
    localCurrency: text("local_currency"),
    plannedRate: numeric("planned_rate", { precision: 20, scale: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("trip_budgets_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      "trip_budgets_local_currency_check",
      sql`${t.localCurrency} is null or (${t.localCurrency} ~ '^[A-Z]{3}$' and ${t.localCurrency} <> ${t.currency})`,
    ),
    check(
      "trip_budgets_total_check",
      sql`${t.totalAmount} is null or (${t.totalAmount} >= 0 and ${t.totalAmount} < 1000000000000)`,
    ),
    check(
      "trip_budgets_mode_check",
      sql`${t.mode} in ('shared', 'personal', 'both')`,
    ),
    check(
      "trip_budgets_rate_check",
      sql`(${t.localCurrency} is null and ${t.plannedRate} is null) or (${t.localCurrency} is not null and ${t.plannedRate} > 0)`,
    ),
  ],
);

export type TripBudget = typeof tripBudgets.$inferSelect;

// #89: 사람마다 본인만 보는 내 예산. currency 는 정할 때의 예산 통화(통화가 바뀌면 낡은 값을 알아보려고).
export const tripPersonalBudgets = pgTable(
  "trip_personal_budgets",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.userId] }),
    check(
      "trip_personal_budgets_total_check",
      sql`${t.totalAmount} >= 0 and ${t.totalAmount} < 1000000000000`,
    ),
    check(
      "trip_personal_budgets_currency_check",
      sql`${t.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export type TripPersonalBudget = typeof tripPersonalBudgets.$inferSelect;

// 일정에 붙은 금액(일정 하나에 한 행, 일정을 지우면 함께 지움) 또는 일정 밖 항목(이름, 날짜 없으면 여행 전체).
// 실제 지출이 현지 통화면 결제일·환율·출처를 함께 저장한다. 저장한 환율은 나중에 저절로 바뀌지 않는다.
export const budgetItems = pgTable(
  "budget_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    scheduleItemId: uuid("schedule_item_id").references(
      () => scheduleItems.id,
      { onDelete: "cascade" },
    ),
    // #89: owner_user_id null = 모임 돈, 값이 있으면 그 사람만 보는 내 돈.
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    title: text("title"),
    date: date("date"),
    estimateAmount: bigint("estimate_amount", { mode: "number" }),
    estimateCurrency: text("estimate_currency"),
    actualAmount: bigint("actual_amount", { mode: "number" }),
    actualCurrency: text("actual_currency"),
    actualPaidOn: date("actual_paid_on"),
    actualRate: numeric("actual_rate", { precision: 20, scale: 10 }),
    actualRateSource: text("actual_rate_source"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("budget_items_trip_id_idx").on(t.tripId),
    // #89: 일정마다 모임 행 하나, 사람마다 내 돈 행 하나.
    uniqueIndex("budget_items_schedule_shared_idx")
      .on(t.scheduleItemId)
      .where(sql`${t.ownerUserId} is null`),
    uniqueIndex("budget_items_schedule_owner_idx")
      .on(t.scheduleItemId, t.ownerUserId)
      .where(sql`${t.ownerUserId} is not null`),
    check(
      "budget_items_link_check",
      sql`(${t.scheduleItemId} is not null and ${t.title} is null and ${t.date} is null) or (${t.scheduleItemId} is null and ${t.title} is not null)`,
    ),
    check(
      "budget_items_estimate_check",
      sql`(${t.estimateAmount} is null and ${t.estimateCurrency} is null) or (${t.estimateAmount} >= 0 and ${t.estimateAmount} < 1000000000000 and ${t.estimateCurrency} ~ '^[A-Z]{3}$')`,
    ),
    check(
      "budget_items_actual_check",
      sql`(${t.actualAmount} is null and ${t.actualCurrency} is null) or (${t.actualAmount} >= 0 and ${t.actualAmount} < 1000000000000 and ${t.actualCurrency} ~ '^[A-Z]{3}$')`,
    ),
    check(
      "budget_items_rate_check",
      sql`(${t.actualRate} is null and ${t.actualRateSource} is null and ${t.actualPaidOn} is null) or (${t.actualAmount} is not null and ${t.actualRate} > 0 and ${t.actualRateSource} in ('ecb', 'manual', 'planned') and ${t.actualPaidOn} is not null)`,
    ),
    check(
      "budget_items_some_amount_check",
      sql`${t.estimateAmount} is not null or ${t.actualAmount} is not null`,
    ),
  ],
);

export type BudgetItem = typeof budgetItems.$inferSelect;
