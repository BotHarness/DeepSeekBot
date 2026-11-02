# iOS stream surface checks

The iOS module uses one real child subtree and a shared rounded mask. Fabric retains final child
frames. The background is a separate shape beneath those children; completed surfaces drop the
mask. A Core Animation path spring retargets from the presentation path within the first growth
budget. Reduce Motion changes, width changes, shrinking and detachment snap to current geometry.
The mask may require offscreen rendering; performance is not qualified by this design.

## Reserved native window only

Follow `docs/agents/device-qa.md` and `docs/agents/ios-performance.md` from the repository root.
No command here allocates a window or authorizes installing on a phone.

In the assigned worktree, enable the opt-in CocoaPods test specification during prebuild:

```sh
cd apps/mobile
BOTHARNESS_STREAM_SURFACE_IOS_TESTS=1 pnpm exec expo prebuild --platform ios --no-install
cd ios
LANG=en_US.UTF-8 pod install --no-repo-update
xcodebuild -list -workspace DeepSeekBotDev.xcworkspace
```

Require the generated `StreamSurface-Unit-Tests` scheme; missing schemes fail preparation.
Run on the queue-assigned Simulator, substituting its verified identity and owned output paths:

```sh
xcodebuild test -workspace DeepSeekBotDev.xcworkspace \
  -scheme StreamSurface-Unit-Tests -configuration Debug -sdk iphonesimulator \
  -destination 'id=<assigned-simulator>' -derivedDataPath '<owned-derived-data>' \
  -resultBundlePath '<owned-result>.xcresult' -parallel-testing-enabled NO
```

These tests cover child identity/frame preservation, background ordering, completion, shrinking,
width changes and short-surface corner normalization. They do not qualify live spring timing,
Reduce Motion, VoiceOver, mounting through an actual React commit, or performance. Check those
through the actual chat after a fresh binary, using the fixed replay in #2942.

Use matched physical iPhone Release A/B/B/A/A/B with three valid samples per version for display
or CPU conclusions. Keep base/candidate source, native binary, production JS, dependency lock,
fixture chunks, history, keyboard actions and settings fixed. Do not count video or JS callbacks
as FPS. Report missing platform/metric evidence as UNTESTED; restore preferences and release only
owned processes when the window ends.
