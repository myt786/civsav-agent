CREATE TABLE IF NOT EXISTS "report_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"daily_summary" boolean DEFAULT true NOT NULL,
	"monthly_seo" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_recipients_email_idx" ON "report_recipients" USING btree ("email");
