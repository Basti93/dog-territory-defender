ALTER TABLE "walks" ADD COLUMN "stats_version" integer;--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "stats_end_time" bigint;--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "stats_distance_m" double precision;--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "stats_excluded" text;