# Workspace drawer UAT evidence — Batch 22

Draft PR #2170; issue #2161. Runtime `bfb5cc4ec9b5b3029bebd7d544905efa6d2dcd4b`, baseline `d2529feb520ace2d773db6ac0966dc265887bdc5`. Installed native binary `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; its native inputs match. TOB UAT `bf6d896e813457382cd2bb2e7c74b22c03ba01ca`. This commit adds evidence and docs only. Source CI [39104178457](https://github.com/BotHarness/DeepSeekBot/actions/runs/39104178457) passed at the runtime head.

## Observed behavior

- Before: an unpaired user enters the separate Cloud services screen, verifies the saved session, then opens Cloud workspaces. `before-verified-cloud-services.png` captures this prior entry point, not a predecessor drawer with cloud rows.
- After: the cloud header opens the same root Workspaces drawer. The synthetic B account sees its own organization, two member organizations, and a channel-only guest organization. Selecting the member organization lists four channels; selecting the guest organization lists only its invited channel. Organization names may match, but role and instance remain distinct.
- `scope-accepted.json` and `scope-revoked.json` use the actual native session for independent public HTTP readback: no guest-organization membership, sibling denied, filtered directory limited to the granted organization, and revoked grant removed. These checks supplement the UI; they are not screenshots masquerading as API proof.
- An unsent draft survives a real Refresh session action and token rotation. Cold launch restores the directory. The directory itself does not claim verified live identity; Check session separately re-establishes it.
- Revoking only the test grant and reopening removes the guest organization. B sign-out leaves only a sign-in entry; a separately prepared A session after restart shows Owner instead of B's Member/Guest roles. This verifies logout and account change across restart, not an in-place browser account replacement.
- Both native sessions were signed out through the UI. The latest refresh tokens were rejected, baseline sessions retained, and local credentials removed. The temporary fixture files were deleted only after this verification.
- Three Dynamic Type sizes (large, extra-extra-extra-large, accessibility-extra-extra-extra-large) × light/dark: labels wrap, the list scrolls, Create workspace and Cloud services remain reachable. The maximum-size Cloud services action was actually pressed. `workspace-switch.mp4` is a 26-second member→guest navigation recording; the contact sheet was inspected before publication.

## Preserved failures and limits

Initial Metro bound only IPv6 while the launch URL used IPv4; restarting this task's Metro with IPv4-first DNS resolved it. One generic scroll-top command misread the nested scroll surface despite already being at the top; `first-matrix-scroll-failure.png` preserves the scene, and targeted swipes completed the matrix. A cold checkpoint was requested before live identity verification and correctly refused; Check session then passed. An old temporary logout wrapper referenced a removed worktree; the current source wrapper verified logout successfully. No product source fix was needed in this run.

No computer was paired in this Simulator, so computer selection/return was not exercised and no new pairing was introduced. Pagination, error/retry and exact cancelled-request ordering retain source-test evidence only. Android, physical camera, Human/VoiceOver acceptance, new-instance Hosted AuthKit continuation, sender sharing and QR rendering/save remain open. Synthetic API-prepared sessions do not count as a Hosted AuthKit login.

The original large/light settings were restored, only the task's grant/sessions were cleaned up, and its app/driver/Metro were stopped. Existing shared documents, installed app and trusted config, other sessions, physical phone, Hosts and signed Products were preserved. No native build/install/erase, production change or merge.
