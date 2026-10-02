ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "show_on_dashboard" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "show_on_seo" boolean DEFAULT true NOT NULL;
