# ADR-0341: Named schema migrations have an append-only ledger

- Status: Accepted
- Date: 2026-11-15
- Issue: [#4225](https://github.com/BotHarness/BotHarness/issues/4225)

## Context

A single operational database generation protects staged upgrades, but allocating its number in
parallel branches causes collisions and repeated fixture edits. An integer alone also cannot
identify a development Profile migrated on a divergent branch.

## Decision

Keep the database owner and staged atomic activation from ADR-0041. Module migrations have stable
kebab-case ids in an append-only ordered list. Generation is computed from list position after
foundation; frozen planned entries expose it for existing callers. The owner records foundation
and each applied id in `schema_migrations`, in the same transaction as bodies and generation.

Legacy Profiles through generation 153 acquire a complete ledger from the historical executed
order in staging. New Profiles record steps while migrating. Every open validates the entire
applied prefix. Divergent, missing or unsupported history fails with `upgrade-required`, naming the
first differing generation and ids; existing ledger rows are never repaired.

Use a committed id/body-hash snapshot for deterministic offline and shallow-clone lint. Protect
its merged prefix against `origin/main` when available. Normalize comments and formatting and hash
referenced local helpers too. Executable changes to existing migrations require a corrective
append; no general hash-reset escape hatch is provided. Append conflicts retain both entries in
merge order. See the [migration workflow](../agents/schema-migrations.md).

## Consequences

Parallel branches allocate names rather than numbers. Historical migrations retain their executed
order, including M13, and tests can refer to names. Open adds a bounded ledger read; ordinary
transactions add no work. The ledger cannot identify a pre-ledger branch fork retroactively, and
development Profiles with divergent applied named history intentionally refuse to open. This is
application-defined persistence, with no change to DSH contracts, tools, routes or CLI commands.
