---
Status: Accepted
Date: 2026-10-06
---

# Human Bridge media uses Channel authority and the existing Attachment owner

[#1020](https://github.com/BotHarness/BotHarness/issues/1020) keeps Human media presentation separate from PersonaBot understanding. The first tracer in [#1021](https://github.com/BotHarness/BotHarness/issues/1021) presents Lark native images inside an existing Channel message, while preserving ADR-0107's Source Event and Attachment authorities.

## Trusted content and projection

The application-defined Messaging Provider extends its existing exclusive Consumer with opt-in `source-image-checked` evidence. Lark image and image-bearing native post messages retain the original message ID, authenticated actor/conversation and exact image keys. Post text and image references retain known native order; repeated images share one descriptor and retain each position. Unsupported native mixed elements fail qualification rather than silently dropping content. Platform subscription permissions still decide what can arrive; this change grants no new remote scope.

Messaging validates image capability, resource association, bounded descriptors and content parts before canonical intake. The immutable Source Event remains the sole message-content authority. Realtime and historical Channel projections carry only opaque descriptor IDs, media kinds, display names and ordered text/references. Resource keys stay in trusted Host evidence. Existing placement, sender label and source details remain intact; Inbox-only reception has no Channel media placement.

## Human access

The authenticated DSH API Gateway continues to own the `/api` transport. The existing attachment HTTP route accepts an exact Channel ID, Source Event ID and attachment ID, with no Bot selector. The application-defined Messaging owner resolves current Human Channel access, canonical placement, recorded source reception paths, current routes, identities and grants. The Provider rechecks the original native message and matching resource before acquiring bytes. Model-supplied URLs and resource selectors never become Human media authority.

Ordinary reception stop disables new acquisition through that route. Already acquired bytes remain viewable through a still-valid source authorization. Identity unbind, identity disable, grant revocation, source/placement removal or Channel access loss refuses both new acquisition and cached serving through the affected path. Another independently valid recorded path remains usable; a failed path is never replaced with an unrelated identity. Changes during acquisition or serving cancel/refuse the current operation. A retry may resolve a remaining valid path.

Acquisition reuses the existing Attachment owner and its deterministic provider/fingerprint/conversation/descriptor receipt. Human and existing Bot source-file reads share that identity without adding an Observation, Inbox Admission, model image input or send permission. Completed files reopen after restart. A retained receipt with missing original bytes fails; it does not reacquire and resurrect purged content. Retained content follows the existing Content Purge boundaries; independent downloaded copies cannot be recalled.

## Presentation and bounds

Only visible images request previews. Client and Host each allow at most three concurrent acquisitions, use cancellation and a 25 MiB default bound, and retain no browser resource URL beyond the mounted resource lifetime. The Host serves only sniffed PNG, JPEG, GIF or WebP with `no-store` and `nosniff`; SVG or unrecognized bytes receive an unsupported-preview response. The native DSH Modal supplies enlargement and keyboard/focus behavior. Roster changes invalidate held preview URLs and reload current authorization.

No schema migration, parallel media catalog, remote original editing, autoplay, ASR or extra platform subscription is introduced. Files, audio/video and other providers extend this same presentation contract through subsequent independently validated tracers. Reverting disables future image presentation without deleting canonical Source Events or acquired Attachment files.

## Qualification

The #1023 first video tracer extends this application-defined contract to a checked native Lark `media` parent of an App-mentioned text request. Provider `sourceVideos` opt-in retains the exact video descriptor and optional platform duration in milliseconds; `sourceImages` additionally retains a cover only when the same native parent supplies its image key. Generic file names never establish video kind. Canonical Source Event evidence owns this association; Channel projection exposes opaque video/cover IDs and known duration without resource keys. Intake acquires no media bytes.

Human preparation reuses the existing authenticated attachment route, source authority and bounded acquisition owner. `representation=playback` serves the unchanged original only when byte sniffing identifies MP4; the browser independently verifies decoding. No transcoder, generated poster or model transcript is introduced. The original remains independently downloadable even when its playback format is refused. Covers are acquired only after preparation, through their own exact source descriptor; missing or failed covers do not block video. Browser resources cancel and release URLs on unmount or authority changes. The CLI requests the same representation explicitly. Mobile currently offers the original as a file action and does not automatically load the video cover. Audio and direct native media messages remain subsequent qualification scopes.

The candidate's automated regressions do not establish native intake, rendering, playback or installed-package qualification. Those gates and the required first-slice Human feedback remain tracked in [#1023](https://github.com/BotHarness/DeepSeekBot/issues/1023).

Opening a Bot Inbox source inspector must not bypass the Lark video's explicit acquisition policy. That existing inspector keeps original-download actions for video and cover, but excludes both from its legacy automatic image/video preview loop. Existing qualified WeChat video previews and unrelated Lark images keep their own presentation behavior.

The #1022 Lark parent-file candidate extends the same authority, without a new persistence or Provider contract. Its checked descriptor has an exact parent message association and no MIME or size. Projection and access share one eligibility function, expose a generic file card and retain unknown metadata. Explicit download uses the existing bounded attachment HTTP path. The application-defined `channelMediaTarget` RPC reuses that source access and resolves only the canonical Attachment file target; Client application discovery and opening use the existing DSH-native file capability, never a new launcher. A read-only capability check acquires no bytes, and the menu is mounted only after explicit action. The CLI supplies matching target and download commands. Native file/message/Client qualification remains separate from source tests.

Automated tests verify native association/order, exact placement and access, stop/revoke/restart, cancellation, UI visibility/retry and absence of new Inbox/model activity. These are regression evidence, not real platform acceptance. The PR must separately record fresh native-message bytes and actual matched-theme UI evidence; current blockers remain explicit until Human QA completes. Official resource semantics require the original message ID and its matching image key ([Lark reference](https://github.com/larksuite/cli/blob/main/skills/lark-im/references/lark-im-messages-resources-download.md)).
