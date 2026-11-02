# Android huge-paragraph drawing evidence

Real Android 16 captures, 1220 × 2712, Chinese locale, fixed replay and accent color. Images are unmodified app screenshots; test avatars/names differ.

- Before: visual-a-12-light, visual-a-10-dark, visual-a-13-light, visual-a-13-dark-clean, visual-a-20-light and visual-a-20-dark cover all three font scales and both themes; baseline main 0f458c7a3d1684e8d071127647aa66c85d3b2898.
- After: visual-b-12-light, visual-b-10-dark, visual-b-13-light/dark, visual-b-20-light/dark; native 9879ff7a2a26aab9f24ecbb005fc205dfddad717, APK SHA-256 BE939E5442C6F8FAD10069877E6AD7F63C19D8F09074EC0EF66E6D3F53928820.
- All matrix images show active uncommitted draft rendering, captured 20 seconds into a 45-second producer pause. Final complete-body checks reopen the committed message; these are not completion-latency measurements.
- gesture-max-hold: existing message actions menu; gesture-edge-down and gesture-latest: visible history movement and return to latest.
- gesture-active-active, gesture-active-active-scroll, gesture-active-active-return: active draft before swipe, moved viewport and returned tail. No scrolling-FPS claim.
- gesture-link: link dispatch reaches the Android external-app consent dialog. External browser opening is untested; no system permission was granted.

See [method and limits](../../../docs/research/2220-android-paragraph-drawing.md) and [per-trial data](../../../docs/research/data/2220-native-paragraph.json).

The first 1.3/dark baseline image was obscured by a system notification and excluded. The clean repeat is published. Small trailing-prefix differences are expected during active playback; captures use the same fixture, producer pause and capture offset.
