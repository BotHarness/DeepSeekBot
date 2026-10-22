# Android Release native launch — PARTIAL

Tested main/batch: `31f313fcdaf0d1758e3dd02285e6ba15a91bf884`, including PR #2579. Android 16 physical phone, arm64, font scale 1.0, 1220×2712 viewport. Expo 58.0.17 / RN 0.88 / splash-screen 58.0.11. Strict fingerprint `1d971f8f1e438ac99cb56339c9300cf53092be9f`.

Fresh Release APK: SHA256 `3B6A93CCA306A6AD854E9476C4D50E95DDD04CECDC8AF743D5605ED94779C848`, 52,736,761 bytes; non-debuggable, arm64 only, development app ID `ai.botharness.deepseekbot.dev`, same signing certificate as the original development app. This is a locally signed Release variant, not a store distribution build. Build passed in 13m25s; a Gradle Metaspace warning is retained in private logs.

PASS sampled: packaged splash drawable/background/theme references; light and dark cold launcher-intent starts display the configured brand portrait without the template grid, then leave splash for the native Chats shell. `am start -W` reports COLD (1674ms light, 1200ms dark); those are Android launch timings, not exact interactive-ready times. Warm task reopening and a later working Host drawer were observed. The artwork itself has cropped edges in its source asset; do not confuse them with new native clipping.

The immutable PNGs and original-speed, silent two-second MP4 excerpts are center crops from actual Release cold-start recordings, not generated-resource previews. Cropping removes system status, home wallpaper and unrelated data; these excerpts demonstrate the portrait/fade, not whole-screen geometry or the later interactive drawer. Light excerpt starts at original t=2.5s; dark at t=2.7s; crop x=280,y=900,w=660,h=1000. Complete recordings remain private.

LIMITS: no source-matched base Release comparison; no physical launcher-icon tap; no deliberate alternate-icon selection, iOS rebuild or Human visual acceptance. A later foreground change to a non-QA app stopped automation; no corresponding new app crash was found. A separate QA-native popup was initially refused by an overly strict local focus guard, then verified against its owning QA activity. The Release app could not connect to the USB cleartext QA Host; it lacks Debug's cleartext permission, so this is not a Release Host connectivity result. Production telemetry was unconfigured throughout.

Original development APK, settings, pairings and reverse mappings restored; own credential/runtime removed; lease released 2026-10-22T10:27:07Z. Evidence publication commit is not a tested runtime input.
