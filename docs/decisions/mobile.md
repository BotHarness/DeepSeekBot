---
Publish: true
---

# Mobile app: live state, push, local data and connections

These decisions cover the Host Feed on the phone, Activity notifications, local data and presentation, mobile statistics, and independent cloud and Tobs Connect sessions. See the [BotHarness architecture](../architecture/botharness-architecture.md), [connection decisions](connections.md), [Inbox and attention decisions](inbox.md), [approval decisions](approvals.md), and [product glossary](../../GLOSSARY.md).

Two rules run through every section:

- **The service that owns the data authorizes each operation.** A paired Host owns its Channel Messages and Activity. A cloud instance verifies its own sessions and grants. Stored credentials, route selection, and cached rows cannot extend those grants.
- **The phone owns its presentation and delivery preferences.** Local caches, playback, chat backgrounds, and notification attempts are scoped to their source. Recovering or discarding them does not decide Host requests or replay uncertain sends.

## 1. Read the Host Feed through the paired device gateway

<a id="adr-0200"></a>
<a id="adr-0278"></a>
_Formerly ADR-0200 and ADR-0278._

The phone uses the shared client in `packages/host-client`. Unary calls use the DSH HTTP envelope. One mux socket per running client carries `botharness/followRoster`, `botharness/followActivity`, and followers such as `botharness/followChannel`. The device gateway prefixes the mux path as `/botharness-device/api/remote.mux`. The client chooses stream IDs and opens streams with `{ args }`. It dispatches items and terminal frames by stream ID, opens fresh followers on reconnect, and reloads unary state around the new generation. The core socket waits for both Roster and Activity baselines. Channel journal reads track a revision independently. After a successful unary reload the paired client acknowledges the feed via `POST /botharness-device/feed-read`. An older Host returning 404 still serves the feed.

The browser-cookie login in ADR-0200 was the development tracer. The phone now presents its per-device credential to the gateway, including inside the pinned encrypted channel on routes that require it. The historical wire fixture still exercises the mux framing. The paired client uses the mux throughout recovery. See [Device Pairing and encrypted routes](connections.md#adr-0244).

Android selects StableLib X25519 2.0.1 through platform file resolution in the encrypted carrier. The Host and other Clients use the existing noble adapter. Both use 32-byte keys and reject all-zero shared secrets. The shared `NoiseXk` state machine still owns the `Noise_XK_25519_ChaChaPoly_SHA256` transcript, fresh ephemeral keys, derivation, encryption, counters, and closure. Its Noise message limit is 65,535 bytes. Host key pins and Device Pairing admission apply to either implementation. ADR-0278 was marked Proposed. The Android adapter is in use in source, with broader native qualification tracked in [#3257](https://github.com/BotHarness/DeepSeekBot/issues/3257). Rolling back the adapter restores the default calculation without migrating data or re-pairing.

Why: the shared framing keeps the phone independent of the Web Client's Cordis runtime and puts all typed followers on one socket. The Android adapter reduces key-agreement work on the JavaScript thread while preserving the wire contract.

Enforced by: [host-client.test.ts](../../apps/mobile/test/host-client.test.ts), [encrypted-carrier.test.ts](../../apps/mobile/test/encrypted-carrier.test.ts), [noise-key-agreement.test.ts](../../apps/mobile/test/noise-key-agreement.test.ts), and [connect-noise.test.ts](../../packages/core/test/connect-noise.test.ts).

## 2. Project Activity into per-device push with bounded previews

<a id="adr-0202"></a>
<a id="adr-0213"></a>
_Formerly ADR-0202 and ADR-0213._

The Host projects action items, unread group replies and mentions, and DM replies into Expo Push Service sends. The projection reads for the Human behind the admitted device. Host changes trigger reconciliation, with a one-minute sweep as a fallback. It records which current items the device has seen, suppresses items older than registration, and checks the device's enabled state, delivery mode, kinds, and muted Channels. Channel mute suppresses replies. In-app delivery suppresses these item pushes, and a desktop or Web presence lease holds reply pushes while actions remain eligible. The device owns its [Device Notification Preference](connections.md#adr-0243).

`GET /botharness-device/push` reads settings for the admitted device. The same prefix accepts `POST` to `/register`, `/preferences`, `/quiet`, `/test`, and `/unregister`. A token moves to the latest registration. Revocation and Expo's `DeviceNotRegistered` remove the affected token. The sender allows up to three total attempts for retryable failures and starts checking tickets for receipts after 15 minutes. Logs record bounded outcomes without tokens or content.

For a group, the title uses `#<Channel name>`. For a DM it uses the sender label. The body uses localized request or reply copy and a short preview when eligible. A Tool approval shows the tool and selects its main argument in this order: `command`, `cmd`, `script`, `code`, `url`, `path`, `file_path`, then the first object field. The Host collapses whitespace, trims the text, and omits empty previews. The preview, including its ellipsis when clipped, occupies at most 140 UTF-16 code units. This cap applies to the preview inside the body. Private input and masked approvals omit the preview. Always allow is offered only when the Host's approval lookup grants it. A lookup miss uses the once-or-reject category. Masked requests omit the action category. Android can handle eligible approval decisions natively, with an app-opening fallback. iOS actions open the app. The request remains on its owning Host, and dismissing an alert leaves the request pending.

ADR-0213 replaced the content-free presentation in ADR-0202. Current push data also carries display text and metadata beyond IDs. Item pushes include `v`, `hostId`, `itemId`, `kind`, `botSlug`, `sender`, and localized `text`. Channel and message IDs, a group name, Bot author metadata, and projected approval metadata are conditional. On Android's data-only path the app also gets the display `title`, `message`, `badge`, and an eligible `categoryId` inside `data`. On the ordinary alert path Expo carries the display title and body separately. Notification taps resolve the original Host and item.

The badge counts unresolved actions. Where supported, background resolution pushes carry up to 50 removed item IDs per payload so the phone can withdraw delivered alerts. On iOS a zero badge travels in `data` for the app to apply, preserving unrelated delivered notifications. Each Host sends its own count. Expo acceptance and a system posting attempt provide separate evidence from display or a Human read.

Why: the short preview lets a Human triage from the lock screen. Activity continues to decide what is pending, and the app reads the full item through the original paired route.

Enforced by: [push-preview.property.test.ts](../../packages/core/test/push-preview.property.test.ts), [push-delivery.test.ts](../../packages/core/test/push-delivery.test.ts), [push-answer.test.ts](../../apps/mobile/test/push-answer.test.ts), and [device-notification-preferences.test.ts](../../apps/mobile/test/device-notification-preferences.test.ts).

## 3. Android arbitrates local alerts and FCM on the device

<a id="adr-0298"></a>
_Formerly ADR-0298._

Keep connected starts off. When explicitly enabled from the visible app, a `remoteMessaging` foreground service keeps the existing runtime eligible through a Headless JS task. The ongoing notification's Stop action clears the saved choice and releases background connection demand. Cloud token registration and system notification permission have their own lifecycles. A paired client runs when foreground, while retained for scoped work, or when the service runs and that Host's notifications are enabled. Unknown preferences start with background demand off. A credential refusal stops transport and retry work and clears only the affected Host's presentations.

The native arbiter keys presentation attempts by Host and Activity item. When the background service runs, eligible FCM delivery gives the local projection a 1,500 ms head start. The first eligible durable claim wins. A foreground claim targets the in-app banner and works without system notification permission. Background presentation requires permission. A visible conversation silently consumes ordinary replies while requests remain actionable. An explicit system posting failure releases eligibility. Process death between a durable claim and presentation can lose the alert.

Only a complete, non-stale Activity notification projection can resolve absence or advance the recovery baseline. A fresh scan prompted by FCM can reconcile an item that was never seen locally. An offline phone cannot confirm that a request resolved elsewhere. The first enabled baseline absorbs old replies and groups unseen unresolved requests by Host. Unexpected reconnects or a new runtime can group unseen backlog. The existing native `approval-alerts.db` schema v2 adds baselines, recovery cohorts, and a durable sound claim while keeping v1 delivery records. Grouped items cannot also win an individual claim. Partial resolution updates the same alert, and full resolution cancels it. An uncertain group sound attempt can retry silently. A rollback must retain the v2 reader and migration because the v1 helper cannot open the newer database.

The ongoing notice counts active Bots and distinct Bots with action items using synchronized Host projections. Counts are scoped to each Host. Partial coverage is disclosed, and zero synchronized Hosts yields unavailable. Setup and diagnostics keep service state, permission, notification channels, battery optimization, and power-save observations separate. The local test posts generic content with a fixed ID and one-minute timeout. Recent diagnostics hold at most 20 phase records. Force-stop, reboot, and vendor background restrictions can prevent delivery.

Why: a transport can reach the Host while Android still suspends the app. Sharing one durable claim across FCM and the local path bounds duplicate presentation without treating an OS call as a delivery receipt.

Enforced by: [connection-lifetime.test.ts](../../apps/mobile/test/connection-lifetime.test.ts), [device-alerts.test.ts](../../apps/mobile/test/device-alerts.test.ts), [device-alert-recovery.test.ts](../../apps/mobile/test/device-alert-recovery.test.ts), and [native arbitration tests](../../apps/mobile/modules/conversation-notifications/android/src/test/java/expo/modules/conversationnotifications/ApprovalAlertsTest.kt).

## 4. Mobile statistics default on with a separate install identity

<a id="adr-0214"></a>
_Formerly ADR-0214._

An eligible new phone installation defaults to statistics on and retains any saved opt-out. Native QA requires an explicit QA run ID, and production requires a qualified non-development build on a physical device. Both require a public PostHog ingestion token. The once-per-install information notice can be dismissed independently of the Settings switch. The original filename referred to explicit consent, and the record was marked Proposed. The implemented policy is optional collection with a default-on preference and a separate random Mobile Install ID. The app remains usable offline and with statistics off.

The owner observes explicit pairing attempts, saved-pairing outcomes, authenticated Roster readiness, accepted sends, newly observed Bot messages, and allowlisted feature outcomes including Bot creation and import. Cached history and socket open alone cannot count as readiness. The 30-second connection observation deadline leaves Host reconnection running. Foreground sessions renew after 30 minutes in the background. Events contain allowlisted coarse properties and random telemetry IDs, with no chat content, domain IDs, or credentials.

The app stores its sanitized queue and preference in its Documents directory. The queue expires entries after 24 hours and evicts oldest entries above 100 events or 262,144 UTF-16 code units of serialized JSON. The ADR described the latter as a 256 KiB byte budget. Delivery times out after eight seconds and retries with backoff capped at 60 seconds, reusing event UUIDs. Opt-out aborts in-flight work and clears the identity and queue. The lazy `posthog-react-native` 4.81.2 adapter uses memory-only SDK storage, disables automatic collection, and validates the serialized batch before sending it through the first-party proxy. The proxy still handles the transport IP. See the [privacy and qualification runbook](../mobile-statistics.md).

Why: coarse outcomes distinguish pairing, connection, and first-chat failure without giving mobile analytics authority over product state or joining app identity to Host identity.

Enforced by: [mobile-telemetry.test.ts](../../apps/mobile/test/mobile-telemetry.test.ts), [connection-telemetry.test.ts](../../apps/mobile/test/connection-telemetry.test.ts), [bot-operation-telemetry.test.ts](../../apps/mobile/test/bot-operation-telemetry.test.ts), and [posthog-sender.test.ts](../../apps/mobile/test/posthog-sender.test.ts).

## 5. Store synced phone data in one SQLite database per paired Host

<a id="adr-0294"></a>
_Formerly ADR-0294._

The phone opens `deepseekbot-store-<encoded hostId>.db` through `expo-sqlite` in its default Documents database directory. The shared `LocalStore` talks to a `SqlConnection` adapter. Vitest runs the same SQL on `node:sqlite`. The database uses WAL, normal synchronization, foreign keys, hand-written SQL, and OS storage protection. The app does not enable SQLCipher. Unpairing closes and removes the database, with a persistent retry list for failed deletes.

The single connection queues reads and writes. A write uses `BEGIN IMMEDIATE`, commits a change page with its cursor, and rolls back on error. Migrations apply in order, each in a transaction with its `PRAGMA user_version` bump. The app refuses a newer schema with `local-store/newer-schema`.

Version 1 adds `channels`, `messages`, `cursors`, and `gaps`. Messages key by Channel and message ID and page by revision. Version 2 maps conversation keys to Channels. Version 3 adds `list_cursor` and `list_bots`. The FTS migration that ADR-0294 forecast is now version 4. It adds `search_rows` and the trigram FTS5 `message_text` index, backfills existing visible text, and keeps the index synchronized with message changes and deletion. The old short JSON tail was the pre-SQLite design. The Host continues to own the synced facts. The app's Web preview uses a separate adapter and does not run the native database.

Why: transactional cursor advancement prevents a crash from acknowledging rows the phone never stored. The small set of revision, gap, and full-text queries works directly in SQLite.

Enforced by: [local-store.test.ts](../../apps/mobile/test/local-store.test.ts), [conversation-local-store.test.ts](../../apps/mobile/test/conversation-local-store.test.ts), [channel-list-store.test.ts](../../apps/mobile/test/channel-list-store.test.ts), [local-message-search.test.ts](../../apps/mobile/test/local-message-search.test.ts), and [host-store-delete.test.ts](../../apps/mobile/test/host-store-delete.test.ts).

## 6. Keep profile caches, playback, and chat backgrounds on the phone

<a id="adr-0219"></a>
<a id="adr-0228"></a>
_Formerly ADR-0219 and ADR-0228._

Bot profile reads use a TanStack Query cache per authenticated Host client and Bot/DM identity. The owner keeps up to 24 entries and collects inactive queries after ten minutes. The presentation shell can open using cached data and refresh asynchronously, deduplicating simultaneous reads and retaining successful sections on partial failure. Model and permission editors use their own load and save paths.

Conversation playback separates received text, the displayed grapheme cursor, and the canonical committed message. An append can notify the affected bubble without replacing the timeline snapshot. Commitment preserves row identity while queued text drains. Reading history pauses display progression. Returning to the latest edge resumes it, and leaving the foreground discards animation debt without cancelling model work. The device-local Complete bubbles preference hides uncommitted draft bodies and shows each message as it commits. Native timelines and rendering experiments have their own records.

Chat backgrounds resolve a device default and explicit overrides by saved Host ID and Channel ID. The editor keeps a disposable draft. Done persists and reads back a versioned record before publishing, while Cancel discards the draft. An older editor cannot overwrite a changed selection. Unreadable metadata blocks saving and collection until a fresh owner hydrates successfully. The owner keeps the two newest revisions after a successful save and reclaims only managed images with no committed or live draft reference.

Image import accepts valid picker dimensions up to 16 million pixels and 16,384 pixels per edge. It normalizes to JPEG at 0.88 quality and a 2,048-pixel maximum edge. The copied file must be nonempty and no larger than 16 MiB. Preferences retain owned basenames under Documents so they survive container relocation. One background layer applies the resolved image, alignment, and theme-canvas veil outside the scrolling message tree. The picture stays on the phone.

Why: disposable presentation state can respond before network data arrives. Revisioned background records protect the last confirmed choice if a local save fails.

Enforced by: [bot-profile.test.ts](../../apps/mobile/test/bot-profile.test.ts), [conversation-playback.test.ts](../../apps/mobile/test/conversation-playback.test.ts), [chat-background.test.ts](../../apps/mobile/test/chat-background.test.ts), and [native-chat-background.test.ts](../../apps/mobile/test/native-chat-background.test.ts).

## 7. Keep cloud sessions independent of Host pairing

<a id="adr-0229"></a>
<a id="adr-0230"></a>
_Formerly ADR-0229 and ADR-0230._

The phone's `CloudClient` can import public instance JSON from QR or paste. The Human confirms trust, and the Client compares pinned configuration with credential-free discovery at `/.well-known/open-cloud-groups`. Discovery proves consistency with the chosen configuration. Critical replacement requires confirmation and drops the old session. A live ten-minute WorkOS PKCE and state transaction validates the callback. A cold callback cannot restore it. The SecureStore vault holds at most 20 configured instances with independent sessions. Rotated credentials are saved before the signature-verified `/api/me` read establishes current admission. Restored credentials alone give no offline admission. Logout distinguishes confirmed remote revocation from local cleanup.

The cloud service owns default Workspace onboarding and verifies organization membership independently of its instance role. A direct Channel guest grant allows the specified Channel under its history floor and current server authorization. It does not establish organization membership. Pending sends use durable operation IDs scoped to identity, organization or guest access, and Channel. Each paired Host also retains its own client and Activity observer. Browsing another Host or cloud Workspace does not change a saved grant. A source-qualified conversation keeps its own draft and authority, with sends disabled when its Host is offline. Reconnect never submits the draft. Cloud details keep navigation identity scoped to instance, account, organization, guest access, and Channel.

The phone can provision one outstanding channel Agent handoff through the cloud service. SecureStore retains the secret while issuance sends its hash. Copy rechecks authorization and exports this channel credential with the pinned configuration. Clearing the local handoff and revoking the remote grant are separate operations. The phone can also request the fixed channel Agent health check with a persisted operation and five-minute deadline. Retry keeps both values, and local cleanup cannot cancel accepted work.

On a Host, `CloudConnections` stores public metadata and cursor in the Operational Database (generation 100) and secrets in the DSH Credentials Provider under `botharness-core/cloud-<fingerprint>`. It verifies discovery before sending the bearer and verifies remote identity before activation. Removal disables the connection before native credential deletion, and a failed deletion stays retryable. Reimport restores deny-by-default work policy. A Human explicitly binds the channel Agent account through the `botharness/tob` Messaging Provider. Bounded HTTP history preserves remote authorship and typed work provenance. The canonical Source Event commit precedes checkpoint advancement. Outbox operation IDs supply cloud send idempotency, and uncertain responses remain unknown.

The `cloud_work` Tool and `deepseekbot cloud-work` use the same `CloudWork` owner. It derives authority from the canonical Source Event, current binding and Human policy, and rechecks it before execution. The generation-101 ledger claims execution before the fixed health check, reports uncertain execution as `needs-review`, and retries result delivery without repeating the check. Forwarding keeps the original deadline and a fixed one-hop target. The capability accepts no arbitrary command or path. Older Hosts need normal schema recovery to return to a pre-generation-100 backup.

Why: independent credentials keep cloud membership, Host pairing, and local work grants from substituting for one another. Committing to Messaging before advancing the transport cursor makes replay safe across a crash.

Enforced by: [cloud-client.test.ts](../../apps/mobile/test/cloud-client.test.ts), [cloud-workspace-directory.test.ts](../../apps/mobile/test/cloud-workspace-directory.test.ts), [cloud-connections.test.ts](../../packages/core/test/cloud-connections.test.ts), and [cloud-work.test.ts](../../packages/core/test/cloud-work.test.ts).

## 8. Collect Tobs Connect email codes natively when the relay supports them

<a id="adr-0296"></a>
_Formerly ADR-0296._

The relay advertises `emailCode: true` in `/v1/config` when `WORKOS_API_KEY` and the `CONNECT_LIMIT` binding are available. `POST /v1/auth/email-code` requests a WorkOS Magic Auth code without disclosing whether the email is registered. `POST /v1/auth/email-code/verify` exchanges the code and returns `refresh_token` and `user { id, email? }`. The relay rate-limits both by email and by caller IP when available. WorkOS remains the identity authority.

The phone's sign-in sheet takes the six digits in a single native `oneTimeCode` field. It stores and refreshes the returned session through the existing Connect account owner. If the relay also advertises `passwordAuth`, the sheet defaults to password and offers email-code sign-in as an alternative. Apple and Google open the system authentication browser using the existing PKCE path with `AppleOAuth` or `GoogleOAuth`. The browser opens over the existing sign-in sheet, so cancellation returns to the sign-in choices. Hosted AuthKit serves Other sign-in options, browsers required by WorkOS for organization, SSO, or MFA, and installations whose relay lacks both native capabilities.

ADR-0296 was marked Proposed. The relay routes and phone sheet now implement it. To qualify the rollout, use the secret already held locally for the BotHarness WorkOS team, TOB project, and run `node scripts/workos-secret.mjs probe-email-code staging` before deploying. The live relay uses that project's matching Production WorkOS API key and client ID. Removing the key disables the native email-code capability and returns the phone to hosted authentication.

Why: the native field avoids duplicate digits in the hosted iOS code field. The WorkOS client secret stays at the relay, and sign-in remains separate from the Host's Device Pairing grant.

Enforced by: [connect-email-code.test.ts](../../apps/mobile/test/connect-email-code.test.ts) and [email-code.test.ts](../../packages/connect-relay/test/email-code.test.ts).

## 9. Live Activities follow one admitted Human DM request

<a id="adr-0255"></a>

The phone offers explicit tracking after its own Human DM message commits. The paired Host verifies the exact request's canonical admission and the Connect delivery capability before iOS starts a single Live Activity. Only explicit Inbox resolution as done reports completion. Ignored ends with unknown progress; retryable and needs-repair stay nonterminal. Stopping the display leaves the request running.

The Device Gateway derives identity from the admitted credential. The managed Connect Worker holds APNs signing material, fixes the app topic and Apple environment, and binds an opaque delivery handle to the owning account, Host, device and activity. The Host stores the handle and request IDs. The display payload carries bounded status, time, locale and the Host's public display name. A phone without configured Connect delivery cannot start tracking, and Expo push retains its separate path.

The Host persists delivery revisions before I/O, retries within registration expiry, and retires terminal delivery after provider acknowledgement. Stop, revocation and unlink fence further updates. A transient stop failure is reported to the caller and retained as cleanup-only work under the same bounded backoff and registration expiry; new tracking waits until that cleanup is acknowledged, so no server registration is stranded. The phone restores an existing ActivityKit card against its original request and pairing. An explicit source change or loss of that pairing ends the display, and an opaque deep link resolves only through the saved request identity. A new native binary and real iOS/APNs qualification are tracked in [#2815](https://github.com/BotHarness/DeepSeekBot/issues/2815).

Why: ActivityKit can update the Lock Screen while JavaScript is suspended, with request outcomes still owned by the Host and Apple credentials held by the managed sender.

Enforced by: [Host admission and delivery](../../packages/core/test/live-activity.test.ts), [Connect ownership and APNs payload](../../packages/connect-relay/test/activity-apns.test.ts), [native presentation](../../apps/mobile/test/native-live-activity.test.tsx), [pairing and source changes](../../apps/mobile/test/native-live-activity-multiple.test.tsx), [deep-link routing](../../apps/mobile/test/live-activity-routing.test.ts), and [CLI parity](../../packages/core/test/cli-live-activity.test.ts).
