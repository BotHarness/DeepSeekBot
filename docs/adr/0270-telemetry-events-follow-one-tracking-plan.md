# ADR-0270: Telemetry events follow one tracking plan

- Status: Accepted
- Date: 2026-10-28
- Related: ADR-0132, ADR-0214, ADR-0256

## Context

The Host, the Web Client, the mobile app, the product site and the short-link Worker each named PostHog events their own way: `plugin_started`, `intro_shown`, `mobile_pairing_result`, `install_cta_clicked`. The same behavior had different names on different sources, so dashboards could not compare desktop and mobile or trend a feature across versions. Web Client intro and marketplace events sent their properties as extra Gateway arguments, which the `introEvent` Remote method rejected, so every one of them with properties was lost. There was no daily active definition: `daily_usage` fires whenever the Host is online, whether or not a Human used it.

## Decision

- **One naming rule.** Every event is `category:object_action`, lowercase snake_case, with a present-tense verb from a fixed list. The same behavior has the same name on every source. Outcomes are one `_complete` event with an `outcome` property. Booleans start with `is_` or `has_`, counts end with `_count`, bands with `_bucket` and times with `_timestamp`. There is no `feature` property; the category groups events by feature.
- **Common properties.** `source` is `host`, `mobile`, `site` or `links`. `app_version` replaces `plugin_version`. Host feature events carry `surface`: `desktop_app`, `browser`, `mobile_remote`, `cli`, `bot_tool` or `im`.
- **A typed registry.** `packages/core/src/telemetry/events.ts` lists every Host and Web Client event and its allowed properties; the mobile schema lists the mobile ones. The Host refuses an unregistered event or property value and logs it. `docs/telemetry-events.md` is generated from the registries and a test keeps it current. Registration is required for every event sent; a feature is not required to have events.
- **One Web Client entry point.** The Remote method `telemetryEvent(event, properties)` takes properties as one argument, so the Gateway accepts them.
- **Active Day.** The Host sends `app:active_day_start` once per Host-local day, on the first Bot mode entry, Human message or IM message. DAU, WAU and MAU count installs with this event. `app:usage_report` stays the Host-online signal.
- **Old clients.** Released clients keep sending old names. The `t.botharness.ai` ingest proxy renames them, and the old `plugin` source and `plugin_version`, before PostHog stores them. Mobile renames events still waiting in its local queue. The rename map shrinks when no released client sends an old name.

## Considered options

- **Keep names and map them in dashboards.** Every insight would need per-source event lists, and new events would keep drifting.
- **Rename in PostHog only, with no proxy.** Old clients would split each event across two names until every install updates.
- **Count DAU from `app:usage_report`.** It counts installs whose Host was running, not installs a Human used.

## Consequences

Event history before the rename is under the old names in PostHog, apart from what the proxy renames from now on. The ingest Worker must be deployed before the new clients release. New events need a registry entry in the same change, which `pnpm telemetry:plan` regenerates into the plan.
