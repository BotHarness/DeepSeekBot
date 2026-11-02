# Android Chats -1 screen (spike)

Local Expo UI extension that wraps Compose Material 3 `DismissibleNavigationDrawer` with two
React Native slots, `panel` (the workspace panel) and `content` (Chats). There is no scrim: the
whole Chats screen slides right by the panel's width, like a launcher's -1 screen (#3015, hub
#3002). Material marks the navigation drawer as being deprecated in M3 Expressive in favour of the
expanded navigation rail, but the Compose API is not deprecated; the Human chose it for this feel.

It is registered with `ExpoUIView` and placed inside Expo UI's `<Host>`, so it takes the Host's
Material theme and seed colour. Each slot is an Expo UI `SlotView` holding an `RNHostView`.

- **State.** JavaScript owns `open`. `onOpenChange` reports each settled value after a drag, a tap
  on the visible Chats strip, Back or predictive back. `gesturesEnabled` turns the drag off.
- **Width.** `min(360dp, width - 56dp)`: Material's maximum, keeping a 56dp strip of Chats on a
  phone (`panelWidthDp`).
- **Back.** `DismissibleDrawerSheet(drawerState)` registers a Compose `PredictiveBackHandler`
  that is enabled only while the panel is open. It is registered after React Native's activity
  callback, so it wins: Back and predictive back close the panel first. While closed it is
  disabled, and the `predictive-back` module leaves the root to Android's back-to-home preview.
  The JavaScript panel does not `holdBack` in this mode.
- **Gestures.** The drawer's `anchoredDraggable` claims a horizontal drag after touch slop. Vertical
  scrolling is unaffected: a scrolling list asks its parents not to intercept, and `RNHostView`
  forwards that to Compose. Once the drawer moves under the finger the view asks its React Native
  parents not to intercept either, which cancels the JS responder and gesture-handler handlers.
- **Accessibility.** The Material drawer sets the pane title, closes with the `dismiss` action and
  Escape, and the JavaScript panel moves TalkBack focus to its selected tab. While open, the Chats
  slot leaves the accessibility tree and a `closeLabel` button over it closes the panel.

The React Native drawer stays the default. The native drawer runs on Android Chats only when the
build has this module and Metro serves `EXPO_PUBLIC_ANDROID_NATIVE_DRAWER=on`. A new Android
development build is required. CI runs `:dismissible-drawer:testDebugUnitTest`.

## Device spike gate

Record each row on #3015 with a screen recording, on an Android 14+ phone with gesture navigation:

1. Vertical scroll of Chats, pull-to-refresh, a long press on a row and the creation FAB work.
2. A horizontal swipe right anywhere on Chats opens the panel; a swipe left or a tap on the Chats
   strip closes it. The workspace drawer button in the search bar opens it.
3. Predictive back with the panel open previews and closes the panel, then stays in the app.
4. Predictive back at the Chats root, panel closed, plays the system back-to-home preview.
5. Choosing a Computer, All or a cloud workspace in the panel closes it and switches the view.
6. Panel content is not clipped or offset, in portrait and landscape, light and dark.
7. TalkBack: the workspace button opens the panel and focus moves into it; the close button and
   the dismiss action close it.
