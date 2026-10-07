CREATE TABLE IF NOT EXISTS "client_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"health_score" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_analyses_client_generated_idx" ON "client_analyses" USING btree ("client_id","generated_at");--> statement-breakpoint
ALTER TABLE "report_recipients" ADD COLUMN IF NOT EXISTS "monthly_analysis" boolean DEFAULT true NOT NULL;
