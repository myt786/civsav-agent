ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_alert_owner" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_alert_sensitivity" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_alerts_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_at" timestamp with time zone,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_alerts_client_status_idx" ON "lead_alerts" USING btree ("client_id","status");
