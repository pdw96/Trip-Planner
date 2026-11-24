CREATE TABLE "trip_personal_budgets" (
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"total_amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_personal_budgets_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id"),
	CONSTRAINT "trip_personal_budgets_total_check" CHECK ("trip_personal_budgets"."total_amount" >= 0 and "trip_personal_budgets"."total_amount" < 1000000000000),
	CONSTRAINT "trip_personal_budgets_currency_check" CHECK ("trip_personal_budgets"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "trip_budgets" DROP CONSTRAINT "trip_budgets_total_check";--> statement-breakpoint
DROP INDEX "budget_items_schedule_item_idx";--> statement-breakpoint
ALTER TABLE "trip_budgets" ALTER COLUMN "total_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "trip_budgets" ADD COLUMN "mode" text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_personal_budgets" ADD CONSTRAINT "trip_personal_budgets_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_personal_budgets" ADD CONSTRAINT "trip_personal_budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_items_schedule_shared_idx" ON "budget_items" USING btree ("schedule_item_id") WHERE "budget_items"."owner_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_items_schedule_owner_idx" ON "budget_items" USING btree ("schedule_item_id","owner_user_id") WHERE "budget_items"."owner_user_id" is not null;--> statement-breakpoint
ALTER TABLE "trip_budgets" ADD CONSTRAINT "trip_budgets_mode_check" CHECK ("trip_budgets"."mode" in ('shared', 'personal', 'both'));--> statement-breakpoint
ALTER TABLE "trip_budgets" ADD CONSTRAINT "trip_budgets_total_check" CHECK ("trip_budgets"."total_amount" is null or ("trip_budgets"."total_amount" >= 0 and "trip_budgets"."total_amount" < 1000000000000));