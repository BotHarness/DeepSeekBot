# Anonymous Bot token telemetry

With Host telemetry enabled, `app:token_usage_report` sends changed daily token snapshots from the existing local Usage Projection. The Host checks hourly, after initial Session reconciliation, and covers today plus the previous six Host-local calendar days. Current-day values are incomplete. An empty day in the ready projection produces a zero snapshot, so deleting the last Bot cannot leave an older nonzero snapshot current. Unknown provider usage remains distinct from an empty day.

The same owned Orchestrator, Assignment and derived Sessions contribute to local usage and telemetry. Native Sessions without Bot ownership do not contribute. Existing receipt and inherited-event rules prevent replay from multiplying tokens. The report is anonymous at the installation level: it contains no Bot names, Session IDs, Human IDs, provider/model names, prompts or message contents. The existing telemetry preference and environment locks apply.

| Property                                            | Meaning                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `day_timestamp`                                     | Host-local calendar date encoded as UTC midnight in milliseconds                      |
| `input_token_count`, `output_token_count`           | Exact uncached-input/output buckets; omitted when unknown                             |
| `cache_read_token_count`, `cache_write_token_count` | Exact cache buckets; omitted when unknown                                             |
| `total_token_count`                                 | Exact total; omitted if any contributing request has an unknown total                 |
| `reported_total_token_count`                        | Reported lower bound, equal to the local Overview day's total when any usage is known |
| `unknown_total_count`                               | Number of contributing requests without an exact total                                |
| `is_partial`                                        | At least one exact bucket is unknown; an exact total can still be present             |
| `is_reconciled`                                     | Every owned Session history was available during the latest reconciliation            |

`reported_total_token_count=0` together with unknown usage is not evidence of zero consumption. Partial reported totals must be presented as lower bounds. Missing histories can leave retained counts with `is_reconciled=false`. Input, output and cache counts need not be available even when a provider supplies an exact total.

## PostHog query contract

These are replaceable snapshots, not incremental counters. First select the latest complete snapshot per anonymous install and day, then inspect its fields and sum across installs. Do not sum raw events. This example computes reported lower bounds; label the result accordingly. Production insights must also preserve the project's internal/test filters and exclude QA/non-release versions.

```sql
SELECT
  formatDateTime(toTimeZone(day_timestamp, 'UTC'), '%Y-%m-%d') AS usage_day,
  sum(toFloat(snapshot.1)) AS reported_token_lower_bound,
  sum(toInt(snapshot.2)) AS unknown_total_count,
  countIf(snapshot.3 = false) AS unreconciled_install_count
FROM (
  SELECT person_id, properties.day_timestamp AS day_timestamp,
    argMax(tuple(properties.reported_total_token_count,
                 properties.unknown_total_count,
                 properties.is_reconciled), timestamp) AS snapshot
  FROM events
  WHERE event = 'app:token_usage_report'
    AND timestamp >= now() - INTERVAL 30 DAY
    AND properties.source = 'host'
  GROUP BY person_id, day_timestamp
)
GROUP BY usage_day
ORDER BY usage_day
```

PostHog exposes `day_timestamp` as a DateTime property. Use it as a timestamp in HogQL; do not divide it by 1,000 again. The QA ingestion check verified the UTC day labels and the latest-snapshot total after sending the same days twice.

For an exact-total chart, include `properties.total_token_count` in that same tuple. Test for absence only **after** choosing the latest snapshot; otherwise an older exact count could survive a newer unknown value. Keep coverage counts next to totals. Restart may repeat a snapshot; reconciliation or Bot deletion may reduce one. Corrections older than seven days and reset-install identity cannot be repaired remotely. Historical PostHog message counts cannot reconstruct token usage from before this event existed.

## Verify without depending on a model for the reporter

`pnpm exec vitest run packages/core/test/token-telemetry.test.ts` drives the real Usage Projection with deterministic SessionEvents, compares exact wire values, and exercises unknown buckets, replay, owned children, opt-out and restart behavior.

For a real reply, launch a task-owned isolated Host through `verify-app`, complete one Bot DM, and read `deepseekbot overview-usage --period week` plus `telemetry-status` against that Host. Then run `node scripts/e2e-token-telemetry.mjs --name <name>` from this checkout. The script compares the production snapshot reader/serializer with the live Host Overview and saves a redacted numeric report. It does not alter the Host database or its reporter cadence.

Add `--send` only for an authorized PostHog wire check. It uses a separate anonymous QA installation and version `0.0.0-qa.4255`, excluded from release analytics. It invokes the production reporter immediately rather than waiting for the Host's normal hourly timer. Verify ingestion separately in PostHog, matching the returned timestamp and token fields; HTTP acceptance alone is not ingestion proof. Local paths and credentials stay in ignored verification state.

See [ADR-0344](adr/0344-token-telemetry-is-a-bounded-snapshot-of-the-usage-projection.md).
