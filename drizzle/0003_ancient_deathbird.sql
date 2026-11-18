CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"google_place_id" text NOT NULL,
	"label" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"coords_fetched_at" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_category_check" CHECK ("places"."category" in ('lodging', 'sight', 'food', 'cafe', 'etc'))
);
--> statement-breakpoint
CREATE TABLE "trip_bases" (
	"trip_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"place_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_bases_trip_id_start_date_pk" PRIMARY KEY("trip_id","start_date")
);
--> statement-breakpoint
ALTER TABLE "schedule_items" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_bases" ADD CONSTRAINT "trip_bases_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_bases" ADD CONSTRAINT "trip_bases_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "places_trip_google_place_idx" ON "places" USING btree ("trip_id","google_place_id");--> statement-breakpoint
CREATE INDEX "places_trip_id_idx" ON "places" USING btree ("trip_id");--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;