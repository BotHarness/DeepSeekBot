# Team mode M2 runtime boundaries

M2 implements the private Bot, Tob and Activity contract in #4141, on the M1 member Peer and API Gateway boundary. Bot ownership, Channel membership and device grants are application-defined authorities. No DSH-native authentication or transport API is added.

## Ownership

Schema generation 142 adds indexed `persona_bots.owner_human_id`; existing rows and retained JSON bodies migrate to `local-human`. The Registry retains the ownership field on every write. Private visibility is the only M2 policy. `list(humanId)` and `listHistorical(humanId)` filter in SQL before decoding Bot bodies. New Bot creation takes the authenticated Human from the invocation, never from the payload. Member operation keys are namespaced by Human before reaching the existing durable creation service; receipts retain the caller's original key.

The Human bridge wraps the existing method table with the member allowlist and Bot/Channel ownership checks. Wrapper identity is stable and all secondary arguments, including IM reauthorization callbacks, are forwarded. The scoped Registry supplies only the caller's Bots to aggregate projections. Another Human's Bot is refused with `bot-not-found`. The Owner's roster also defaults to owned Bots. Explicit `list({ administration: true })` (CLI `bots list --administration`) supplies the Owner-only settings inventory, with `owner: false` on other Humans' Bots and without their last-activity timestamps. Members cannot request this inventory. The Owner can address another Bot's profile for administration through settings methods, but the returned profile omits private Session IDs; Channel reads, DM sends and Bot attention remain refused. M11 private-content viewing is separate.

Member DM admission uses the owning Bot as its audience. A private Bot's group access also requires its Human's current membership. Client structured mentions and runtime Bot DM/invitation/mention paths check ownership. Contact discovery filters before projection and paging; member Bots do not inherit Owner Host Relationships. The existing Bot Inbox stays keyed by Bot.

## Tob and member management

`tob_identity` has one unique Bot per `human_id`. Sign-in awaits `ensure(human)` before issuing a grant; concurrent requests converge on the durable identity. `tobHome` and member onboarding return that Human's private DM. Member onboarding does not mutate the Owner's tutorial receipt.

A member Tob's CLI broker uses the same scoped bridge, Registry and creation service. It supports private Bot creation/profile management plus bounded reads of that member's Bots, Channels, Activity and Session IDs. Host administration and unimplemented CLI operations refuse with `permission-required`, including global settings, model/provider configuration, plugins, Team/member management, IM apps, devices and data reset. It never obtains an Owner cookie or invokes the Owner CLI runner. CLI authority is rechecked against the speaking Human's canonical Source Event, the current Tob turn and active Team membership. Disabling Team mode prevents new member Bot execution.

## Activity and devices

Activity SQL candidates are filtered before counts, cursors and limits. Action/informational and handled items use Bot ownership; DM unread/reply candidates use the DM Bot's owner. Group replies identify the Human being replied to. Read positions, snoozes, dismissals and informational decisions use the calling Human; member queries do not inherit the Owner's muted-channel preferences. `activitySnapshot` and `followActivity` use the caller's Bot list. Roster removal and purge frames retain the same private DM audience.

Push delivery resolves the canonical Human of each active paired-device grant, computes one Activity snapshot per Human per reconciliation and sends each item/badge only within that audience. Retries recheck the grant. Live Activity prepare/register/status/reconciliation compare the request Source Event's Human to the device grant; a mismatch returns `activity-request-not-found` and an existing registration is retired. M2 tests use Owner and member grant fixtures; member phone admission is M8.

## CLI and UI integration

The existing local `--as <username>` path creates a temporary member grant, dispatches through that Peer and revokes it afterward. M2 supports `bots list|create|show|delete` (aliases of `list`, `create`, `show`, `bot-delete-confirm`) and `activity list`. Deletion retains its existing reviewed token on stdin and explicit `--confirm`/`--erase-memory` contract.

The exact import-free member method catalog is [`member-methods.ts`](../../packages/core/src/team/member-methods.ts). Bot summaries/details add `ownerHumanId` and `owner`. Creation and deletion payloads otherwise retain their existing shapes. Member profiles may use the configured model catalog/presets and edit their own model plan; creation/editing of global presets remains unavailable. Appearance editors must keep the global imported-part library unavailable to members. Member onboarding currently reports the private Tob as ready and its tutorial as skipped.

The logic branch does not change Client/mobile components or localized copy. Client activation, rendered UI evidence, installed Desktop/mobile checks and Human acceptance remain independent integration gates. The integration owner supplies the bilingual release fragment and public CLI documentation copy.

## Performance and verification

The added ownership index bounds Registry materialization to the selected Human. The regression seeds 2,000 unrelated records, verifies they are never decoded, requires `persona_bots_owner` in the query plan and budgets the own-Bot list at two database reads for one Bot. Push reconciliation computes a snapshot once per distinct Human, independently of their device count. Member authorization and Live Activity audience checks use indexed Bot, Channel, Source Event and device keys. Typed-mention checks inspect only the addressed group's members.

No dependency is introduced. Focused tests cover migrations, every Bot method's private-target refusal, Gateway aggregates, real Bot Runtime tools, receipt isolation, Tob authority, Activity/read state, push and Live Activity. Isolated packaged Host/CLI checks and test results are recorded in the task handoff; these do not qualify rendered member UI or physical notification delivery. Timing comparisons must use identical fixtures and frozen builds; no end-to-end performance improvement is claimed from the structure guard.
