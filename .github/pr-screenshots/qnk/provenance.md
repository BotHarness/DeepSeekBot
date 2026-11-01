# Android encrypted startup evidence

Physical POCO, Android 16, Chinese/dark, font scale 1.3, fixed five-row list and preserved app data. Cold process launches, not clean installs. Source and app data were unchanged during each block. Dedicated Host used the original implementation. Blocks A/B/B/A/A/B, three launches per block; all 18 target-row XML checks passed. Battery 100%, recorded temperature 29.2–31.0 C. No builds or video analysis ran during these six blocks.

Before: production runtime feb6a32cc064d7cd0342cac8c80c3d1b1165e372, APK SHA256 82E3A81D7A2A66071DBD560A4B218EC2BE6D2A229348B07C8D99F2151F40F375. Parent24c4d2914 merged remote main6fad28c6; mobile and Noise runtime sources matched that baseline before this change.
After: d06ab1e1d, APK SHA256 4A9F6BAFE96D59F048342A9DD0334F9689095B45DE6BE8925B838936439835ED. Signed installed APK hash verified. Android packager source map selects noise-key-agreement.android.ts and StableLib2.0.1; no AX3257_STARTUP diagnostics. Later commits add documentation/evidence only.

Endpoint: first near-full splash frame (no bright launcher edges), to the first frame crossing the same Stable-row text pixel threshold. This excludes earlier launch animation/process time. Fading text can already be visible in the preceding frame; this is an operational visual threshold, not exact first-pixel time, connected status, avatars-ready or complete tap-to-interactive. All six endpoint sheets were visually reviewed. The analyzer deduplicates repeated splash transitions within one launch, retaining the earliest start and complete wait.

At the original threshold100: median1244.900→1020.512ms, 18.02% less elapsed time,1.220x. Sensitivity thresholds20/50/140 yield18.16–20.69% reduction; timing.json retains every sample. Capture bounds are adjacent-frame bounds, not statistical confidence intervals. This does not establish p95, FPS, failure rates or the3x overall goal. Do not multiply with the separate cached-chat1.13x result.

b.png and a.png show the list around1.1s after that start, with exact unequal frame times1111.856/1147.167ms in frames.json. They illustrate a state difference, not a timing measurement by themselves. Status, Host search identity and system gesture bar are cropped. Fixed task fixtures only. Native-only calculation path: Expo Web would not exercise this implementation; no layout change is asserted.

A preliminary noise-formal-a1 capture overlapped Gradle on the Host PC and is excluded. Its raw artifacts remain private. First simple adb tap during later chat smoke left the list visible; the established180ms stationary press opened Stable with header, latest message and composer. This is not a navigation success-rate claim.

Verification:50 focused cryptographic/channel tests and full typecheck pass. Full mobile suite2621pass/7fail/11skip; all7 failures are English expectations receiving Chinese and reproduce on untouched parent (20pass/7fail in those two files). No claim of full green local suite. Foreground/network/auth/held-anchor regressions for this new candidate, broader devices, crypto review and Human QA remain pending. Existing stack evidence does not automatically qualify this candidate.
