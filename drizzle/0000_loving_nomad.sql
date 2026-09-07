CREATE TYPE "public"."platform" AS ENUM('google_ads', 'meta', 'ga4', 'search_console', 'ghl', 'openphone', 'ahrefs', 'lead_dashboard');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'completed', 'completed_with_errors', 'failed');--> statement-breakpoint
CREATE TABLE "client_platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"date" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_status" DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_platform_accounts" ADD CONSTRAINT "client_platform_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_responses" ADD CONSTRAINT "raw_responses_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_responses" ADD CONSTRAINT "raw_responses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_snapshots_client_platform_date_idx" ON "metric_snapshots" USING btree ("client_id","platform","date");