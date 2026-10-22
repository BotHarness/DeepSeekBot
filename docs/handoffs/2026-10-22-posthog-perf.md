# Handoff: PostHog device + performance metrics (by version)

Checked at BotHarness/DeepSeekBot main `8f4e650d` (code inspection only, PostHog data not queried).

## Current state

| Surface | What goes to PostHog | Version | Device info | Memory / CPU / perf |
|---|---|---|---|---|
| Host (Node, `packages/core/src/telemetry/service.ts`) | `plugin_started`, daily usage counts (`daily-usage.ts`), `$exception` (`exceptions.ts`), `bot_created` / `avatar_edited` / `banner_edited` / `bot_archived` | `plugin_version`, `dsh_version` **only on `plugin_started`** | `os`, `arch` only on `plugin_started` | none |
| Web client (`packages/client`) | nothing directly; only a settings toggle that drives Host telemetry | none | none | none |
| Mobile (`apps/mobile/src/telemetry/*`, `posthog-react-native` 4.81.2, strict allowlist in `schema.ts`) | `mobile_app_opened`, `mobile_pairing_*`, `mobile_connection_result`, `mobile_activation_step` | `app_version`, `app_build` on every event | `platform` (ios/android) only, no OS version or model | none (only `duration_bucket` on connect/pair) |

So: app version exists, device info is minimal, memory/CPU/performance is not collected anywhere. There is no separate desktop app; "desktop" is the Host + web client.

Privacy constraints already in place (keep them): anonymous random install id / per-launch UUID, `$process_person_profile: false` / `personProfiles: 'never'`, `disableGeoip`, opt-out via settings, `DO_NOT_TRACK`, `BOTHARNESS_TELEMETRY=0`. Mobile `sanitizeEvent` rejects any property not in the allowlist, so every new field must be added to `schema.ts` and its tests.

## What to add

Rule for all new fields: coarse buckets or rounded numbers, no hostnames, paths, usernames, serials, IDFA/Android ID, or exact RAM bytes. Update the privacy page (deepseekbot-site, `/privacy/`) in the same change, and ship CLI parity per AGENTS.md if any toggle is added.

### 1. Common context on every event (do this first, highest value)
- Host: move `plugin_version`, `dsh_version`, `os`, `arch` from `plugin_started` into the `enqueue` base properties, plus `node_version` (major only), `os_release_major`, `cpu_count_bucket` (`1-2|3-4|5-8|9-16|17plus`), `total_mem_gb_bucket` (`<=4|8|16|32|64plus`).
- Mobile: add to `TelemetryContext`: `os_version` (major.minor, from `expo-device` `osVersion`), `device_class` (`Device.deviceType`: phone/tablet), `device_model` (`Device.modelId` e.g. `iPhone11,6`, a public hardware id, not unique per user), `total_mem_gb_bucket` (`Device.totalMemory`), `device_year_class` (`Device.deviceYearClass`). 
- Web: if wanted, send `client_ready` via the Host bridge (no new SDK) with `ua_browser` + major, `ua_os`, `viewport_bucket`, `device_memory_gb` (`navigator.deviceMemory`, already coarse), `hardware_concurrency_bucket`.

### 2. Periodic resource sample
- Host `host_resource_sample` every 1h while running (and once 5 min after start): `rss_mb_bucket`, `heap_used_mb_bucket` (`<128|128-256|256-512|512-1024|1024plus`), `event_loop_lag_p99_ms` (via `perf_hooks.monitorEventLoopDelay`, rounded to 10 ms), `cpu_pct_avg` (from `process.cpuUsage()` over the window, rounded to 5%), `uptime_hours_bucket`, `active_bots_bucket`.
- Mobile `mobile_perf_sample` once per foreground session at background/exit: `js_fps_p50_bucket` and `slow_frame_pct` (from a lightweight rAF counter during streaming), `memory_warning_count` (AppState `memoryWarning`), `foreground_duration_bucket`. Avoid a native module unless needed.

### 3. Startup and latency timings
- Mobile: `mobile_app_opened` gets `cold_start_ms_bucket` (process start to first chat render; RN `performance.now()` at module load vs first render).
- Host: `plugin_started` gets `startup_ms_bucket`.
- Optional, highest signal for regressions: `bot_turn_completed` with `first_token_ms_bucket`, `turn_ms_bucket`, `model_family` (no prompt, no bot name).

### 4. Crashes
Host already sends `$exception`. Mobile has `errorTracking.autocapture: false`; consider enabling JS crash capture through the same allowlisted sender (stack frames only, path-normalized like `exceptions.ts`).

## Suggested PostHog setup
- Dashboard "Performance by version": trends of `host_resource_sample` p50/p90 `heap_used`/`rss`/`event_loop_lag`/`cpu_pct`, broken down by `plugin_version`; mobile `cold_start_ms` and `slow_frame_pct` by `app_version`; filter last 2 versions.
- Dashboard "Devices": unique installs by `os`/`arch`/`total_mem_gb_bucket` (Host) and `device_model`/`os_version`/`device_year_class` (mobile); perf metrics broken down by `device_year_class` to spot slow-device-only issues.
- Alerts (Insight alerts): p90 `event_loop_lag` or `heap_used` on the newest `plugin_version` > 1.5x the previous version over 24 h; mobile `memory_warning_count` rate or `$exception` count per open up > 50% on newest `app_version`.
- Annotations on each release date (can be added from the release workflow) so regressions line up with versions.

## Tests to touch
`apps/mobile/test/posthog-sender.test.ts`, `apps/mobile/test/native-telemetry.test.ts` (allowlist), Host telemetry tests next to `packages/core/src/telemetry/`, and `packages/ingest/test/ingest-proxy.test.ts` if the proxy filters events.
