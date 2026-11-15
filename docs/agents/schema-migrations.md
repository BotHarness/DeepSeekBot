# Operational database migrations

Append a `SchemaMigration` constant with a unique, stable kebab-case `id` to the end of
`BOT_HARNESS_SCHEMA_PLAN` in `packages/core/src/database/schema-plan.ts`. Define its owning module,
description and synchronous `migrate` body. Set `rebuildsReferencedTables` when rebuilding referenced
tables. Do not specify a generation: `defineSchemaPlan` computes it from the list position, freezes
each planned object and retains `generation` for callers. Tests use `plan.targetGeneration` or
`plan.generationOf('your-id')`; historical fixtures may select a prefix by index/generation.

When two branches append migrations, keep both. The migration merged first stays first; append the
other after it. Resolve the snapshot conflict in the same order, then run
`node scripts/check-schema-migrations.mjs --write-snapshot`. There is no generation allocation or
"sync main and re-check the generation number before a migration PR" step. A development Profile
that already applied the other order requires a compatible Host or a disposable fresh Profile;
never edit its ledger to make it open.

## Append-only protection

`pnpm lint` runs `scripts/check-schema-migrations.mjs`. The committed
`scripts/schema-migrations.json` records ordered ids and SHA-256 hashes of normalized migration
syntax and referenced local helpers. New entries must be appended with `--write-snapshot`, which
refuses to rewrite old entries. The check rejects removal, rename, reorder, handwritten generations,
hidden spreads and changed bodies. Formatting, TypeScript annotations and JavaScript comments do
not affect hashes; SQL string changes do. A behavior change or a refactor that changes executable
syntax needs a new corrective migration. There is no general hash-reset escape hatch.

The snapshot makes offline checks and shallow checkouts deterministic without parsing old branches
that predate named migrations. When `origin/main` contains a snapshot, lint additionally verifies
its immutable prefix against the local snapshot, so editing both source and snapshot cannot hide a
merged-body change. Fetch main before final integration to refresh that extra protection. The
initial snapshot preserves the historical executed order, including M13. The foundation has the
fixed id `foundation` and is created by the owner, outside the module migration list.

## Ledger and recovery

The owner maintains this table in the same staged transaction as migration bodies and the existing
`_botharness_schema` generation:

```sql
CREATE TABLE schema_migrations (
  generation INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE
) STRICT;
```

On the first upgrade of a legacy database without this table, the owner backfills foundation and
every applied migration using the frozen historical order, then records each pending step as it
runs. Generation 153 is the permanent last pre-ledger boundary; never raise it. A fresh database
records foundation and all steps as they execute. Even a legacy database already at a prefix
plan's target is upgraded through staging to install its ledger.

Every open checks the full applied prefix, including foundation. A renamed, reordered, missing,
unknown or extra row, newer generation, or absent post-legacy ledger enters recovery with
`upgrade-required`. The message names the first differing generation and database/plan ids. The
owner never repairs existing history. A pre-ledger database cannot reveal which branch produced
it; its generation is accepted according to the historical release order exactly once. All
validation and migration failures preserve the active database. See [ADR-0341](../adr/0341-named-schema-migrations-have-an-append-only-ledger.md).

## Performance

This adds one ordered query bounded by the migration count on open and one row per migration;
normal module reads/writes have no added work. Reopen regression coverage checks unchanged database
bytes and guards against replay. Upgrade tests cover multiple old prefixes and transactional
failure. Measure mount latency on the same copied Profile before/after; opening includes existing
page and foreign-key checks, so report those timings as mount measurements, not query benchmarks.
