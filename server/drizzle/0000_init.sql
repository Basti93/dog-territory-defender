CREATE TABLE "banned_ips" (
	"ip" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"strikes" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cell_days" (
	"household_id" uuid NOT NULL,
	"ix" integer NOT NULL,
	"iy" integer NOT NULL,
	"day" text NOT NULL,
	CONSTRAINT "cell_days_household_id_ix_iy_day_pk" PRIMARY KEY("household_id","ix","iy","day")
);
--> statement-breakpoint
CREATE TABLE "cells" (
	"household_id" uuid NOT NULL,
	"ix" integer NOT NULL,
	"iy" integer NOT NULL,
	"last_refreshed" bigint NOT NULL,
	"last_tracked" bigint NOT NULL,
	"baseline_visits" integer DEFAULT 0 NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"territory_id" text,
	CONSTRAINT "cells_household_id_ix_iy_pk" PRIMARY KEY("household_id","ix","iy")
);
--> statement-breakpoint
CREATE TABLE "den_state" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"treats" double precision NOT NULL,
	"doghouse_level" integer DEFAULT 1 NOT NULL,
	"bakery_level" integer DEFAULT 1 NOT NULL,
	"sniff_garden_level" integer DEFAULT 1 NOT NULL,
	"last_tick_at" bigint NOT NULL,
	"xp" double precision DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"territory_income_revealed" boolean DEFAULT false NOT NULL,
	"rev" integer DEFAULT 0 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text,
	"appearance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_commands" (
	"household_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"kind" text NOT NULL,
	"player_id" uuid NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_commands_household_id_client_id_pk" PRIMARY KEY("household_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_player_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"discoverable" boolean DEFAULT false NOT NULL,
	"founded_import_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_by_player_id" uuid,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"consented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "territories" (
	"household_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"walks_here" integer DEFAULT 0 NOT NULL,
	"treats_earned_here" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "territories_household_id_id_pk" PRIMARY KEY("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "walks" (
	"household_id" uuid NOT NULL,
	"id" text NOT NULL,
	"player_id" uuid NOT NULL,
	"start_time" bigint NOT NULL,
	"start_source" text NOT NULL,
	"route" jsonb NOT NULL,
	"closed" boolean NOT NULL,
	"new_ground_cell_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"treats_earned" integer,
	"reward" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walks_household_id_id_pk" PRIMARY KEY("household_id","id")
);
--> statement-breakpoint
ALTER TABLE "cell_days" ADD CONSTRAINT "cell_days_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "den_state" ADD CONSTRAINT "den_state_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_commands" ADD CONSTRAINT "economy_commands_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walks" ADD CONSTRAINT "walks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walks" ADD CONSTRAINT "walks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cells_territory_idx" ON "cells" USING btree ("household_id","territory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash_uq" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "dogs_household_idx" ON "dogs" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "events_household_seq_idx" ON "events" USING btree ("household_id","seq");--> statement-breakpoint
CREATE INDEX "invite_codes_household_idx" ON "invite_codes" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "players_household_idx" ON "players" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "walks_household_start_idx" ON "walks" USING btree ("household_id","start_time");