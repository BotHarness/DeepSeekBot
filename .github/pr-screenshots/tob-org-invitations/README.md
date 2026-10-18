# Organization invitations — native UAT evidence

Runtime: `acfbc581b805a0a6b47687b7f5c23c2ca363cfcf`; signed compatible iOS development build: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. Shared Simulator, iOS 26, English, 402 × 874 logical pixels. No native-input change. Service runtime `b6b717d044ff4a787de287c31d2029025bbbb7f9`, Worker version `2722f0bc-3ee0-4214-9917-116bcb9497bd`, D1/Org/Channel schema 4/4/1. All operations used UAT. Source CI: [39080432282](https://github.com/BotHarness/DeepSeekBot/actions/runs/39080432282).

## Observed behavior

- Synthetic ordinary A selected its collaboration workspace, invited synthetic B through the phone, and saw Pending/member. B's independent phone session opened its inbox, accepted and selected that same workspace; four channel IDs matched the independent formal CLI.
- B could not see the seven pre-join messages in `mobile-test`. It sent `B accepted on phone and can collaborate` as message 8; both B and owner CLI read exactly one matching message with B's actual author ID.
- The real service rejected B's attempts to create a channel, issue an invitation and edit the organization. The phone offered channel reading/sending but omitted owner invitation and save controls.
- A created a separate invitation to its default workspace and revoked it from the phone. B's CLI could not accept that invitation or select that workspace. No membership was granted.
- B refreshed the phone session, cold-restarted and verified the same selected organization/member role. Three independent phone test sessions (A, B, A) signed out through the UI; the latest saved refresh token was rejected remotely, the local session was absent and every pre-existing active session remained active. A/B independent CLI sessions were preserved.
- Six owner-form size/theme combinations preserved the exact email draft and input focus. Maximum-size Invite remained hittable above the actual keyboard (button bottom ~454, keyboard top ~573; visible keyboard container starts ~557), and a real submit succeeded. Maximum-size revoke was reached by scrolling and operated. Six inbox size/theme captures show reflow; these do not prove screen-reader usability or every list action at every size.

## Captures

`owner-form-light` / `owner-created`: first A invitation.
`member-inbox` → `member-four-channels` → `member-no-prejoin-history` → `member-message-confirmed`: B acceptance and text.
`member-restart-role` / `member-signed-out`: restored member selection and logout.
`form-*` / `inbox-*`: default, intermediate and maximum Dynamic Type × light/dark.
`maximum-revoke-reachable` / `maximum-revoked`: action reachability and revoked result.
Videos retain real steps and waits; reviewer copies are compressed to 402px / 12fps without audio. They use synthetic `example.test` users, no credentials or invitation tokens.

Before the new screen existed, the [base workspace entry](../tob-channel-http/01-workspace-entry.png) exposed cloud channels but no invitation entry. That is a historical entry-point comparison from runtime `7ceab0d27`, not a claim that the invitation screen existed on the base. Current owner/member captures use the same viewport/theme/locale, with role differences explicitly identified.

## First failures and limits

The driver initially waited for “Invitation sent.” instead of actual “Invitation created.”, used an unmatched Message selector, requested in-app Back for a modal that closes by swipe, and checkpointed before refresh finished (`SESSION_BUSY`). The revocation assertion initially expected the wrong public refusal code; actual `INVITATION_NOT_ACCEPTABLE` was independently verified. These harness failures were corrected and checks repeated; no product source changed during the native window. The first message readback failed before text was filled; the later confirmed screenshot/readback is the final proof. Recordings preserve those waits/failures rather than disguising them as a continuous first-pass success.

No actual email delivery to a human mailbox, new Hosted AuthKit login, Android, physical phone, Human QA, screen-reader or non-Latin IME pass is claimed. Existing verified synthetic users were authenticated through the UAT-only harness and still passed normal server verification. Native uncertain-response/restart issuance was not fault-injected; source/workerd tests cover stable operation recovery. Direct channel guests, Agents, WebSocket, identity-event revocation and two-Host communication are later slices. No Prod changes or merge.

After verification, light/large were restored, the app/driver/owned Metro stopped and the revoked phone fixture removed. Existing app data, Keychain, independent CLI fixtures, other device lanes and Hosts were preserved.
