-- Distinguish user-selected skips from automatic Re-engagement skips.
-- Existing rows are manual skips and retain the four-week manual allowance.
ALTER TABLE "skipped_weeks"
ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';