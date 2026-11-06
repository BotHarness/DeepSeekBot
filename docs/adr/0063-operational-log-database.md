---
Status: Accepted
Date: 2026-09-24
---

# Operational logs live in a separate database file

BotHarness needs a durable home for operational logs (plugin lifecycle transitions, viewer stream health, transfer history) backing the BotHarness Log timeline (#160 program): queryable by agents so a bot can debug itself, readable by Humans, and emailable for support without leaking the main database.

## Decision

1. **Separate SQLite file** at `$DSH_HOME/botharness/logs.db`, owned by a logging module that owns its tables. Shape: `(ts, plugin, owner, kind, detail)` plus nullable causation links (`principal`, `bot`, `orchestrator_session`, `assignment_session`, `trace_id`); owner is the read boundary, links state causation. Indexed `(ts)`, `(plugin, owner)`, `(trace_id)`; details stay short structured text under the existing no-secrets rule.
2. **Excluded from backup and restore.** The backup manifest never includes it; Managed Restore never reads it. A Human debugging session is: stop worrying, copy the file, send it. This is the point: sharing `logs.db` never exposes roster, bindings, policies, or inbox content.
3. **This scopes ADR-0041, not overturns it.** ADR-0041 weighed operational _state_ (registry, roster, policies: low-volume, must-back-up, must-migrate-atomically) and rejected multiple files for it. Logs are a materially different workload — high-volume append-only, explicitly non-backed-up, shareable for debugging. Same reasoning, different facts.
4. **Lightweight migration, not the owner machinery.** A version table plus best-effort forward migration; no Profile Writer Lease, no staged-copy activation, no fail-closed recovery. Rationale: a disposable debug store must never block Host boot. Worst case rebuilds empty.
5. **Retention: 50,000 rows and 30 days, whichever hits first**, pruned lazily on the write path. No scheduler. Single rows stay under ~1KB, so the file stays well under 100MB.
6. **Write path: ring first, persist second.** The in-memory bounded ring stays the queryable-now authority (existing diagnostics endpoints keep working unchanged); persistence drains behind it. Cordis Events fire on record (fire-and-forget, per the decision tree's "this happened" seam) for live subscribers; the event is never the authority.
7. **Read scoping is a security boundary.** Every entry carries an owner scope (`profile-shared` vs `bot-slug`). Readers see their own slug plus profile-shared entries — the Computer is profile-shared by product definition, per-Bot orchestration logs never cross slugs. The future model-visible read tool enforces the same rule.

## Considered Options

- **Same-DB tables under ADR-0041** — rejected: backup scope contamination (every main-DB backup would carry disposable log volume), privacy-on-share impossible without surgery (main DB holds roster, bindings, policies, inbox), and log write pressure on the profile-writer serialization.
- **No durability (rings only)** — rejected: self-debug across restarts and last-Wednesday answers need a durable tail; the ring stays as the hot path regardless.
- **Full owner machinery (lease, staged copy, generations)** — rejected: disproportionate for disposable data; a migration failure must degrade to an empty log, never to recovery mode.
- **SessionEvent emission into Session logs** — rejected with primary-source evidence (see #238): Session is per-interaction reconstructible history with token/KV consequences, no home session exists for cross-bot events, and query is per-handle seq scans.
- **Unbounded retention** — rejected: debugging value decays with age while the file only grows; the cap keeps the "send me the file" story plausible.

## Consequences

- Implementation follows as tracer slices (tables + writer + lazy retention + read API + Cordis emit); this ADR decides topology only.
- Viewer placement for the unified timeline (settings page section) is recorded in #238, not here: UI placement is easily reversible and not ADR-worthy.
- Operational-log vocabulary (`operational timeline`, `log database`, `owner scope`) lives here and in #238, not in `GLOSSARY.md`, which stays product-terms only.
