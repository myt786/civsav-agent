ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_report_cadence" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_report_tone" text DEFAULT 'positive' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_report_tone_note" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_report_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'in_review' NOT NULL,
	"tone" text NOT NULL,
	"report" jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_to" jsonb DEFAULT '[]'::jsonb NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_reports_client_generated_idx" ON "lead_reports" USING btree ("client_id","generated_at");
