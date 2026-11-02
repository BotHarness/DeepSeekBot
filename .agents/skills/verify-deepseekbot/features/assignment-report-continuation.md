# Assignment Report continuation

## Sub-features

- Initial read selects the latest accepted Report Source Event and returns its identity.
- Continuation reads that same report after a newer report arrives and after Host restart.
- Missing identity on nonzero offsets, foreign ownership, mismatched identities and purged content refuse.
- Historical reports without structured metadata remain readable through the legacy matcher.

## How to get to it (user POV)

Use the existing CLI `bot-tool <bot-id> inspect_assignment --args-stdin`. This is a model tool / CLI behavior, with no new rendered UI. See [CLI contract](../../../../docs/bot-cli.md#harness-bot-tools-without-the-model).

## Driving it with verify-app

Launch an isolated Host and run doctor. Use a task-owned Bot and an Assignment with a report longer than 2,000 Unicode code points; creating reports may need a model, but reads do not.

1. Read with `session_id` and `report_offset: 0`. Save `reportPage.reportSourceEventId`, text and `nextOffset`.
2. Have the same Assignment accept a distinct new report. Inspect its current summary to confirm acceptance.
3. Continue with the saved `report_source_event_id` and returned `nextOffset`. Concatenated pages must exactly match the original body, not the new report.
4. Restart the same owned Profile. Repeat a saved continuation and compare report identity and text.
5. Read offset 0 without identity: it selects the new report. Read a nonzero offset without identity: `REPORT_ID_REQUIRED` and no body. A different Bot cannot read the Assignment, even with a valid report identity. An unknown identity returns `REPORT_UNAVAILABLE`.
6. In a disposable fixture, purge the report's Source Event and repeat the pinned read. It must refuse, never substitute the latest body. Automated coverage also purges while the native read is pending.

Save redacted CLI results, exact-body digests, DSH version and restart evidence. Real SQLite Runtime tests exercise cross-page updates, malformed metadata, scoped identities and purge; direct adapter tests exercise the same tool used by CLI. These do not replace a real Host continuation run.

## Gotchas

- Assignment `sourceEventId` is its origin, not the report identity.
- Native lookup examines the last 64 matching calls; identity does not guarantee indefinite readability.
- Keep Spill locators opaque. Never seed a second full-text application store.
- Capture shell/console health separately; a shell screenshot does not prove report paging.
- Stop the task-owned Host and verify process/port release; preserve its Profile when it is needed for restart evidence.
