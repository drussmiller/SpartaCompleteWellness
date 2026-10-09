-- Add a per-user reading preference without changing existing activity content.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "bible_version" text NOT NULL DEFAULT 'NIV';
