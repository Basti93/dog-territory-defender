CREATE TABLE "corners" (
	"household_id" uuid NOT NULL,
	"corner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "corners_household_id_corner_id_pk" PRIMARY KEY("household_id","corner_id")
);
--> statement-breakpoint
ALTER TABLE "corners" ADD CONSTRAINT "corners_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;