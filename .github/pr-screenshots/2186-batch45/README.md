# Account replacement isolation — Batch45

- PR #2254 / issue #2186. Candidate source `36d7a8f4b920605e3e4737f6f72fce93f6d9a182`; CI [39167884851](https://github.com/BotHarness/DeepSeekBot/actions/runs/39167884851) passed.
- Main baseline `1270c97cb8a9ba78350d6fa6d65531a9f19d8f71`; CI [39167345724](https://github.com/BotHarness/DeepSeekBot/actions/runs/39167345724) passed.
- Shared iOS 26 Simulator, 402×874, default text, English; installed native build `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. JS-only candidate, no build or deployment.
- Synthetic UAT identities, existing trusted configuration, no organization/channel/invitation/membership/message writes. No Prod, physical device, Android or VoiceOver execution.

## Observed path

1. A's verified real credential was installed by the committed UAT fixture driver, followed by an App restart. Actual Check session, Reload workspaces and organization selection showed the two existing `N2 UAT Cloud…` channels (01 light, 02 dark). One channel opened; its history was empty.
2. Actual UI Sign out revoked only A's test session. Back to the previously open channel showed NOT_LOGGED_IN with no old channel name, messages or composer (03). Cloud drawer retained only the signed-out service, with no organization rows (04).
3. B used its own verified real credential and App restart, then actual Check session and Reload workspaces. Its directory (05) matched B's original server organization IDs; A's organization ID was absent. Both accounts legitimately own different organizations named `My workspace`; names alone are not identity evidence.
4. Both old A channel native links were refused. Open channel / Reload channels retries and Back/reentry did not expose A content or composer (07 light, 08 dark). The UI refusal was ORGANIZATION_TOKEN_REQUIRED; independent B `/api/me` succeeded while A's organization/access and both channels returned 403. The generic retry buttons remain visible and are refused.
5. Selecting B's own `My workspace` displayed its different channel list (09). B's current user and selected organization IDs were independently read from the running App and matched B's allowed directory. A's two channel names were absent.
6. Actual UI Sign out B succeeded. Each task-owned session was inactive, its latest checkpointed refresh token returned invalid_grant, and all preexisting active session IDs remained active.

## Evidence limits and preserved failures

- These screenshots are **candidate interaction states**, not matched base/fixed-build comparisons. Credential injection plus restart proves persisted account replacement and real UI logout; it does not prove warm same-process native login or Hosted AuthKit/PKCE.
- The organization page bug was reproduced by three real-component tests on main: direct A→B, logout→B and delayed A response. They pass with the keyed component fix. Same-account revalidation and real channel account/cache regressions pass separately (62 focused tests total).
- A matched native screenshot of the warm replacement bug is unavailable in this allocated path because the fixture driver intentionally requires restart. Reproduce that gap with a supported interactive login while the prior organization route stays mounted; do not substitute a fabricated callback or render for it.
- An additional standalone B channel API-to-AX comparison helper returned B_CHANNELS_UNCONFIRMED without recording failure phase/status; this extra assertion is **not passed**. The independent B identity/organization-ID/directory checks, denied old targets and actual UI list observations remain separate evidence. No extra sessions were created to retry it.
- Light captures 06/10 caught the system theme transition dimming; retained privately and omitted from published visual evidence. Stable dark B directory/list screenshots are published. This is not a complete matched theme/font/platform matrix.
- No populated-message-history leak, instantaneous push revocation, zero-frame flash, external login delivery or screen-reader claim.

## Restoration

Both fresh native sessions were revoked through actual UI logout; exact sid inactivity, rotated-refresh rejection and preexisting-session preservation were verified. Revoked token files were removed. Original signed-out vault, pending join, saved Computers, stopped-app Documents/Preferences/message-cache bytes and absence, locale/text/theme and clipboard were restored. Only a proven run-created cache file for the frozen channel was removed. Own driver and Metro stopped; original shared QA branch and preexisting documents restored. Batch45 explicitly released before publication.

Earlier auth-only preflight used two separate sessions, also revoked and deleted before this native phase. No other accounts or sessions were logged out. Private credentials, identifiers and inventories are not included in this directory. #2186 remains open for outstanding acceptance.
