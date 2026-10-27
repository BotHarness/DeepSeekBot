# Android Material split button

Local Expo view wrapping the Compose Material 3 Expressive `SplitButtonLayout` with tonal leading
and trailing buttons. The leading button runs the main action; the trailing button rotates its
chevron and opens an anchored `DropdownMenuPopup` with one Expressive `DropdownMenuGroup`. The
menu closes on a pick, a tap outside or Back.

The Memory file screen uses it for Edit plus Copy and History. Colours come from the app theme;
shape, motion, ripple and menu placement come from Material 3. Icons are 24-unit SVG path strings.

A new Android development build is required. CI compiles and tests
`:material-split-button:testDebugUnitTest`. iOS keeps its native navigation bar items.
