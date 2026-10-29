# Final native verification: #3175 and merged #3178

2026-10-29. iPhone 18 Pro Max Simulator, iOS 27; 1320 × 2868 PNGs, original aspect ratio. Chinese UI. Source `7e0dbe1def2e8965bf06cb91cada3792ece85bd0`, integrated main `71ff1b41b99373bdfa40cd53c44329140daec65a`.

Fresh Release native build with Expo 58.0.21 / React Native 0.88.1; production bundled Hermes JS, no Metro. Simulator signing enabled with the existing development team. An initial unsigned build could not access Keychain (-34018); rebuilding with simulator signing restored the existing pairings without replacing or deleting them. This was build-harness failure, not a product data migration.

## Results

- PASS: Settings default-size large title collapses on native scrolling and expands when returning to top; light/dark captures.
- PASS: market header Search opens the real keyboard; typing keeps discovery; keyboard submission filters Obsidian.
- PASS: result details / Back preserves query and result; Close restores discovery; reopen is empty.
- PASS: default-size light/dark search screenshots and maximum accessibility text result / reachable Close. Maximum size uses vertical sort choices.
- Initial RN 0.88.0 run also covered intermediate/max Settings and market layouts; see ../m3175/README.md. The complete intermediate/max Settings matrix was not rerun successfully on RN 0.88.1: a native automation pan hit Usage, so those invalid captures remain private and are excluded here.
- UNTESTED: physical iPhone, Android native, VoiceOver, FPS/performance measurements, and instrumented same-query network refresh. No phone update.

Settings displays a Host-offline usage error because all existing Hosts are offline; no new Host, pairing or LAN access was used. Screenshots reviewed for private data. Driver stopped clean; Simulator shut down; original light appearance and large text size restored. Original captures and driver logs retained locally.

## Artifact SHA-256

- DeepSeekBotDev: `d61f4a3def50e1aa07ac5460b001d8b287c004231dc1759a1f3856e43cf58f54`
- main.jsbundle: `479cd0b8753209d0e0238e52de2632d37a6a5d4430231d3f88ab5d8e09995060`
