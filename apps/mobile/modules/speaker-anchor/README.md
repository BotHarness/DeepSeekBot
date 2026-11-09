# Sticky speaker avatar anchor

This local Expo module keeps a group-chat speaker avatar above the composer while
the message list scrolls. It replaces the Reanimated worklet in
`src/ui/chat/speaker-row.tsx` that measured the shadow tree on every scroll event.

The anchor reads its own position from the live native view hierarchy in the same
frame that the list moves: iOS observes the enclosing `UIScrollView` offset with
KVO, and Android repositions in a `ViewTreeObserver` pre-draw pass. The position
is computed against the chat viewport overlay (`nativeID` `chat-speaker-viewport`),
so the Android inverted list and keyboard inset need no special case. JavaScript
only sends layout-time values: the resting offset of the avatar below its bubble,
the group span it may rise through, and the composer floor. Scroll events are not
used, so the list keeps its 32 ms `scrollEventThrottle`.

Children mount inside an inner host view (iOS) or the anchor itself (Android);
Fabric keeps their frames and only the anchor's translation changes.

## A/B against the Reanimated path

Old development builds without this module fall back to the Reanimated path
automatically. To compare both paths in one native build, start Metro with:

```sh
EXPO_PUBLIC_STICKY_AVATAR=reanimated pnpm --filter @botharness/mobile start --clear
```

**Adding this module requires a native rebuild**; an OTA update alone cannot
install it.

## Native tests

```sh
BOTHARNESS_SPEAKER_ANCHOR_IOS_TESTS=1 pnpm --filter @botharness/mobile exec expo prebuild --platform ios --no-install
pnpm --filter @botharness/mobile exec expo prebuild --platform android --no-install
bash apps/mobile/android/gradlew -p apps/mobile/android :speaker-anchor:testDebugUnitTest
```
