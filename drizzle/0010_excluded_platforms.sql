ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "excluded_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;
