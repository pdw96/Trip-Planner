CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"schedule_item_id" uuid,
	"title" text,
	"date" date,
	"estimate_amount" bigint,
	"estimate_currency" text,
	"actual_amount" bigint,
	"actual_currency" text,
	"actual_paid_on" date,
	"actual_rate" numeric(20, 10),
	"actual_rate_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_items_link_check" CHECK (("budget_items"."schedule_item_id" is not null and "budget_items"."title" is null and "budget_items"."date" is null) or ("budget_items"."schedule_item_id" is null and "budget_items"."title" is not null)),
	CONSTRAINT "budget_items_estimate_check" CHECK (("budget_items"."estimate_amount" is null and "budget_items"."estimate_currency" is null) or ("budget_items"."estimate_amount" >= 0 and "budget_items"."estimate_amount" < 1000000000000 and "budget_items"."estimate_currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "budget_items_actual_check" CHECK (("budget_items"."actual_amount" is null and "budget_items"."actual_currency" is null) or ("budget_items"."actual_amount" >= 0 and "budget_items"."actual_amount" < 1000000000000 and "budget_items"."actual_currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "budget_items_rate_check" CHECK (("budget_items"."actual_rate" is null and "budget_items"."actual_rate_source" is null and "budget_items"."actual_paid_on" is null) or ("budget_items"."actual_amount" is not null and "budget_items"."actual_rate" > 0 and "budget_items"."actual_rate_source" in ('ecb', 'manual', 'planned') and "budget_items"."actual_paid_on" is not null)),
	CONSTRAINT "budget_items_some_amount_check" CHECK ("budget_items"."estimate_amount" is not null or "budget_items"."actual_amount" is not null)
);
--> statement-breakpoint
CREATE TABLE "trip_budgets" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"total_amount" bigint NOT NULL,
	"local_currency" text,
	"planned_rate" numeric(20, 10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_budgets_currency_check" CHECK ("trip_budgets"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "trip_budgets_local_currency_check" CHECK ("trip_budgets"."local_currency" is null or ("trip_budgets"."local_currency" ~ '^[A-Z]{3}$' and "trip_budgets"."local_currency" <> "trip_budgets"."currency")),
	CONSTRAINT "trip_budgets_total_check" CHECK ("trip_budgets"."total_amount" >= 0 and "trip_budgets"."total_amount" < 1000000000000),
	CONSTRAINT "trip_budgets_rate_check" CHECK (("trip_budgets"."local_currency" is null and "trip_budgets"."planned_rate" is null) or ("trip_budgets"."local_currency" is not null and "trip_budgets"."planned_rate" > 0))
);
--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_schedule_item_id_schedule_items_id_fk" FOREIGN KEY ("schedule_item_id") REFERENCES "public"."schedule_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_budgets" ADD CONSTRAINT "trip_budgets_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_items_trip_id_idx" ON "budget_items" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_items_schedule_item_idx" ON "budget_items" USING btree ("schedule_item_id");