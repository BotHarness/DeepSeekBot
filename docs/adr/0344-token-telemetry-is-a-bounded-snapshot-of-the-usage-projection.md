---
Status: Accepted
Date: 2026-11-16
Issues: [#4255](https://github.com/BotHarness/DeepSeekBot/issues/4255)
---

# Token telemetry is a bounded snapshot of the Usage Projection

The anonymous Host usage report contains message, Session and Bot counts, but the product's local Usage Projection already owns token accounting from DSH SessionEvents. Re-parsing model responses in telemetry would duplicate attribution, inherited-event exclusions, receipt deduplication and unknown-bucket rules.

## Decision

The application-defined Usage Projection exposes an internal anonymous snapshot of `usage_daily`, grouped only by Host-local day across all owned Bot Sessions. It covers today and the six preceding local calendar days. Orchestrator, Assignment and derived Session usage follows the existing projection; unowned native Sessions never enter it. No new table, migration, Host route, model tool or identity is added.

The Host Telemetry lifecycle checks hourly and sends only changed days as `app:token_usage_report`. It waits for initial reconciliation and does not read during rebuild. Missing histories retain the existing projection's counts with `is_reconciled=false`; they do not become zero. Disabling telemetry prevents reads and sends. Disposal cancels the timer. Token failures are isolated from the existing daily message/Session report.

`day_timestamp` encodes the Host-local YYYY-MM-DD label as UTC midnight, rather than the instant of local midnight. Bucket counts are exact only when every contributing request supplied or settled that bucket. Unknown exact buckets are omitted; `is_partial` exposes any unknown bucket. `reported_total_token_count` preserves the same reported lower bound as Overview, and `unknown_total_count` counts requests without an exact total. None of these fields contains Bot, Session, Human, provider/model identifiers, content or a credential.

Snapshots can repeat after restart or change after reconciliation, including a downward correction. PostHog must select the latest event for each anonymous install and `day_timestamp` before aggregating across installs. It must select the entire latest snapshot before testing field presence, so an omitted unknown total cannot revive an older exact total. Raw event/property sums are invalid. The existing sender remains best effort; later changed snapshots or restart may repair a dropped snapshot but delivery is not guaranteed.

## Trade-offs

The seven-day window bounds event volume and late correction. Older history is not backfilled; Bot deletion and corrections older than seven days do not rewrite previously collected analytics. A reset Install ID remains a new anonymous installation. Hourly checks can delay new usage by an hour. These snapshots are product analytics, not a billing ledger or a per-Session remote audit log.

Implementation and the query contract: [Token telemetry](../token-telemetry.md).
