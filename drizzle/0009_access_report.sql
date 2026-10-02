ALTER TABLE "report_recipients" ADD COLUMN IF NOT EXISTS "access_report" boolean DEFAULT false NOT NULL;
