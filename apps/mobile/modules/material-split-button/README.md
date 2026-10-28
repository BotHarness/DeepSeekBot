# Android Material split button

Local Expo UI extension wrapping the Compose Material 3 Expressive `SplitButtonLayout` with tonal
leading and trailing buttons, registered with `ExpoUIView` and rendered inside `<Host>`. The leading button runs the main action; the trailing button rotates its
chevron and opens an anchored `DropdownMenuPopup` with one Expressive `DropdownMenuGroup`. The
menu closes on a pick, a tap outside or Back.

The Memory file screen uses it for Edit plus Copy and History. Colours come from the Host's
Material theme seeded by the accent (ADR-0266), with no colour props; shape, motion, ripple and
menu placement come from Material 3. The view reports its measured size, which React Native gives
the Host. Icons are 24-unit SVG path strings.

A new Android development build is required. CI compiles and tests
`:material-split-button:testDebugUnitTest`. iOS keeps its native navigation bar items.
