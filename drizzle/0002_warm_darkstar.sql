CREATE TYPE "public"."verification_status" AS ENUM('ok', 'no_data', 'error');--> statement-breakpoint
CREATE TABLE "config_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" "platform",
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_platform_accounts" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_platform_accounts" ADD COLUMN "verified_status" "verification_status";--> statement-breakpoint
ALTER TABLE "client_platform_accounts" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "config_changes" ADD CONSTRAINT "config_changes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_platform_accounts_client_platform_idx" ON "client_platform_accounts" USING btree ("client_id","platform");