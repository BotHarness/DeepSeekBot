# Anonymous Bot token telemetry

## Sub-features

- `projection`: deterministic owned, child and Assignment SessionEvents match the token snapshot wire; unowned native Sessions and replay do not increase totals.
- `unknown`: omitted provider buckets remain absent, reported lower bounds match Overview, and unavailable histories set reconciliation coverage.
- `lifecycle`: opt-out prevents reads and sends; disposal stops checks; restart may repeat a snapshot without changing the latest-snapshot calculation.
- `live`: a real isolated Bot reply produces local token usage matching the production snapshot wire and, when authorized, PostHog ingestion.

## How to get to it (user POV)

Enable anonymous Host statistics in Settings, send a Bot DM, and compare its local Usage view with token analytics after the next hourly check. The event reports anonymous installation/day snapshots, not individual remote Session records.

## Driving it with verify-app

1. Run `pnpm exec vitest run packages/core/test/token-telemetry.test.ts` for deterministic reporter/unknown/replay paths without a model.
2. Build and launch a named isolated Host. Run doctor, use `shot --bot-mode` to send one short DM and wait for its real reply, then read its saved ARIA snapshot and console.
3. Read that Host's `overview-usage --period week` and `telemetry-status` with the existing CLI. Run `node scripts/e2e-token-telemetry.mjs --name <name>` to compare the production reader/serializer with the live Host.
4. With explicit authorization for a wire check, add `--send`. Verify the `0.0.0-qa.4255` event's actual PostHog fields against `token-telemetry.json`; neither an HTTP 200 nor the saved screenshot alone proves ingestion.
5. Stop only this task's named instance. Keep redacted numeric evidence and clearly distinguish the immediate script invocation from normal hourly Host scheduling.

## Gotchas

- Wait for initial usage reconciliation; do not collect a rebuild in progress. Failed history reads retain the known projection with `is_reconciled=false`.
- The script sends through a separate QA Install ID; never join a website identity to the real Host installation.
- PostHog must take the entire latest snapshot per install/day before summing. Unknown properties in the latest event must not fall back to an older exact value.
- This does not add a visible screen or change model token accounting. See [the query contract](../../../../docs/token-telemetry.md) for coverage and late-correction limits.
