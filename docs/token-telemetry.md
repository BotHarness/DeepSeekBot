# Anonymous Bot token telemetry

With Host telemetry enabled, `app:token_usage_report` sends changed daily token snapshots from the existing local Usage Projection. The Host checks hourly, after initial Session reconciliation, and covers today plus the previous six Host-local calendar days. Current-day values are incomplete. An empty day in the ready projection produces a zero snapshot, so deleting the last Bot cannot leave an older nonzero snapshot current. Unknown provider usage remains distinct from an empty day.

The same owned Orchestrator, Assignment and derived Sessions contribute to local usage and telemetry. Native Sessions without Bot ownership do not contribute. Existing receipt and inherited-event rules prevent replay from multiplying tokens. The report is anonymous at the installation level: it contains no Bot names, Session IDs, Human IDs, prompts or message contents. The day report carries no provider or model; the per-model report below names only a coarse provider kind and built-in model IDs. The existing telemetry preference and environment locks apply.

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

## Per-model snapshots

`app:model_usage_report` splits the same daily snapshot by provider kind and model, with the same token properties and lower-bound rules. It comes from the same `usage_daily` rows and cadence, and only changed rows are sent.

| Property        | Meaning                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider_kind` | `deepseek_official`, `deepseek_account`, `deepseek_api` (a DeepSeek API key), `opencode_go`, `custom`, `other` (any other configured provider) or `unknown` (the request named no provider) |
| `model_id`      | The lowercase model ID for the built-in provider kinds, such as `deepseek-v4.1-flash`; `custom`, `other` or `unknown` for the matching provider kinds                                       |

Provider instances collapse into their kind (`opencode-go` and `opencode-go-2` are both `opencode_go`). A model name the Human typed for a custom provider, or the ID of an unrecognized provider, is never sent. When a day's row for a kind and model disappears, for example after Bot Purge, the running Host sends a zero snapshot for it; a row that disappears while the Host is stopped keeps its last value.

Select the latest snapshot per install, day, provider kind and model, then sum:

```sql
SELECT
  formatDateTime(toTimeZone(day_timestamp, 'UTC'), '%Y-%m-%d') AS usage_day,
  provider_kind,
  model_id,
  sum(toFloat(snapshot.1)) AS reported_token_lower_bound
FROM (
  SELECT person_id, properties.day_timestamp AS day_timestamp,
    properties.provider_kind AS provider_kind, properties.model_id AS model_id,
    argMax(tuple(properties.reported_total_token_count), timestamp) AS snapshot
  FROM events
  WHERE event = 'app:model_usage_report'
    AND timestamp >= now() - INTERVAL 30 DAY
    AND properties.source = 'host'
  GROUP BY person_id, day_timestamp, provider_kind, model_id
)
GROUP BY usage_day, provider_kind, model_id
ORDER BY usage_day, reported_token_lower_bound DESC
```

## Per-turn cost and Context Sources

`chat:bot_turn_complete` is a separate per-turn event, sent once when a Bot-owned Orchestrator or Assignment turn ends. It carries what that one turn cost and where its context came from, so changes to the Bot Inbox, wake policy or prompts can be compared by turn instead of by day.

| Property                                                                                       | Meaning                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `role`                                                                                         | `orchestrator`, `assignment` or `other` Session root role                                                                  |
| `outcome`                                                                                      | `completed`, `failed`, `cancelled` or `other`                                                                              |
| `trigger`                                                                                      | What opened the turn: `human` text, `inbox` content, `mixed` (both) or `other`                                             |
| `provider_kind`, `model_id`                                                                    | Provider kind and model of the turn's last model step, as in the per-model snapshot; `unknown` when no step named one      |
| `has_model_switch`                                                                             | Steps in the turn used more than one provider kind or model, for example after a fallback                                  |
| `step_count`, `tool_call_count`                                                                | Model requests and tool calls in the turn                                                                                  |
| `input_token_count`, `cache_read_token_count`, `cache_write_token_count`, `output_token_count` | Reported usage summed over the turn's model requests; `input_token_count` is uncached input                                |
| `is_partial`                                                                                   | At least one request in the turn did not report input, output or cache-read usage                                          |
| `context_token_count`                                                                          | Estimated size of the context at the end of the turn (the composer's context meter)                                        |
| `context_<source>_token_count`                                                                 | Estimated tokens of the whole context per Context Source                                                                   |
| `added_<source>_token_count`                                                                   | Estimated tokens the turn itself appended per Context Source; the system prompt and tool schemas are never added by a turn |

Context Sources are the rows of the composer's context breakdown: `system`, `tools`, `human`, `inbox_mention` (Group, DM, external and other Channel items), `inbox_schedule`, `inbox_memory`, `inbox_assignment`, `inbox_open` (the `[Open Inbox]` reminder of unresolved items), `host`, `skills`, `attachments`, `replies`, `thinking`, `tool_use`, `summary` and `other`. They are estimates from the native Token Meter split by message section; the usage counts are provider-reported. No text, names or IDs are sent.

Each event is one turn, so sum and average these events directly. For example, the share of uncached input that inbox content adds to inbox-triggered Orchestrator turns:

```sql
SELECT
  count() AS turns,
  avg(toFloat(properties.input_token_count)) AS avg_uncached_input,
  avg(toFloat(properties.cache_read_token_count)) AS avg_cache_read,
  avg(toFloat(properties.added_inbox_mention_token_count)
    + toFloat(properties.added_inbox_assignment_token_count)
    + toFloat(properties.added_inbox_schedule_token_count)
    + toFloat(properties.added_inbox_memory_token_count)
    + toFloat(properties.added_inbox_open_token_count)) AS avg_added_inbox,
  avg(toFloat(properties.step_count)) AS avg_steps
FROM events
WHERE event = 'chat:bot_turn_complete'
  AND properties.role = 'orchestrator'
  AND properties.trigger = 'inbox'
  AND timestamp >= now() - INTERVAL 7 DAY
```

## Verify without depending on a model for the reporter

`pnpm exec vitest run packages/core/test/token-telemetry.test.ts` drives the real Usage Projection with deterministic SessionEvents, compares exact wire values, and exercises unknown buckets, replay, owned children, opt-out and restart behavior.

For a real reply, launch a task-owned isolated Host through `verify-app`, complete one Bot DM, and read `deepseekbot overview-usage --period week` plus `telemetry-status` against that Host. Then run `node scripts/e2e-token-telemetry.mjs --name <name>` from this checkout. The script compares the production snapshot reader/serializer with the live Host Overview, checks that the per-model snapshots add up to each day snapshot and keep provider instance IDs local, and saves a redacted numeric report. It does not alter the Host database or its reporter cadence.

Add `--send` only for an authorized PostHog wire check. It uses a separate anonymous QA installation and version `0.0.0-qa.4255`, excluded from release analytics. It invokes the production reporter immediately rather than waiting for the Host's normal hourly timer. Verify ingestion separately in PostHog, matching the returned timestamp and token fields; HTTP acceptance alone is not ingestion proof. Local paths and credentials stay in ignored verification state.

See [ADR-0344](decisions/persistence.md#adr-0344).
