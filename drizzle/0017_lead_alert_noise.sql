ALTER TABLE "lead_alerts" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD COLUMN IF NOT EXISTS "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD COLUMN IF NOT EXISTS "pushed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_alert_pushes" jsonb DEFAULT '[]'::jsonb NOT NULL;
