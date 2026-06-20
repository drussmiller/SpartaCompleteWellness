---
name: dev workflow has no file watch
description: Edits to server code require a manual workflow restart to take effect
---

The "Start application" workflow runs `tsx server/index.ts` with NO watch mode. Server-side edits do NOT hot-reload — you must `restart_workflow("Start application")` for changes to take effect. A "fix that didn't work" is often just the old process still running.

Also: `logger.info` writes to `logs/access.log` (not stdout) unless `ENABLE_CONSOLE_LOGGING=true`. Check that file to confirm which code path ran.
