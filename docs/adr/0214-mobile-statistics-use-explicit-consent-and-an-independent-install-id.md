---
Status: Proposed
Date: 2026-10-16
---

# Mobile statistics default on with an independent install ID

The Expo app needs to distinguish pairing failure, connection failure and a usable first chat without exporting the Human's conversations or Host identity. [#1929](https://github.com/BotHarness/DeepSeekBot/issues/1929) defines the contract; [#1935](https://github.com/BotHarness/DeepSeekBot/issues/1935) implements its first tracer. This extends ADR-0132's Host-only scope. It does **not** change the Host's default-on policy.

## Decision

An application-defined Mobile Telemetry owner in `apps/mobile/src/telemetry/` owns the local opt-out preference, random Mobile Install ID, foreground sessions, once-per-identity activation steps and a sanitized delivery queue. New installations default on, while a saved opt-out remains off. The only English/Chinese switch is at the bottom of Settings, and its detailed explanation is collapsed by default. Pairing has no statistics control. The Human requested this revision on 2026-10-16, superseding the opt-in presentation in #1929. The Human then directed us to the Web client. Its `TelemetryNoticeController` shows an informational notice once while telemetry is enabled, remembers dismissal, and does not gate collection. Mobile follows that verified behavior with short copy, collapsible phone-specific details, the same localized privacy URLs, source and Settings links, and Got it. No legal terms acceptance is introduced or claimed. The app remains usable offline and with statistics disabled.

Host client, saved Hosts, Conversation and PushSession keep product authority. Mobile Telemetry observes their results; it has no Host RPC interceptor, product store or permission authority. This slice adds no permission/push events.

- Pairing starts at explicit QR/paste/deep-link submission, before parsing. Scanner repetition is suppressed; explicit retry is a new attempt. Success follows redemption **and saved-Host persistence**. Refusal, storage failure and cancellation stay distinct.
- Connection readiness follows authenticated live Roster loading. Socket open and cached content do not count. One 30-second observation bounds open/pair/resume/switch/recovery/manual-retry episodes without changing Host reconnection. Backgrounding cancels observation; automatic backoff ticks do not create events. Later recovery is another episode.
- Message acceptance follows `channelSend` success or the canonical journal entry for an active outgoing message. Optimistic and failed bubbles do not count. A newly committed Bot entry counts only after an accepted send in that foreground conversation; initial/replayed history, background and covered screens do not count. This means observation, not causal reply latency, successful model execution or task completion.

## Official React Native SDK

Use `posthog-react-native` 4.81.2, pinned in the lockfile. Follow the [official library documentation](https://posthog.com/docs/libraries/react-native) and [Expo tutorial](https://posthog.com/tutorials/react-native-analytics), with a narrower capture policy than the tutorial examples. The SDK is instantiated lazily, after configuration eligibility and an approved batch. No `PostHogProvider`, `identify` or `alias` is used. A small adapter uses the SDK's protected stateless capture seam to supply the owner's anonymous ID without a second persisted identity.

The SDK has memory-only storage, empty custom app properties, person profiles disabled, automatic lifecycle/push/error/replay/log collection disabled, remote config/flags/surveys disabled, no tracing headers, no SDK retries and no periodic flush. `before_send` reconstructs approved events. The final transport checks the actual serialized SDK body against the same allowlist and refuses unexpected fields/endpoints. Tests run the actual SDK with native bridges substituted; this is wire qualification, not native-runtime proof.

The owner keeps the sole durable queue and retry policy because SDK queue count alone does not express the agreed 24-hour TTL/byte budget. The alternative minimal HTTP adapter is unnecessary after the official SDK passed the serialization test. No replay package or PostHog config plugin is installed. SDK-matched `expo-device` supplies the physical-device check and `expo-application` supplies installed version/build metadata; these added native modules require a coordinated new development build. Metro exports and device qualification remain separate checks.

## Data and lifetime

Allowed properties: `source=mobile`, schema version 1, iOS/Android, public numeric app version/build (or `unknown` when absent), development/preview/production, en/zh, random telemetry UUIDs, bounded enums/buckets, and protocol controls disabling profiles/GeoIP. No Host/site/user identity stitching. Domain IDs may exist inside product state for local reconciliation but never reach telemetry, even hashed. There is no screen, touch, per-message, token, exception, filename, notification-content or tool-input event stream.

Events are `mobile_app_opened`, `mobile_pairing_started`, `mobile_pairing_result`, `mobile_connection_result`, and `mobile_activation_step` (`host_ready`, `message_accepted`, `bot_message_observed`). Foreground sessions renew after 30 minutes in background. Short OS dialogs do not renew the session; they still end foreground conversation observation. Durations use a monotonic clock and five buckets. Retry counts use 0/1/2–3/4plus.

Sanitized events are persisted before delivery, capped at 100 events / 256 KiB, expiring after 24 hours with oldest-first eviction. Delivery is asynchronous, times out after 8 seconds and retries with bounded backoff up to 60 seconds. Retry preserves event UUID. Network acceptance is not exactly-once proof. Opt-out aborts the in-flight request, clears local identity, activation markers and queue, and resets/opts out the memory-only SDK. It cannot recall a request already received by the service.

Preference/notice-seen/identity/queue live in the app document directory, not SecureStore. A fresh install with no restored app data defaults on with a random identity; OS backup restoration can restore preference/identity and unexpired events. JavaScript cannot distinguish an OS-restored document from ordinary retained app data. Physical reinstall/restore behavior is a separate qualification gate. Corrupt/read-failed storage starts off. A write failure fails closed for the current process and exposes a retry notice; it cannot promise a durable opt-out until the write succeeds.

## Configuration and qualification

Unconfigured, test and web-preview builds never collect/send. Explicit QA requires a public project token and a UUID QA tag and is excluded from production analysis. Production additionally requires a release build, a physical device and an explicit qualification flag; no production configuration is enabled by this change.

The first-party endpoint remains `https://t.botharness.ai/batch/`. The proxy carries the client IP at transport level. Project 648269 was read on 2026-10-16: `anonymize_ips=true`, timezone `Asia/Shanghai`. This setting is separate from per-event `$geoip_disable`; do not call the transport IP-free. Recheck before rollout. Public website privacy copy is coordinated with #950; publication and native verification of the first-use notice are rollout gates.

See [the bilingual privacy description and QA runbook](../mobile-statistics.md). Automated checks, Metro export, Simulator, physical iOS, physical Android, PostHog readback and Human acceptance are separate evidence. #1936/#1937 stay blocked until the first tracer's Human QA passes.
