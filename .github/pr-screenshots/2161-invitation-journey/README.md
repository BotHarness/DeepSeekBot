# Invitation journey UAT evidence

Batch21, 2026-10-18. Runtime `1a2c1c385fd842958a078da05bb85c841d69934e`; baseline `9a2b651844d8686a0381cbd2d991da6d5199e924`; UAT service `f10437bfbe46c4cbcbfb71bc6b599e9551669051`, schemas 5/4/5. Installed native inputs `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b` match; no rebuild. [Runtime CI](https://github.com/BotHarness/DeepSeekBot/actions/runs/39102187486) passed all applicable checks.

## Proven

- A real iOS deep link reaches recipient-only preview. Preview does not accept. The pending target survives a cold restart.
- Explicit Join lands in the exact guest channel without requiring a paired computer or membership in its organization. A real native message committed once and was independently read through UAT CLI.
- Reopening the accepted invitation after cold restart restores identity and the same channel/message. The CLI verifies no organization membership and sibling-channel denial.
- Revoking only the test invitation causes old-session reads to fail and removes the channel from the guest listing.
- Refresh rotates the independent synthetic phone session; logout removes local tokens, revokes its remote session, rejects its latest refresh token and preserves other sessions. Trusted public configuration remains.
- Default/max text and light/dark preview controls are reachable. Original large/light settings restored; own driver/Metro stopped and private revoked fixture removed. Other devices/Hosts/Prod untouched.

## Evidence identities and first failures

`before-*` captures use the baseline. `after-preview-*` captures use `8dd710bdf946ee3771fcbf445832f44d09aaaa1f`; its preview UI is unchanged in the final runtime, but the later channel-entry fix is not attributed to those captures. `final-*` captures and the 20-second `final-join-channel.mp4` use the final runtime. The contact sheet samples the real recording; it is not a substitute for the recording.

First preview displayed a misleading sign-in-required fallback after restart; the account label now shows the verified invitation recipient or an unverified saved-session status. First acceptance committed correctly, but a missing in-memory identity hid the loaded channel. A cold-restart client test failed before the fix and passes after it; opening a channel now restores identity through the existing service checks. Both first-failure screenshots are retained. The final recording includes the brief loading transition before channel identity resolves.

All visible accounts are dedicated synthetic UAT fixtures. Invitation URLs are recipient-bound locators, not bearer credentials; test grants were revoked after capture. No password, OTP, API key or access/refresh token is published.

## Not proven here

Sender native copy/share, new-instance trust and Hosted AuthKit browser return carrying an invitation, physical camera scanning, Android, and Human visual acceptance remain separate. This synthetic session test does not prove interactive Hosted AuthKit login. QR rendering/save and the combined workspace drawer are not implemented by this slice. New PRs remain Draft and unmerged.
