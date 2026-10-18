CREATE TABLE "bot_profiles" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"host_household_id" uuid NOT NULL,
	"archetype" text NOT NULL,
	"name" text NOT NULL,
	"appearance" jsonb NOT NULL,
	"personality" text NOT NULL,
	"rhythm" jsonb NOT NULL,
	"quirk" text NOT NULL,
	"seed" bigint NOT NULL,
	"home_lat" double precision NOT NULL,
	"home_lng" double precision NOT NULL,
	"introduced_at" bigint NOT NULL,
	"met_count" integer DEFAULT 0 NOT NULL,
	"exclusive_gift_sent_at" bigint
);
--> statement-breakpoint
CREATE TABLE "bot_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"host_household_id" uuid NOT NULL,
	"day" text NOT NULL,
	"slot" text NOT NULL,
	"planned_start" bigint NOT NULL,
	"target_m" integer NOT NULL,
	"via" jsonb,
	"walk_id" text,
	"generator" text,
	"distance_m" integer,
	"status" text DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coop_weeks" (
	"host_household_id" uuid NOT NULL,
	"week_start" text NOT NULL,
	"goal_km" double precision NOT NULL,
	"planned_bot_km" double precision NOT NULL,
	"bot_km" double precision DEFAULT 0 NOT NULL,
	"human_km" double precision DEFAULT 0 NOT NULL,
	"carried_km" double precision DEFAULT 0 NOT NULL,
	"completed_at" bigint,
	"reward_id" text,
	"announced_at" bigint,
	CONSTRAINT "coop_weeks_host_household_id_week_start_pk" PRIMARY KEY("host_household_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_household_id" uuid NOT NULL,
	"bot_household_id" uuid NOT NULL,
	"cosmetic_id" text,
	"sprinkle_treats" integer,
	"day" text NOT NULL,
	"created_at" bigint NOT NULL,
	"opened_at" bigint,
	"opened_by_player_id" uuid
);
--> statement-breakpoint
CREATE TABLE "neighbour_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_household_id" uuid NOT NULL,
	"bot_household_id" uuid,
	"kind" text NOT NULL,
	"line_key" text NOT NULL,
	"params" jsonb NOT NULL,
	"day" text NOT NULL,
	"slot_key" text NOT NULL,
	"due_at" bigint NOT NULL,
	"emitted_seq" bigint
);
--> statement-breakpoint
CREATE TABLE "street_tiles" (
	"tile_id" text PRIMARY KEY NOT NULL,
	"fetched_at" bigint NOT NULL,
	"graph" "bytea",
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "walks" ALTER COLUMN "player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cells" ADD COLUMN "generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_profiles" ADD CONSTRAINT "bot_profiles_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_profiles" ADD CONSTRAINT "bot_profiles_host_household_id_households_id_fk" FOREIGN KEY ("host_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_schedules" ADD CONSTRAINT "bot_schedules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_schedules" ADD CONSTRAINT "bot_schedules_host_household_id_households_id_fk" FOREIGN KEY ("host_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coop_weeks" ADD CONSTRAINT "coop_weeks_host_household_id_households_id_fk" FOREIGN KEY ("host_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_host_household_id_households_id_fk" FOREIGN KEY ("host_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_bot_household_id_households_id_fk" FOREIGN KEY ("bot_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbour_events" ADD CONSTRAINT "neighbour_events_host_household_id_households_id_fk" FOREIGN KEY ("host_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbour_events" ADD CONSTRAINT "neighbour_events_bot_household_id_households_id_fk" FOREIGN KEY ("bot_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_profiles_host_archetype_uq" ON "bot_profiles" USING btree ("host_household_id","archetype");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_schedules_bot_day_slot_uq" ON "bot_schedules" USING btree ("household_id","day","slot");--> statement-breakpoint
CREATE INDEX "bot_schedules_host_day_idx" ON "bot_schedules" USING btree ("host_household_id","day");--> statement-breakpoint
CREATE INDEX "gifts_host_idx" ON "gifts" USING btree ("host_household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "neighbour_events_host_day_slot_uq" ON "neighbour_events" USING btree ("host_household_id","day","slot_key");--> statement-breakpoint
CREATE INDEX "neighbour_events_host_due_idx" ON "neighbour_events" USING btree ("host_household_id","due_at");