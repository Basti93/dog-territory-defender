ALTER TABLE "den_state" ADD COLUMN "pile" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "den_state" ADD COLUMN "tap_day_key" text;--> statement-breakpoint
ALTER TABLE "den_state" ADD COLUMN "tap_count" integer DEFAULT 0 NOT NULL;