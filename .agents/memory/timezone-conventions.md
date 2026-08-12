---
name: Timezone offset conventions
description: Two opposite tzOffset conventions coexist in server/routes.ts; week-boundary math must match the endpoint's convention.
---
Rule: `/api/user/stats`, `/api/activities/current`, `/api/skipped-weeks` use the client's `getTimezoneOffset()` query param (positive west of UTC): UTC = local + tz*60000. `/api/leaderboard` uses stored `users.timezone_offset` (negative west of UTC, e.g. -300 Central): UTC = local - tz*60000.

**Why:** Mixing them silently shifts week boundaries by hours and mis-buckets posts near Monday midnight.

**How to apply:** Any new date-window logic (e.g. skipped_weeks `week_start_date`, stored as `programStartDate + k*7days` local-midnight convention) must convert with the convention of the endpoint it runs in; in leaderboard SQL that's `week_start_date - (tz * interval '1 minute')`.
