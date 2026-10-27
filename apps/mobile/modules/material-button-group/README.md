# Android Material button group

Local Expo view wrapping Compose Material 3 Expressive `ToggleButton`s laid out as a connected
button group. The Bot profile uses it for its icon-only Work, Memory, Files, Routines and Settings
tabs (#2905).

SDK 58 Expo UI exposes `ToggleButton` but not the connected shapes, the checked-shape morph or the
Expressive motion scheme, so this adapter supplies them: leading, middle and trailing buttons use
`ButtonGroupDefaults.connected*ButtonShapes()`, the checked button morphs to a full pill, and
`MaterialExpressiveTheme` runs `MotionScheme.expressive()` (standard under Reduce Motion).

Exactly one button stays checked: pressing the checked button keeps it checked, and pressing
another sends `onSelect` with its value. Each button is a 48 dp target with the Tab role, its
selected state and its name as the content description; the test tag is `profile-tab-<value>`.
Icons are Material Symbols path data drawn in the button's content colour. Colours come from the
app's theme as CSS hex strings.

A new Android development build is required. CI tests `:material-button-group:testDebugUnitTest`.
iOS uses SwiftUI's segmented `Picker` through Expo UI instead.
