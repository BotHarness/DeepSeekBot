# Latest main and desktop zoom integration

Source: `74e491db496b4329eba5402af71d161f5cfb0b0c`, including main `b0e35529c` and appearance T1–T7.

The same isolated desktop Profile and browser data were retained. The owned desktop was stopped before the full linked build and restarted once afterward. Fresh authenticated CLI readback restored default 0/current -1; the application booted without the former bundle import failure.

199 focused tests in 25 files, typecheck, lint, format, frozen install and full build passed. Dockview browser regression: 25 cases; native-corner browser regression: 204 cases. CI is a separate gate.

Through the existing appearance CLI, selected the light mist-purple preset and a separate header/body material override on the left Channel list. All 17 zoom levels had panel bounds matching allocation (within 2 CSS viewport pixels). Complete native screenshots show the custom left panel at 144% and the independent dark preset. They are runtime captures, not Before/After for a new theme implementation. Appearance preferences and zoom were restored afterward.

The Settings user entry was opened with native UI automation. At 430%, the unchanged wide navigation and scaled native modal padding squeeze the content. This is a concrete S2 responsive-layout fix, not a webview failure.

Earlier hidden-created/resized webview foreground proof is recorded separately at its pre-main source; it is not relabeled as this integration run. Wider real-page/IME/platform qualification remains open. No upstream or installed ASAR was edited; no PR was merged.
