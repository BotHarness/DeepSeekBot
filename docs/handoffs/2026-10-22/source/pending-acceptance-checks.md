# Pending iOS device checks for the overall acceptance

This queue is paused until all in-flight PRs and Codex issues merge (Vain, 2026-10-21 15:23Z). Then build latest main once and run everything in one pass.

## Setup notes

- Mac runner folder: BotHarness on Vain's Mac.
- Simulators:
  - "QA iOS 27": iPhone 17 Pro, with "My Mac" paired to the QA Host on 127.0.0.1:39155.
  - "QA iOS 27 Fresh": 12C1FFAB-0E6F-42E5-9EAB-79BA298A78ED, for unpaired states.
- XS Max: iOS 18.1.1, dev-signed store Release, device "测试". It needs Vain's taps; iPhone Mirroring control is refused. A tailscale serve port is needed for it, and port 443 is taken by T3 Code, so use 8446.
- The Simulator has no software keyboard and no camera, so keyboard-up and QR scan checks can't run there.
- Android goes to the Windows machine.

## Checks still to run (iOS 27 Simulator unless noted)

- **#2487** header buttons at AX5, after the #2502 fix: Chats and Activity with a filter, light and dark.
- **#2402 / #2512** pairing chooser, on QA iOS 27 Fresh:
  1. Fresh install: the "No computer paired yet" home and the auto-opened chooser. zh light and dark already PASS on f878c43b (claude/main-batch-f878c43b-ios-shots @ 887a87e60); still needed: en.
  2. Account page with native Back and AccountHosts.
  3. The Tailscale page: scanner, pasted link, Pair.
  4. Close the sheet: the empty home's "Pair a computer" button reopens it.
  5. After pairing, the drawer's pair entry shows the same chooser with the guide collapsed.
  - Also: deep-link and pasted-link pairing.
  - Note how guide step 2's "coming soon" wording reads.
  - Shots go in .github/pr-screenshots/2512-pair/.
- **#2510 / #2521**: new DM, short send, then a long send, screen-recorded.
  1. The working row stays below the question.
  2. The screen never goes blank.
  3. The reply scrolls into view above the composer while streaming.
  - Use the loopback Host, not Connect.
- **#2514**: cold-open a 50+ message chat. It should show the latest message with no visible scroll and no top spinner (record it), and scrolling up should still load history.
- **#2516**: pull-to-refresh on Chats and Activity is unchanged.
- **XS Max, #2513** (follow-up to #2466), iOS 18, light and dark:
  - The Back, title chip and computer button islands are opaque, with no message text showing through.
  - The chip's Bot name follows the app appearance (light text when the app is dark, even if the system is light).
  - Nothing changes on iOS 26+.
  - Post the after shots on PR #2513.
- **#2368** auto-reject card: waiting on Vain's message.

## Open bugs found

- #2498: the pairing sheet spins forever after redeem.
- #2515: a DM stayed empty until the Host restarted, and there are no channel logs to diagnose it.

## Done this session (results posted on the PRs)

- #2486, #2490, #2488, #2466: pass.
- #2487: light and dark pass.
- Lock-screen pushes: pass.
- Connect account pairing: pass.
- Shots are on claude/main-batch2-ios-shots.

## Handoff (2026-10-22): device QA moves outside Claude

- Branches with device screenshots (all pushed):
  - claude/main-batch2-ios-shots: main-batch-5c26b5a6/ and main-batch-2b829754/2466/
  - claude/main-batch-f878c43b-ios-shots: 2512-pair/choice-ios-zh-\*
  - claude/connect-account-ios-shots: connect-account/
- No uncommitted WIP in this queue's cloud checkout.
- Remaining steps for whoever takes over:
  1. Build latest main once: an iOS store Release for the Simulator, plus a dev-signed Release for the XS Max.
  2. Run the checks listed above in one pass and post the shots on each PR.
  3. Run Android checks on the Windows machine.
  4. Fix or triage #2498 and #2515.
- Mac state: QA iOS 27 has "My Mac" paired to the QA Host on 127.0.0.1:39155, running f878c43b. "QA iOS 27 Fresh" is shut down. The XS Max is paired as "测试". No tailscale serve is open from this queue. queue.md on the Mac logs all of this.
