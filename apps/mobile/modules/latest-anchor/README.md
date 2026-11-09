# Latest message anchor

This local Expo module keeps the iOS chat list on the newest message while it grows.
It replaces the JavaScript round trip in `src/ui/chat/follow-latest.ts`
(`onContentSizeChange` → `requestAnimationFrame` → animated `scrollToOffset`), which
reached the native list two to four frames late and restarted the UIKit scroll
animation on every streamed line.

The anchor is a zero-height view in the list footer. It observes the enclosing
`UIScrollView` `contentSize` with KVO. When the list was at the newest message and the
content grows, it glides the offset to the new end with a critically damped spring on
a `CADisplayLink` (up to 120 Hz on ProMotion). A new target during a glide keeps the
current velocity, so streamed text and new bubbles push the view up in one continuous
motion. Like Telegram, Slack and Discord, the newest message stays visible and nothing
moves while the reader holds or browses history.

JavaScript sends only two props: `following` (false while the reader browses history)
and `animated` (false when Reduce Motion is on; the anchor then snaps). A drag or a
momentum scroll stops the glide at once.

## Android

Android uses the inverted list's header, at the visual bottom. The newest offset is
zero. Streaming text grows upward; new rows use `maintainVisibleContentPosition`
to retain the previous row, then the anchor follows content growth on the next
`Choreographer` frame and glides back to zero. Keep mVCP enabled on Android.

An offset change not made by the anchor cancels its glide. Disabling animation,
including setting the system animator duration scale to zero, snaps to the end.
The JavaScript hook still owns initial placement, keyboard pins and explicit jumps.

Android acceptance is tracked in [#3868](https://github.com/BotHarness/DeepSeekBot/issues/3868).
The restored spring tests do not qualify device behavior. The next Windows QA batch
must compare native and JS following on emulator and phone before acceptance.

## A/B against the JavaScript path

Development builds without this module fall back to the JavaScript path automatically.
To compare both paths in one native build, start Metro with:

```sh
EXPO_PUBLIC_FOLLOW_LATEST=js pnpm --filter @botharness/mobile start --clear
```

**Adding this module requires a native rebuild**; an OTA update alone cannot install it.

## Native tests

```sh
BOTHARNESS_LATEST_ANCHOR_IOS_TESTS=1 pnpm --filter @botharness/mobile exec expo prebuild --platform ios --no-install
```

Then run the `LatestAnchor-Unit-Tests` scheme on an iOS Simulator.
