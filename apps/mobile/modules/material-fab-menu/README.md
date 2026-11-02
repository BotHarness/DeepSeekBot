# Android Material FAB menu

Local Expo UI extension wrapping Compose Material 3 Expressive `FloatingActionButtonMenu` with a
`ToggleFloatingActionButton`, registered with `ExpoUIView` and rendered inside `<Host>`. The Android Chats creation button uses it (#2953).

SDK 58 Expo UI does not expose the FAB menu, so this adapter supplies it. It inherits the Host's
`MaterialExpressiveTheme` seeded by the accent (ADR-0266) and its Expressive motion (standard under
Reduce Motion). The toggle morphs from `primaryContainer` to `primary`, and its plus turns into a
close glyph halfway through the morph. Items are `primary` full pills with a Material Symbol path
and a label; the test tags are `creation-menu-trigger` and `creation-<key>`.

JavaScript owns the expanded state and the view's size: `onToggle` reports the toggle and
`onPick` the chosen item key. The toggle does not open while `available` is false, but it always
closes. The view takes no colour props.

A new Android development build is required. CI tests `:material-fab-menu:testDebugUnitTest`.

Fabric and Expo's posted layout work can measure the menu after its screen has detached during
navigation. `Host` owns the Android view now, and it already retains the Yoga bounds while
detached without measuring Compose, then requests a fresh layout after attachment. The native
regression measures the menu inside a hosting Compose view without a window and checks this.
