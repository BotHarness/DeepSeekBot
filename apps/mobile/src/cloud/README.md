# TOB mobile connection owner

`client.ts` owns the fixed instance, live PKCE transaction, session rotation and admission readback. `native.ts` is the only native boundary; the UI receives a secret-free snapshot. `native-intent.ts` keeps callback credentials out of routing, including cold launch.

`instance-contract.ts` is a copy with repository-required formatting and comment removal of [TOB packages/contracts/instance.ts at 16f7bfc](https://github.com/BotHarness/tob/blob/16f7bfc/packages/contracts/instance.ts), protocol/format v1. Update both repo validators and compatibility tests together; do not fetch or trust a validator at runtime. TOB owns the public wire format. This deliberate copy avoids introducing an unpublished package dependency during the first slice. Mobile auth/session implementation is independent and does not use the Node CLI.

Run `pnpm vitest run apps/mobile/test/cloud-client.test.ts`. These injected-boundary tests do not qualify native camera, SecureStore or browser handoff. See [the native UAT checklist](../../../../docs/agents/tob-mobile-uat.md).

Organization creation persists its pending name/operation before sending. `useOrganization` preflights membership, rotates for `organization_id`, then reads the selected organization through the service. The server verifies the signed scope and current WorkOS membership. Snapshots expose only verified name/description/version/role; cold restart clears that verification. Settings drafts bind to the selected ID/version; stale owner UI cannot authorize a server write. List pagination uses the server's opaque membership cursor.

Ordinary user onboarding requires TOB `/api/onboarding` and `/api/me` roles `admin | user`. Session checks retry the server-owned default-workspace operation; the native UI never grants instance or organization permissions. A dedicated UAT fixture may declare `instanceRole: "user"` for checkpoint assertions; this test harness remains separate from Hosted AuthKit acceptance.

Channel HTTP operations use the same verified selected workspace and public API. Pending creates/sends are persisted before I/O and bound to user, organization and channel. Response loss or restart retains the same operation key; explicit logout or critical configuration replacement clears it. Channel history is explicitly reloaded in this slice, with pages of 50 messages. It does not yet claim WebSocket, invitations, channel guests or Agent interaction.

Workspace invitations use the same CloudClient: owners send/list/revoke; the recipient inbox and accept action work before organization selection. Issuance is persisted with user/org/email/operation before I/O and survives restart. Public invitation IDs are not login credentials; provider tokens/acceptance URLs are stripped and never stored. Accept reads server membership, then the screen explicitly selects that organization through the existing refresh path. Member status does not grant owner controls. UAT/native evidence is tracked in #2145.

Direct channel guests (#2148) use separate `/api/channel-invitations` and `/api/guest-channels` paths. Acceptance does not refresh into the host organization. Owner channel invitations and guest sends persist channel-bound pending operations; uncertain writes reuse the same key after restart. Channel membership remains server-owned. The guest list cursor is an invitation ID, while ordinary channel lists use channel IDs. An empty first guest history page can advance to its accepted sequence floor. This source implementation still needs actual UAT/native evidence.

## Unified conversation entry (#2179)

Mobile Home combines the selected paired Computer's roster with authorized cloud Channel directories. Directory reads temporarily borrow an organization-scoped token under the existing cloud-session lock and restore the previous scope; they do not select a workspace in the UI. Membership and guest pages retain their existing server checks. Cloud account/config changes invalidate old directory responses. No Host credential becomes a cloud login.

The first slice still uses one active Computer. Two active Computer lifecycles, browser Web and DSH Desktop are #2180. Cloud read/pin authority and server-provided recent-message summaries are #2181; until those summaries are supplied, an unopened cloud row shows “Open to load messages” and does not invent activity timestamps or unread counts. This is not full spec #2178 completion.

Conversation routes carry the source Host ID or cloud account/config scope. A source change refuses an old route instead of sending through the newly active source. Unsent text is client-local and source-namespaced; it is never queued for automatic delivery. Host conversation caches are now Host-namespaced, so old unscoped cache files are not adopted as trusted history. Cloud message cache is account/config/org/channel scoped. A cached view is not proof of delivery or current permission.

Validation: source tests, live API/CLI checks and assigned Simulator UAT are separate gates. No new Host route/tool is introduced; existing Host send/Channel commands and TOB message commands remain the business verification paths.
