-- Adds users.program_year if it doesn't exist (safe to run multiple times)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS program_year integer DEFAULT 1;

-- Backfill any NULLs just in case
UPDATE users SET program_year = 1 WHERE program_year IS NULL;
