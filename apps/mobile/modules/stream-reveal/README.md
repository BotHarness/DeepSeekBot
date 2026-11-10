# Android streaming text reveal

## Opt-in Markdown block window

Rebuilt Android apps can select `EXPO_PUBLIC_MARKDOWN_WINDOW=native` when starting
Metro. Leave it unset or use `js` for the existing JS window. Restart Metro between
variants; old binaries without `MarkdownBlockWindow` retain JS automatically.

Native wrappers cache Fabric-assigned dimensions and compare global transformed
block/ScrollView bounds before drawing. They notify React only when content must
mount or unmount, preserving exact-size placeholders. Unlike the JS path, this
candidate has no JS per-block layout callback or JS viewport subscription. It keeps
the existing renderer, live tail, unsupported documents and accessible content.
Android API 28 and earlier keep all block content in this candidate.

Native wrappers remain allocated, and their traversal has a cost. A/B must measure
that cost as well as JS work; this is not a performance claim or default rollout.
See ADR-0317 and #3926. Native unit tests share `:stream-reveal:testDebugUnitTest`.

This local Expo module observes the existing React Native paragraph `TextView`.
Markdown parsing, text, typography, layout, selection and accessibility stay with
the existing renderer. It owns only temporary appearance spans and their
`Choreographer` clock; it does not own received text or the playback cursor.

The container takes its own measured size from Yoga and leaves child measurement
and layout to React Native. `ExpoView` inherits Android `LinearLayout`; running
its inherited measurement can change text wrapping, and its inherited layout can
replace Fabric's paragraph bounds with an unmeasured `0 × 0` child. Native
regressions preserve both child measurement and bounds across parent passes.

New graphemes fade with the shared duration and stagger tokens. Android ICU keeps
joined emoji, flags and combining marks atomic. At most 48 graphemes animate simultaneously; older
overflow is shown immediately. Text replacement preserves pending reveal clocks,
while corrections, reduced motion and detach settle visible text and remove
callbacks. Appearance-only span notifications invalidate drawing without a React update or
`TextView.setText` on animation frames.

The Android binding lives in `src/ui/primitives/stream-reveal.android.tsx`. Old
development builds without this module retain the existing JavaScript fade.
iOS and web keep that renderer. **Adding this module requires a native rebuild**;
an OTA update alone cannot install it.

After Expo prebuild, run the native tests from the repository root:

```sh
pnpm --filter @botharness/mobile exec expo prebuild --platform android --no-install
bash apps/mobile/android/gradlew -p apps/mobile/android :stream-reveal:testDebugUnitTest
```

AGP 9 registers the Debug unit-test variant by default. The tests cover reveal
timing, Unicode boundaries, replacements, corrections, bounded work, reduced
motion, cleanup and preservation of externally assigned child measurement and bounds. They do not
qualify Fabric mounting on hardware, scrolling, TalkBack or native text selection: use the shared Android
device lane and the `stream-text-reveal` / `stream-window` journeys for those.

## Streaming bubble surface

`StreamSurface` is a separate Android paint adapter in this package. Yoga/Fabric
still owns the final bubble and child bounds. On height growth at a stable width,
the surface paints a rounded background and clips the existing children to the
same 120ms expanding path. New text cannot appear outside its background. There
is no duplicate text, bitmap allocation, per-frame bridge event, measurement or
layout request; each animation tick only invalidates drawing. Subsequent wraps
continue from the currently painted edge. Initial layout, width changes and
shrinks settle immediately. Detach finishes pending motion.

The JS adapter uses an ordinary View for committed messages, reduced motion,
unsupported percentage corners and old native builds. iOS retains its existing
surface; Android evidence does not qualify an iOS animation. Registration of this
additional native view requires a fresh native build, not an OTA-only update.

`SurfaceGrowthTest` checks the boundary clock and interruption. The Robolectric
surface test checks actual drawing/clipping and proves child measurement/bounds
remain untouched across paint frames. Device recordings and alternating Release
frame measurements are still required for visual/performance acceptance.

Android `TextPlayback` is an independent opt-in shared-object engine (`EXPO_PUBLIC_TEXT_PLAYBACK=native`). It preserves JS conversation ownership while moving pacing and one-shot frame timing to Android; missing modules retain JS. A native rebuild is required. ADR-0318 and the `text-playback-native` journey describe lifetime and pending device validation.
