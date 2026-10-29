# Hidden guest creation and ordinary foreground recovery

Source: `24cfc1b1f9a7d1d2c5aabf03c3c961c28ca41483`, same S1 macOS arm64 DSH 0.2.1-rc.2 window/Profile, 1261×820 CSS pixels, current/default level 0. This evidence predates integration of the newly merged appearance stack on main.

The Human minimized the existing window for about eight seconds and restored it normally. The observer created the native webview while the document was hidden and resized the fixture from 270×100 to 280×110 CSS pixels while still hidden. Guest 2 loaded its initial lease page then the local ruler fixture; both navigation events and both DOM-ready events occurred while hidden. There were no navigation/load failure events after foreground restoration.

Two subsequent visible transitions produced foreground frames at unchanged window geometry and zoom. The same guest id 2, native guest zoom factor 1, input “保留输入”, and 100px ruler were retained. No guest reload/replacement, fullscreen toggle or CSS zoom oscillation was used. The full native-window screenshot visibly includes the guest's red/green/blue bars and retained input; the Human explicitly confirmed “色条和输入都正常显示”. The A/B/C/D overlay is task-only instrumentation.

This qualifies the observed basic hidden-create/hidden-resize/foreground path in this controlled composition. It does not identify every historical intermittent blank-frame cause or qualify arbitrary third-party pages, every host/platform/zoom, or all occlusion/minimize cycles. It is sufficient positive evidence to proceed with implementation rather than keep webview research open indefinitely; the later reliability/platform matrices remain separate.

`keyboard-reset-extremes.json` separately records successful native Tab/Shift+Tab/Return operation of Bot Settings reset from +8 and -8 to saved default 0, with fresh CLI readback. It does not claim complete extreme native pixels: at +8 the reset button was only partly inside ancestor clipping (about 99 of 120 pixels high). Responsive modal layout remains a concrete follow-up.
