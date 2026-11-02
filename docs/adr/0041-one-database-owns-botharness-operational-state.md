---
Status: Accepted
Date: 2026-09-20
---

# One database owns all BotHarness operational state

> Amended by [ADR-0258](0258-foreign-key-orphans-do-not-block-the-operational-database.md): foreign key orphans left by an outside writer no longer put the profile into recovery mode; page integrity failures still do.

Each DSH profile has one BotHarness-owned SQLite database at `$DSH_HOME/botharness/botharness.db`. It is the physical home for all BotHarness operational state: the local PersonaBot registry and archive state, bindings and access policy, roster arrangement, Channel and Membership facts, explicit Session ownership references, Source Events and revisions, Inbox Admissions and Attention Decisions, Messaging Policies, provider account references, Service Grants, Outbox and audit facts, and export/backup metadata.

One physical database does not mean one shallow module. PersonaBot Registry, Roster, Session Ownership, Messaging, Attention, Authorization, and Export remain deep modules with small command/query interfaces and explicit table ownership. Callers never receive a generic SQL/repository interface or compose transactions themselves. Before opening the database for operational use, a Host-lifetime database owner obtains one operating-system-backed **Profile Writer Lease**; a second Host using the same profile fails with `profile-in-use` and may expose read-only diagnostics, but cannot run PersonaBots or mutate operational state. SQLite lock errors are not the ownership protocol.

The database has one monotonic **Schema Generation**. Deep modules contribute internal migration steps, but the database owner assembles one ordered plan, verifies the complete source/target generations, migrates an isolated temporary database copy, validates it, and atomically replaces the active database only after success. The temporary copy is transaction staging, not a retained or user-visible backup, and is cleaned after the operation. Any failed or unsupported transition leaves the source database unchanged, prevents all operational modules from mounting, and enters recovery mode; there is no partially upgraded combination of modules. Managed Restore accepts the current generation or a supported older generation that can be forward-migrated inside staging before activation. A backup from an unknown newer generation fails with `upgrade-required`; BotHarness never down-migrates a restored database. The same owner serializes normal writes, supplies internal transaction scope to the owning modules, emits notifications only after commit, and creates consistent snapshots.

The database does not absorb every byte under BotHarness or DSH. Persona and Memory remain human-readable, Git-versionable Soul files; attachment content remains in the profile-scoped content-addressed store; DSH Session events remain behind DSH SessionPersistence; secrets remain behind DSH credentials; and preferences that must participate in DSH's native Settings surface remain in DSH settings. The database may hold stable references and snapshots of decisions involving those authorities, but never duplicates their content as a competing truth.

The terminal architecture does not create `botharness_roster` or `botharness_sessions` DSH storage domains. During rollout, #66's already-shipped `botharness_roster` remains the roster authority until #80 imports it once into an empty database target; #79 only establishes the database owner and does not dual-write or silently change authority. No separate `botharness_sessions` domain is introduced. DSH may continue using its own storage domains for DSH-owned state. Sharing the DSH storage-sqlite physical file with direct BotHarness tables is also forbidden: the storage backend owns its physical schema and version, exposes no cross-table transaction to consumers, and a second connection would complicate locking and migration ownership.

A live `botharness.db` file is not itself the portable backup interface. Managed profile backup obtains a consistent SQLite snapshot through the database owner, then writes a versioned `.botharness-backup` envelope with its manifest and required external files. Raw file copy while the Host is running is unsupported. PersonaBot Export remains the per-Bot clone/handoff format and always creates a new identity; identity-preserving recovery remains Managed Restore.

## Considered Options

- **Messaging SQLite plus separate DSH domains for roster and Session ownership** — rejected: it creates three BotHarness persistence paths, coordinated backup/import, and failure semantics without buying meaningful capacity or isolation for a single-user local product.
- **Put every BotHarness record through DSH storage domains** — rejected: the domain interface deliberately exposes atomic record operations, not the cross-table transactions required by Source Event admission, policy versioning, and Outbox work.
- **Share one physical file between DSH storage-sqlite and direct BotHarness SQL** — rejected: two owners would compete over schema versioning, connection policy, locking, and backup discipline.
- **Put Soul, attachment bytes, DSH Session logs, and credentials into the same database** — rejected: this would erase human-readable/Git Memory, duplicate DSH execution authority, inflate backups with binary content, and weaken credential isolation.
- **Use multiple databases to preserve module boundaries** — rejected: module depth comes from interfaces and table ownership, not from multiplying physical files.
- **Allow multiple Hosts and rely on SQLite busy errors** — rejected: database locking cannot protect the business interval around multi-step reads, decisions, and writes in separate processes.
- **Give each deep module an independent schema version and startup migration** — rejected: one physical database must never mount in a partially upgraded combination.
- **Down-migrate a newer backup to the installed Host** — rejected: unknown newer semantics cannot be safely discarded or reconstructed. The Host must be upgraded instead.

## Consequences

- ADR-0034's `botharness_roster` placement and ADR-0035's proposed `botharness_sessions` placement are superseded as terminal homes. #80 preserves their domain models and interfaces while moving the corresponding tables into `botharness.db`.
- After #80, BotHarness core no longer depends on `ctx.storageDomain` for its own state. Until then, #66 roster operations retain their explicit `storage-unavailable` behavior; missing or unhealthy `botharness.db` independently enters fail-closed recovery while leaving Soul files and diagnostics accessible.
- Session ownership remains a BotHarness relationship over DSH Session ids; DSH still owns Session event persistence and execution lifecycle.
- Sort preferences that are intentionally visible in DSH General Settings stay in `ui-bot-mode`; roster arrangement itself moves into the operational database.
- Legacy browser roster data or experimental DSH-domain records may be imported once into an empty database, but normal runtime never dual-writes or falls back.
- Database migrations and backup/restore are profile-level compatibility contracts. Internal modules may own tables, but there is one Schema Generation, ordered migration plan, staged-copy activation, and integrity check.
- Restore performs supported forward migrations only in staging. Unknown newer generations return `upgrade-required` without changing the active profile; no down migration exists.
- Only the Profile Writer Lease holder may run migrations, normal writes, backup barriers, or PersonaBot execution. Lease metadata is diagnostic; a timeout alone never steals a live lease.
- ADR-0042 defines explicit manual backup/export, the optional DSH Session facet, integrity boundary, and honest cross-device Purge Ledger guarantee. v1 creates no automatic or operation-coupled retained backup.
