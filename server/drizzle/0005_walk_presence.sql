CREATE TABLE "walk_presence" (
	"household_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"walk_id" text NOT NULL,
	"started_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ended_at" bigint,
	CONSTRAINT "walk_presence_player_id_walk_id_pk" PRIMARY KEY("player_id","walk_id")
);
--> statement-breakpoint
ALTER TABLE "walk_presence" ADD CONSTRAINT "walk_presence_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_presence" ADD CONSTRAINT "walk_presence_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "walk_presence_household_idx" ON "walk_presence" USING btree ("household_id","ended_at");--> statement-breakpoint
CREATE INDEX "walk_presence_updated_idx" ON "walk_presence" USING btree ("updated_at");