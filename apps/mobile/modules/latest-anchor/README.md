# Latest message anchor

This local Expo module keeps the chat list on the newest message while it grows.
It replaces the JavaScript round trip in `src/ui/chat/follow-latest.ts`
(`onContentSizeChange` → `requestAnimationFrame` → animated `scrollToOffset`), which
reached the native list two to four frames late and restarted the UIKit scroll
animation on every streamed line.

On iOS the anchor is a zero-height view in the list footer. It observes the enclosing
`UIScrollView` `contentSize` with KVO. When the list was at the newest message and the
content grows, it glides the offset to the new end with a critically damped spring on
a `CADisplayLink` (up to 120 Hz on ProMotion). A new target during a glide keeps the
current velocity, so streamed text and new bubbles push the view up in one continuous
motion. Like Telegram, Slack and Discord, the newest message stays visible and nothing
moves while the reader holds or browses history.

On Android the list is inverted, so streamed text already grows upward from the
bottom without scrolling. A new row is different: `maintainVisibleContentPosition`
keeps the previous newest row in place, which leaves the new row just below the
viewport until JavaScript scrolled it into view. The anchor sits in the list header
(the visual bottom), listens for content layout changes, and on the next
`Choreographer` frame glides `scrollY` back to 0 with the same spring. Any scroll it
did not set itself (a drag, a fling, a programmatic jump) stops the glide, and an
animator duration scale of 0 snaps.

JavaScript sends only two props: `following` (false while the reader browses history)
and `animated` (false when Reduce Motion is on; the anchor then snaps). A drag or a
momentum scroll stops the glide at once.

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

Then run the `LatestAnchor-Unit-Tests` scheme on an iOS Simulator. On Android:

```sh
pnpm --filter @botharness/mobile exec expo prebuild --platform android --no-install
bash apps/mobile/android/gradlew -p apps/mobile/android :latest-anchor:testDebugUnitTest
```
