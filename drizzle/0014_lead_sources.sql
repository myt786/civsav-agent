ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "lead_sources_off" jsonb DEFAULT '[]'::jsonb NOT NULL;
