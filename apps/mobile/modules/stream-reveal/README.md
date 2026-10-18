# Android streaming text reveal

This local Expo module observes the existing React Native paragraph `TextView`.
Markdown parsing, text, typography, layout, selection and accessibility stay with
the existing renderer. It owns only temporary appearance spans and their
`Choreographer` clock; it does not own received text or the playback cursor.

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
motion and cleanup. They do not qualify hardware drawing, React Native child
layout, scrolling, TalkBack or native text selection: use the shared Android
device lane and the `stream-text-reveal` / `stream-window` journeys for those.
