---
name: Production transfer and data preservation
description: The user's separate production-branch workflow and requirement to preserve production data.
---

The user pushes changes to the production branch and pulls them into their production system. They can run SQL directly on the production database to add a column. Changes must not remove production data.

**Why:** The user explicitly requires that production changes preserve existing data.

**How to apply:** Provide narrowly scoped, additive schema changes alongside the application changes. Do not bundle unrelated drops, resets, or data replacement. Do not assume publishing this workspace updates their separate production system, or treat their ability to run SQL as permission to perform production writes.
