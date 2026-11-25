# Published release upgrade fixtures

Each gzip file contains a SQLite database initialized by the indicated published `deepseekbot` CLI. The seed adds synthetic PersonaBots, Channels, placed messages with attachment metadata, ownership and Memory snapshot records, a schedule, a preset, an approval rule, and usage data. All inputs are fixed strings or numbers. The fixtures contain no attachment files or user Profile exports.

After publishing, install the exact npm version into a scratch directory and run the generator with that package directory. The generator creates and deletes its own disposable `DSH_HOME`. Use the repository's pinned Node version.

```bash
version=1.7.0
release_dir=$(mktemp -d)
npm install --prefix "$release_dir" --ignore-scripts --no-audit --no-fund "deepseekbot@$version"
node scripts/refresh-release-upgrade-fixture.mjs "$release_dir/node_modules/deepseekbot"
```

Repeat for the older version when replacing that fixture. Keep at least two versions and review the seed if a released schema changes a required field. Run the fixture test before staging the archives.

```bash
~/bin/heavy pnpm exec vitest run --maxWorkers=2 packages/core/test/release-database-upgrade.test.ts
```

The test preserves the committed source records and compares the upgraded rows. When a migration intentionally changes an existing field or inserts into an existing table, identify the migration by ID and assert the exact expected change. Legacy releases have a schema generation but no ledger. The test checks that head backfills that prefix, executes only the remaining migration bodies, and restarts without running any body again.
