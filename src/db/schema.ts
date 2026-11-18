import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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
    title: text("title").notNull(),
    place: text("place"),
    memo: text("memo"),
    done: boolean("done").notNull().default(false),
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
