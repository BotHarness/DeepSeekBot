# #2186 — native directory roles and injected-error recovery

Batch48, 2026-10-19 JST. Product source `adcdcf98dfaaea31458f522f931e3380dd8bd69d`; [main CI39171963917 passed](https://github.com/BotHarness/DeepSeekBot/actions/runs/39171963917). Installed native `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`, iOS26 Simulator,402×874/default text. Batch47's matching production declarations,573 resolved runtime snapshots and app configuration remain applicable; the subsequent mobile delta is an Android-only markdown break-strategy prop. No native build, deployment or product-code change.

## Observed paths

API statuses, role/list comparisons and cleanup assertions below are operator-run checks recorded privately; raw authenticated request/response evidence and the verification driver are not included in this snapshot. Screenshots establish the visible native states only, not independently inspectable server authorization or session-revocation proof.

- **Owner and member:** existing synthetic A had one owner and two active member organizations. The compact drawer's accessibility labels matched the canonical roles. Selecting its owner workspace showed both existing channels and the empty Create channel form. Selecting an existing member workspace showed all six allowed channels across actual scrolling, without the owner-only Create form. No channel was created or opened for messages; no member role was changed. Owner/member roles are in accessibility labels, not claimed as visible row text.
- **Channel-only guest:** existing synthetic B had three owner organizations and no original guest grants. One new invitation to B's synthetic email was created and accepted through the production API as fixture setup. B's native drawer showed its own three organizations plus a separate `Guest · invited channels only` row for A's organization. Selecting that row showed exactly one invited channel, with no sibling or Create form. Canonical reads independently confirmed target200, sibling403, organization403 and no added organization membership. A's and B's different own organizations are both named My workspace; IDs were distinguished privately.
- **Channel error/recovery:** a temporary wrapper around this app's `cloudClient.rt.request` threw `TypeError` only for exact allowlisted UAT GET paths. Actual Reload showed `NETWORK_UNAVAILABLE` and retained the two authorized channel rows. After restoring the original request function, actual Reload succeeded and removed the error with the same rows.
- **Drawer error/recovery:** the same bounded wrapper made the real drawer request fail. The drawer displayed the error and Retry. The original transport was restored before tapping Retry; live requests restored A's three role rows. Two GETs were rejected in total across both cases. No success response, identity, authorization result or callback was fabricated.

**Fault injection qualifies native error rendering and Retry under a controlled rejection. It is not proof of a real network outage, timeout,401/403 handling, pagination or arbitrary cancelled-response ordering.** The original request function was restored after each case and no wrapper remained at cleanup. Actual UAT permissions were checked independently.

## Setup and cleanup

Two new independent synthetic sessions were authenticated, verified against JWT signature, `/api/me` and trusted UAT configuration, saved privately, then installed with the existing test driver and app restart. This is fixture setup, **not Hosted AuthKit or warm-login evidence**; Batch47 covers its separate observed browser path. A's server session stayed available while B was installed so cleanup needed no third session. The invitation was API setup, not a repeat of invitation UI acceptance.

The exact new guest invitation/grant was revoked while B remained authenticated. Target access returned403, the guest directory returned to its empty baseline, original invitation list and channel metadata remained unchanged. A revoked audit record remains; no original grant was removed. Both exact new sessions were revoked, latest refresh tokens returned `invalid_grant`, and each original active-session set was preserved exactly. All-status membership IDs/user IDs/organization IDs/status/roles matched the baseline. Normal provider `last_sign_in_at` and `updated_at` changed during login; byte-identical user metadata is not claimed.

Original signed-out vault, pending join, paired Hosts, clipboard, stopped Documents/Preferences and cloud-message-cache bytes/absence, theme and text size were restored. Own driver/Metro stopped; exact two leased dependency links removed; original nine dependency entries and QA branch/untracked documents restored. Revoked token files removed; lane explicitly released to the coordinator and TOB. No Host, Prod, external recipient, message, organization, channel, password/MFA/auth-policy or preexisting membership changes.

## Screenshots

All eleven PNGs were visually inspected. Public UAT service addresses and synthetic fixture names are shown; no credentials, tokens or authenticated user IDs. These are interaction states from one product source, not a before/fix build comparison. No video was recorded.

| Image                                      | State                                                              |
| ------------------------------------------ | ------------------------------------------------------------------ |
| [01](01-owner-member-directory-light.png)  | Owner/member compact directory, light; roles confirmed by AX/API   |
| [02](02-owner-channels-light.png)          | Owner's two channels and Create form, light                        |
| [03](03-owner-channel-injected-error.png)  | Injected channel-read failure retaining authorized rows, light     |
| [04](04-owner-channel-recovered.png)       | Actual live Reload recovered after original transport restoration  |
| [05](05-member-list-light.png)             | Member list top, without Create form, light                        |
| [06](06-member-bottom-dark.png)            | Member list bottom, dark; all six names matched across captures/AX |
| [07](07-directory-injected-error-dark.png) | Injected drawer-read failure and Retry, dark                       |
| [08](08-owner-member-recovered-dark.png)   | Live Retry restored owner/member rows, dark                        |
| [09](09-guest-directory-dark.png)          | B's own organizations plus separate guest workspace, dark          |
| [10](10-guest-only-channel-dark.png)       | Guest sees only the invited channel, dark                          |
| [11](11-guest-only-channel-light.png)      | Same guest-only channel, light                                     |

## First failures and limits

Preparation initially referenced an obsolete fixture name and stopped; fresh readback selected the exact already recorded channel ID. A wrong relative QA path and then a wrong Expo project working directory stopped before usable Metro; correcting the working directories required no installation. Driver `--device` rejected a UDID; supported `--udid` succeeded. A private checkpoint refused while the client was busy; idle checkpoint succeeded. The label helper missed an inherited owner-row label; the fresh observed accessibility reference was used. Simulator AX reported a lingering system surface; its documented XCTest fallback read the actual app.

The generic provider revocation helper failed for A; application `/api/auth/logout` returned200 for A's exact owned session, followed by inactive-session, refresh-rejection and prior-session checks. No broad account logout or extra authentication was used. An earlier local `pnpm` test invocation unexpectedly attempted dependency installation and failed DNS; it was stopped without an install retry. Shared dependency metadata/inventory were inspected. Direct existing Vitest execution passed21 focused directory/account/cache tests; this is separate from native proof and this evidence PR's CI.

Remaining #2186 gates stay open: complete directory pagination/empty/401/timeout/cancellation and other revocation cases, intermediate/maximum fonts, Android/physical/older iOS, generic headers/secondary actions, physical QR/external delivery and invitation-specific trust/browser/wrong-account/expiry paths. VoiceOver/TalkBack remains deferred. This default-font role/retry slice does not close the whole compound directory matrix.

Refs #2186. Agent-Task: `codex/local/01a14eca-891c-7d30-84fa-8e4dd7b060b3`.
