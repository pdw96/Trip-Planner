CREATE TABLE "trip_record_companions" (
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"was_owner" boolean DEFAULT false NOT NULL,
	CONSTRAINT "trip_record_companions_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "schedule_items" ADD COLUMN "copied_from_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "detached_from_trip_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "detached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_record_companions" ADD CONSTRAINT "trip_record_companions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_record_companions" ADD CONSTRAINT "trip_record_companions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_detached_from_trip_id_trips_id_fk" FOREIGN KEY ("detached_from_trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trips_detached_from_idx" ON "trips" USING btree ("user_id","detached_from_trip_id") WHERE "trips"."detached_from_trip_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_detached_check" CHECK ("trips"."detached_from_trip_id" IS NULL OR "trips"."detached_at" IS NOT NULL);