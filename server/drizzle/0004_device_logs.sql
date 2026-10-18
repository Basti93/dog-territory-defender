CREATE TABLE "device_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"device_seq" bigint NOT NULL,
	"t" bigint NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"app_state" text NOT NULL,
	"received_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_logs_device_seq_uq" ON "device_logs" USING btree ("device_id","device_seq");--> statement-breakpoint
CREATE INDEX "device_logs_household_t_idx" ON "device_logs" USING btree ("household_id","t");--> statement-breakpoint
CREATE INDEX "device_logs_received_idx" ON "device_logs" USING btree ("received_at");