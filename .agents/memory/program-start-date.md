---
name: programStartDate on team change & admin reset deletion
description: How PATCH /api/users/:userId computes start dates and the destructive post-deletion interaction
---

# programStartDate on team assignment

In `PATCH /api/users/:userId` (server/routes.ts), when an admin assigns/changes a user's team the start date is auto-computed:
- intro-video-only user (no real non-intro, non-comment posts) → next Monday (today if Monday)
- user with ANY real post → previous Monday (start of current week) so this week = week 1, UNLESS already-started + has posts → existing date is preserved
- "real post" count excludes `type='introductory_video'` AND `parentId IS NOT NULL` (comments live in `posts` with a parentId)

**Rule (from user):** any real non-intro post means "started" → previous Monday. Only intro-only = brand new → next Monday.

# [ADMIN RESET] deletion gotcha — important
There is an `[ADMIN RESET]` block that DELETES a user's posts (from new start date onward, excluding intro) when the start date moves later.
**Why it bit us:** auto-computed team-change dates (later than a user's stale old date) were tripping this and silently deleting posts, corrupting test data and making users look "post-less".
**Fix / constraint:** the deletion is now gated on `programStartDateExplicitlyProvided` (req.body.programStartDate present). It must ONLY run on an explicit admin start-date edit, NEVER on an auto-computed team-change date.
