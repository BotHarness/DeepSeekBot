# Batch46: retained Computer search

Runtime source and batch: `990fed93ebf693b6de4e4bb4d38336508b02179c`.
[Exact-source CI passed](https://github.com/BotHarness/DeepSeekBot/actions/runs/39168992325).
Evidence-only commit follows this source; no runtime code changed during the lane.
Shared-queue iOS 26 Simulator, 402 × 874 points, installed native build `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. JavaScript loaded through the sole assigned Metro; no rebuild/install. English app UI, existing synthetic UAT Computer fixture, no production activity.

## Observed passes

- Actual chat UI downloaded the existing, already-read seven-message fixture. Search inherited Computer scope and found its conversation name and message text. Results grouped by conversation/message; Search hid the creation button.
- Actual result press opened and highlighted the exact retained message. Back retained query; a second result round-trip retained the actual scroll position (337.33 points), checked by visible rows and controller readback. New Search entry reset the query.
- Only this new pairing's route was changed to an unused loopback port, then the app was restarted. Connection became unreachable; retained search and exact highlight still worked. The shared Host stayed running.
- After backing up and deleting exactly one cache file belonging to this new pairing and fixture, pressing its stale result showed “This message is no longer on this device.” It did not silently jump to latest. Original route restoration plus app restart, followed by actual “Load from Computer”, recovered the original highlighted message through the real Host.
- Revoking only this test device produced refused status and zero visible search results without restarting. Original device statuses and channels were preserved.
- The fixture history and read cursor were identical before and after. No messages, channels, Bots or model runs were created.
- Default light/dark Search and native glass navigation captured. At maximum system text size Chats → Search remained actionable and reset the query; the screenshot records the layout limitation below.

`search-result-back.mp4` is the original unedited 62.82-second recording of search → exact highlight → Back. It includes idle time and the existing system keyboard's missing Chinese glyphs. Screenshot and sampled recording frames were reviewed for credentials/private content; all visible conversation content is the pre-existing synthetic UAT fixture. No authentication occurred.

## Evidence limits and retained failures

- Maximum text labels wrap within words in the native bottom navigation; this is not polished maximum-font acceptance. VoiceOver, actual Reduce Transparency, Android, physical phone and Human acceptance remain untested.
- Native scope verification covered one Computer. All selection was attempted but the accessibility selector matched the containing scroll area, so it was not qualified. Multi-Computer identity races and Cloud-only unsupported coverage are source-test evidence, not native passes.
- The app originally displayed missing Chinese font glyphs. App-specific English was selected for readable evidence; original preferences were restored. The system keyboard still showed missing glyphs. Initial unsupported keyboard-dismiss and ineffective scroll attempts remain private failures; subsequent actual Enter and fractional scrolling were used.
- Offline-to-online recovery used an app restart and a test-driver open of the observed retained route before pressing Load. This does not prove seamless warm network recovery. Offline headers may show raw channel/Bot identifiers when their roster is unavailable.
- The temporary RPC observer captured method names only, not all transport traffic; absence of recorded RPC calls is not a blanket network claim. Offline success and focused controller tests independently establish the retained path.
- The initial sandboxed device call could not reach its daemon. The same assigned session worked outside the sandbox; no shared daemon was reset.
- A fresh matched base run was not authorized in this lane. The PR labels the historical pre-Search navigation image at source `06b8fadedf6b66379ee39ed01751f562e10b6714`; it is not a same-base/same-state comparison.

## Restoration

Original cloud vault and saved Hosts were restored and read back. Stopped Documents and Preferences matched backup hashes; both message-cache folders matched original bytes/absence. Appearance and text size restored to light/large; app-specific locale restored with Preferences. Only the new test device was revoked, only the assigned driver and Metro stopped. Two explicitly leased dependency symlinks were removed after exact-target checks; all nine original dependency entries remained. The shared checkout returned to its original branch/commit and three pre-existing untracked documents. Host and other driver sessions were untouched. The coordinator received explicit release before the next lane. No WorkOS, Cloud resources, Prod, phone, build or merge.
