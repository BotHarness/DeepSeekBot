# Android Material FAB menu

Local Expo view wrapping Compose Material 3 Expressive `FloatingActionButtonMenu` with a
`ToggleFloatingActionButton`. The Android Chats creation button uses it (#2953).

SDK 58 Expo UI does not expose the FAB menu, so this adapter renders it inside
`MaterialExpressiveTheme`, with `MotionScheme.expressive()` (standard under Reduce Motion). The
toggle morphs from the app's FAB colours to the accent colour, and its plus turns into a close
glyph halfway through the morph. Items are accent full pills with a Material Symbol path and a
label; the test tags are `creation-menu-trigger` and `creation-<key>`.

JavaScript owns the expanded state and the view's size: `onToggle` reports the toggle and
`onPick` the chosen item key. The toggle does not open while `available` is false, but it always
closes. Colours come from the app's theme as CSS hex strings.

A new Android development build is required. CI tests `:material-fab-menu:testDebugUnitTest`.
