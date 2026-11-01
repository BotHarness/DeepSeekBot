# Android latest-first chat evidence

Physical POCO Android 16; Chinese, dark, system font scale 1.3; same AX3257 Stable history, 121 canonical messages and a 50-message cache. Real arm64 Release builds, no diagnostic instrumentation.

- Before: stack parent 6d98637120b5, runtime d06ab1e1d, APK SHA256 4A9F6BAFE96D59F048342A9DD0334F9689095B45DE6BE8925B838936439835ED.
- After: runtime bdbdfed6b, APK SHA256 1FE163037D893A810C731F2C72709673860C51F87B351B53FB303D1409A3472C.
- These first-open frames are the first available original-video frames at or after 650ms from touch release: before 684.100ms, after 743.788ms. They illustrate loading versus visible messages, not an exact equal-time comparison or standalone benchmark. Status-bar crop and proportional resize only.
- Balanced A/B/B/A, six opens per version on the preceding f65275223 runtime: median 785.245ms to 357.25ms, 54.5% elapsed reduction, 2.20x. This measures cached chat touch release to latest message visible, not uncached fetch, cold launch or FPS. Individual frame uncertainty is retained locally. The subsequent bdbdfed6b markdown-context wiring fix has a separate three-open smoke check: 582.08, 391.10, 332.28ms (median391.10ms); it is not pooled with the balanced benchmark and has no new speedup-ratio claim.
- Final runtime: actual 24-section, 72-block markdown response; scroll from sections23-24 to8-10 and return to23-24 passes with complete visible paragraphs. A page-level regression first reproduced the missing inverted context, then passed after connecting it.
- Prior runtime f652: native send button, keyboard/compose gesture, first-drag anchor, bottom-follow and interruption of visible playback verified. Canonical reply completion preceded the playback interruption; ongoing network-output interruption is not claimed. Source tests also cover inverted follow/held/keyboard behavior.
- Native 120FPS, full font/theme matrix, uncached cold-load comparison, ongoing-network interruption and Human QA remain pending. TalkBack-specific work deferred by the user. Expo Web cannot exercise the Android-only inverted native list/keyboard behavior; these are native captures, not a Web preview.
