# Windows session prompt (Android)

> Paste this whole file into a new session on Vain's **Windows** machine (`D:\code\project\BotHarness`) with the Android phone attached. A second session runs [MAC.md](MAC.md) in parallel on the Mac.

You own: Android build (versionCode 9), Android device tests, Google Play closed-testing release, and phone A in the two-phone test [#2524](https://github.com/BotHarness/DeepSeekBot/issues/2524).

Repo https://github.com/BotHarness/DeepSeekBot , branch `claude/project-thread-ki8aui` has the detail docs in `docs/handoffs/2026-10-22/`. Read `AGENTS.md` and `apps/mobile/AGENTS.md` first. Full steps: [03-android-device-play.md](03-android-device-play.md).

## Order

1. **Start now on current main** (don't wait for the Mac): build a dev or store-test APK from the latest main and run doc 03 step 2 items 1–5 (pairing, sign-in chooser [#2525](https://github.com/BotHarness/DeepSeekBot/pull/2525), DM scroll recordings, M3 pull-to-refresh, push smoke). This finds Android bugs early. Fix small ones in PRs.
2. **Wait for the acceptance SHA.** The Mac session posts `ACCEPTANCE SHA: <sha>` as a comment on https://github.com/BotHarness/DeepSeekBot/issues/2524 . Build **versionCode 9** (store-test AAB) from exactly that SHA. Skip uploading vc8.
3. **Recheck on vc9** only what the gate changed: swipe actions [#2519](https://github.com/BotHarness/DeepSeekBot/issues/2519), retired WebView client [#2546](https://github.com/BotHarness/DeepSeekBot/pull/2546) / encryption [#2547](https://github.com/BotHarness/DeepSeekBot/pull/2547) if merged, host accent [#2518](https://github.com/BotHarness/DeepSeekBot/issues/2518), plus a quick pairing + DM smoke.
4. **Two-phone #2524** with the Mac session (see "Shared" below). Must be on vc9 (store build, to prove store push credentials).
5. **Play release** — doc 03 step 3. Vain uploads the AAB in Play Console (first manual upload), you fill release notes and publish to the existing **closed testing** track. Get Vain's go before publishing. Optionally help Vain set up the Google Group tester list.

Report results on each PR/issue with redacted light/dark screenshots.

## Shared between Mac and Windows

- **One acceptance SHA.** The Mac session clears the merge gate and posts `ACCEPTANCE SHA: <sha>` on https://github.com/BotHarness/DeepSeekBot/issues/2524 . Both final builds (iOS, Android vc9) come from that SHA.
- **Merge order.** https://github.com/BotHarness/DeepSeekBot/pull/2433 → https://github.com/BotHarness/DeepSeekBot/pull/2546 → https://github.com/BotHarness/DeepSeekBot/pull/2547 → Codex's https://github.com/BotHarness/DeepSeekBot/issues/2519 . Only the Mac session merges gate PRs (Vain clicks). The Windows session's own fixes are normal PRs; tell the Mac side so it posts a new SHA.
- **Prod Host + test account.** The Prod Connect Host runs on the Mac. It signs in (in a private browser window) with the throwaway Apple hidden-email account `t4dp…@privaterelay.appleid.com`. Vain has the full address. Both phones pair to it through that account.
- **Two-phone #2524 run.** Vain holds both phones in one sitting. The Mac session leads, and the Windows session drives the Android phone:
  1. Android (phone A) pairs through the account first, then XS Max (phone B).
  2. Within a minute A shows "New device paired". Tap **Remove** on A.
  3. B shows "Your computer refused this app", and Host Settings → Devices shows B revoked.
  4. Each side posts its own redacted screenshots on #2524.
  5. Last, with Vain's go, the Mac side deletes the test account in the iOS app. The Host leaves Connected within about 60 s.
     Full steps: https://github.com/BotHarness/DeepSeekBot/issues/2524#issuecomment-6319649111 and round 4 of [04-final-acceptance-screenshots.md](04-final-acceptance-screenshots.md).
- **Rules for both.** Use the latest DeepSeek model for any Bot or real-LLM test. Redact the status bar, computer names, paths and keyboard suggestions in screenshots. Get Vain's explicit go before anything irreversible: npm tag, store submit or publish, account deletion. Known flakes: https://github.com/BotHarness/DeepSeekBot/issues/2498 (sheet spins after pairing: force-quit and relaunch) and https://github.com/BotHarness/DeepSeekBot/issues/2515 .
