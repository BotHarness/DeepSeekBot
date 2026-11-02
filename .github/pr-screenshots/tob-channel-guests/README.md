# Direct channel guests — native UAT evidence

Final mobile runtime: `bc08a47e6f060fe6caa6b879c4b2464e12d69e05`; compatible signed native binary: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. Shared iOS 26 Simulator, English, 402 × 874 logical pixels. Service `6226ec3af48d7c446c95421290aaa280ce8a7490`, Worker version `b8e22111-d975-4ad6-81b9-6d56e32fb84c`, D1/Org/Channel schema **5/4/2**. UAT only; no native rebuild, Prod changes or merge.

## Observed behavior

- Ordinary owner A issued a direct invitation to synthetic B from the phone. B accepted from its own phone inbox and opened Guest channels. Its organization selection was unchanged; no WorkOS membership was created in A's workspace. Sibling channels and the pre-join message were inaccessible.
- B sent `B joins only this channel from phone`; independent owner CLI read the exact author/text at sequence 2. Owner CLI revoked access; a replacement invitation was accepted through B's CLI to set up rejoin testing. The same phone session could read only after the new floor (2). A deliberate new phone send committed at sequence 3; owner CLI saw both sends and B saw only sequence 3. These are distinct operations across two grants, not duplicate delivery.
- B refreshed, cold-restarted, checked its saved session and opened the same guest channel with sequence 3. Owner CLI then revoked the active grant. Reload on the old phone session visibly returned `CHANNEL_ACCESS_DENIED`; independent B CLI was denied and its guest list omitted the channel. Already rendered, previously authorized text can remain on screen; the error proves the subsequent request was refused.
- A separate replacement grant was prepared via CLI. A's phone reached and used **Revoke channel access** at maximum text size. The row became Revoked; B's independent CLI again lost access. This proves the owner UI action separately from the earlier CLI-triggered revocation.
- Independent A/B phone sessions signed out through the UI. Each latest refresh token was rejected, its WorkOS session revoked and its local session removed; all pre-existing active sessions, including A/B CLI, remained intact.
- Six owner-invitation form and six guest-composer size/theme combinations retained exact draft and focus. The final maximum guest Send bottom was about 525px, above the predictive keyboard top at 529px; an actual send succeeded. Maximum owner revoke was reached through scrolling and operated.

## Capture provenance

| Files                                          | Runtime / meaning                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `02-*`, `03-*`, `form-*`, `owner-invite.mp4`   | `77cd444bffda36846838093ce6a25e17e7b7a951`: final channel-specific title/name and actual owner issuance; later changes affect accepted labels/composer spacing.                                                                                      |
| `04-*`, `05-*`, `06-*`, `recipient-accept.mp4` | `6f4d99fe3f2280584f26debefc26b53febc3a1c6`: real recipient acceptance and initial send. Video also includes the first failing composer matrix, not a final keyboard pass.                                                                            |
| `message-*`, `10-*`–`13-*`, remaining videos   | `bc08a47e6f060fe6caa6b879c4b2464e12d69e05`: corrected keyboard geometry, committed post-rejoin send, restart, old-phone refusal and owner revoke. Owner-revoke video ends during the request; `13-*` plus independent CLI readback prove completion. |
| `before-clipped-maximum-dark.png`              | Earlier failing empty-history maximum-text composer; compare final `message-maximum-dark.png` at the same viewport/theme.                                                                                                                            |

Videos are compressed to 402px / 12fps without audio. Captures contain only synthetic example.test users and test content; no credentials or invitation tokens. The [prior workspace entry](../tob-org-invitations/member-inbox.png) is a historical organization-only comparison, not a guest feature test.

## First failures and limits

The first form used a workspace title; corrected before issuance. The first empty-history maximum-text composer clipped input beneath the fixed header. A first spacing fix exposed the input but left Send below the prediction bar (bottom549 vs529); the final compact guest action and margin passed the full six-case matrix. An earlier large upward gesture dismissed the modal, so that recording/screenshot is not used as revocation proof. A premature generic wait missed a pending request; final completion uses the actual changed control plus canonical readback. These failures are retained in the task's local evidence, not presented as first-pass success.

32 focused client/driver/style tests passed; service 41 workerd and 25 Node/CLI checks passed. Source/workerd cover idempotent retry and authorization failure paths. Native uncertain-response injection was not run. Synthetic sessions use the authorized UAT harness with normal server verification; this run does not repeat Hosted AuthKit login or test actual email delivery/new signup. Android, physical phone, Human QA, screen readers and non-Latin IME remain unqualified. Agents, WebSocket, identity-event revocation and two-Host communication are subsequent slices.

After verification, large/light were restored; own app, driver and Metro stopped; revoked phone fixture removed. Existing app data, Keychain, independent CLI fixtures, other device lanes, native Products/rollback and all Hosts were preserved.
