
UPDATE users
SET created_at = '2025-01-27 03:00:00Z',  -- 9:00 PM CST = 03:00 UTC next day
    team_joined_at = '2025-01-27 03:05:00Z'  -- 9:05 PM CST = 03:05 UTC next day
WHERE id = 3972;
