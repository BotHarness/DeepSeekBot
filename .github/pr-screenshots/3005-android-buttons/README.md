# #3005 Android Material 3 buttons

JVM renders (Paparazzi 2.0.0-alpha03, layoutlib, Pixel 5) of the same Compose tree that
`button.android.tsx` builds through Expo UI 58: material3 1.5.0-beta01 `Button` /
`FilledTonalButton` / `TextButton`, a `Row` with an 18dp `Icon` from `assets/button/` or an
18dp `CircularProgressIndicator`, `fillMaxWidth` and `defaultMinSize(minHeight = 48.dp)`.
Colours come from the Host's `SchemeTonalSpot` seed scheme with the shared accent
(`#4176e6` light, `#7aaaff` dark). `source/ButtonShots.kt` is the render source.

These are not device captures. The busy spinner is caught at its first frame. Device checks
follow the `material-buttons` row in `phone-android-interactions.md`.
