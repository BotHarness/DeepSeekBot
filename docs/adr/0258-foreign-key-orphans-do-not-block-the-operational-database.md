---
Status: Accepted
Date: 2026-10-26
---

# Foreign key orphans do not block the operational database

Amends the integrity check in [ADR-0041](0041-one-database-owns-botharness-operational-state.md). Issue [#2849](https://github.com/BotHarness/DeepSeekBot/issues/2849) reported profiles stuck in recovery mode with `integrity-failed`: no roster, no Bots and no new Sessions until someone repaired `botharness.db` outside the product.

## Context

Every mount ran `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, and any finding put the whole profile into recovery mode. Host writes always enforce foreign keys, and the schema plan leaves no orphans when it is migrated. A writer outside the Host can still leave them: the `sqlite3` CLI opens with `foreign_keys=OFF`, so deleting a parent row there keeps its children. Orphaned rows do not damage SQLite pages. Recovery mode also recorded only the error code, so nobody could tell orphans from real corruption.

## Decision

The database owner separates the two checks. A failed `integrity_check` (page, index, `NOT NULL` or `CHECK` damage) still enters recovery mode. Foreign key orphans that already exist in the active database no longer block the mount. The owner records them as a bounded `child -> parent xN` summary on the owner and in its diagnostics, and Host startup logs it. Staged migrations may carry existing orphans forward. A migration that adds orphans on any edge still fails validation and leaves the source unchanged. Snapshot validation checks page integrity only, so a profile that mounts can also be backed up and restored.

A recovery reason now carries the first SQLite findings, and recovery-mode errors include it, so the Client and logs show why the profile cannot open.

## Consequences

A profile that an outside tool edited keeps working, and its orphans stay visible in diagnostics instead of locking the Human out. The Host does not delete orphans automatically and creates no retained backup, which stays as ADR-0041 decided. Code that reads joined tables must tolerate a missing parent, as it already must for any row that an outside writer changes. Real page corruption still needs a manual repair from a copy of the profile (for example `sqlite3 .recover`). This change adds no in-product repair command.
