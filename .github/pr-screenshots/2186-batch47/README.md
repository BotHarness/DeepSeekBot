# #2186 — same-process native account switching

Batch47, 2026-10-19 JST. Source `da1112c34ac21c6238a62d2a29f843f2d2eb7eeb` (merged #2254); [main CI39169947847 passed](https://github.com/BotHarness/DeepSeekBot/actions/runs/39169947847). Installed iOS build `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; iOS26 Simulator,402×874, default text. Production mobile dependencies and573 recursively resolved runtime snapshots match the installed build; app config/plugins unchanged. This PR adds evidence only, with no product-code, native build, deployment or Prod change.

## What passed

1. Native Sign in → real Hosted AuthKit email/password → existing organization picker → production S256 PKCE callback for synthetic A. No API credential injection, callback substitution or emulator. JWT signature/user/session and UAT `/api/me` matched. A selected its existing organization and saw two channels; opened an existing empty channel without sending.
2. Actual UI Sign out A → Back: old channel state became `NOT_LOGGED_IN`, without A channel rows/content/composer. The exact new A session became inactive and its latest refresh token was rejected; prior active sessions survived.
3. Actual UI Sign in B, using its own password through a fresh ephemeral AuthKit sheet and organization picker. The application PID and an observational JS runtime marker stayed identical from before A logout through B callback, refresh and logout. No app restart, bundle reload or Fast Refresh during that interval. Both accounts authenticated without Human input or auth-policy changes.
4. Verified B identity and complete API organization/guest lists. A's organization ID was absent. Operator-run authenticated API checks reported HTTP 403 for organization access and both old channel endpoints; raw request/response evidence is not included in this committed snapshot. Actual Back, Reload, old native routes and Open retry did not show protected A content. Native `ORGANIZATION_TOKEN_REQUIRED` is a local scope refusal. The screenshots establish that visible refusal, not the reported server-side status; API results here are the runner's recorded assertions, not independently inspectable raw HTTP evidence.
5. B selected its own organization, also named My workspace but a different ID. All seven authorized channel names matched the API list across real scrolling; all A channel IDs were absent. Both users had three API organizations and no guest channels. This is not a full owner/member/guest directory matrix.
6. Actual Refresh session rotated the refresh token while keeping B's user/session and allowed directory. Actual Sign out B revoked only its new session; latest refresh returned `invalid_grant`. The original active session sets for both users were preserved exactly.

## Reproduction path

Use the allocated shared Simulator window with a green source head, compatible installed build, trusted UAT configuration and two existing synthetic users. Freeze each user's prior sessions and all-status memberships. Choose an existing A-only organization and existing channels that B cannot access. Start with a signed-out app; do not replace someone else's active session.

Drive actual native controls. On the Hosted page, enter each user's private email/password through the test driver's stdin; dismiss the keyboard before submitting, and complete the existing organization picker. Never place credentials in argv, logs, clipboard, screenshots or recording. The app itself constructs state/verifier, opens the ephemeral browser and exchanges the returned code. Read the resulting stored session privately, verify it against the expected user and record its exact new session ID immediately. Stop on unexpected challenges instead of changing tenant policy.

Record app PID plus a non-auth JS continuity marker before A logout. Sign out A, inspect Back and drawer state, then sign in B without restarting. Compare the PID/marker; inspect B's directory and old A routes. Check current org-scoped tokens after selecting B's organization, then match the API channel list against rendered names across all necessary scrolling. Refresh through the UI, checkpoint rotated tokens, sign out, and verify each exact new session is inactive while every original active session remains. Restore the original app/files/cache/settings and release the queue.

## Screenshots

These are interaction states from one source, **not a before/fix build comparison**. No product change was necessary. Credentials and authenticated user IDs are not in these images. The Cloud services images contain the existing public UAT service address, not a token or login URL.

| Image | Observed state                                                       |
| ----- | -------------------------------------------------------------------- |
| 01    | A's two authorized channels, light                                   |
| 03    | After A logout, Back refuses old content, light                      |
| 04    | B login then Back refuses the old A route, light                     |
| 05    | B retry on the old A channel remains refused, light                  |
| 06    | B's permitted channel list, light                                    |
| 08    | B's list after scrolling, dark; all7names matched across captures/AX |
| 09    | B's real session after native Refresh, dark                          |
| 10    | First old A channel retry after B selects its own organization, dark |
| 11    | B signed out, local removal and remote revocation reported, dark     |

Image02 caught the native theme-transition dimming and was excluded; image07 was an intermediate scroll capture. Neither is used as final visual proof. The empty AuthKit form was inspected privately to confirm the expected staging domain; credential entry was never recorded. No video was taken.

## Failures retained and evidence limits

- Sandbox access to the existing device daemon failed; the read succeeded outside the sandbox without daemon reset.
- A snapshot during browser dismissal temporarily lacked a valid viewport. Retrying after the transition succeeded.
- Early private vault reads refused while login/refresh was busy; subsequent reads waited for idle. The first organization-picker screen was not mistaken for a completed callback.
- The first B list check saw six of seven rows. Further actual scrolling exposed the seventh and all seven matched. This closes the prior Batch45 inconclusive API-to-AX helper check with fresh, status-aware proof; it does not retroactively make that earlier check pass.
- Full-object membership comparison initially failed because login updated nested user `last_sign_in_at`, `locale` and `updated_at`. Exact membership IDs, user/organization IDs, status and roles stayed unchanged. Provider login metadata is not claimed byte-identical or rolled back.
- Native paths cover default-font iOS26 light/dark states. A's stable directory capture is light only. Intermediate/maximum text, Android, physical iOS, older iOS, VoiceOver/TalkBack and the complete directory paging/error/cancellation matrix remain unrun here.
- The real observed account transition passes; arbitrary delayed-response races remain component-test evidence. Channels opened in A were empty; populated-history isolation is not newly qualified by these screenshots.
- Invitation preservation through new-instance trust/Hosted login, wrong-account/expired invitations, external delivery and physical QR remain open in #2186. Pure account login is not invitation acceptance proof.

## Cleanup and source checks

Only two new browser sessions were created, one per designated synthetic user. Both were revoked and their private token files deleted. Original memberships/roles and active sessions preserved; no invitations, organizations, channels, messages, models, passwords, MFA or authentication-policy mutations. Login metadata changes above remain normal provider audit facts.

Original signed-out vault, pending invitation, Hosts, stopped Documents/Preferences and Cloud message-cache bytes/absence restored; clipboard unchanged; original display settings restored. Own driver and Metro stopped, exact two leased dependency links removed, original nine dependency entries and QA branch/untracked documents restored. Shared lane explicitly released to the coordinator and TOB.

62 focused account/cache/directory/client tests passed. Local typecheck initially lacked new main dependencies; a task-only overlay supplied the pinned cached dependencies without changing shared packages, then typecheck passed. Main CI above passed; this evidence PR has its own CI. No merge authorization inferred from runtime success.

Refs #2186, #2254. Agent-Task: `codex/local/01a14eca-891c-7d30-84fa-8e4dd7b060b3`.
