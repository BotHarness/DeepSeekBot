# iOS Settings presentation evidence

The initial differential uses the same iOS 26.0 Simulator, English, light appearance,
default system text, SDK 58 native binary built at `a0b291907`, and JavaScript baseline
`216963322c70c7ea009392da66e9a0e1f4327727`.

- `diagnostic-before.png`: original Settings `formSheet`; only the native sheet handle is visible.
- `diagnostic-after.png`: the single-variable `modal` probe restores the nested Settings content.
- Reverting that variable made the same native assertion fail again; the iOS-only final change passed.

These diagnostic images are not the latest-main native acceptance matrix. The current native
build and final regression report are recorded on the PR and in issue #2107. Screenshots contain
only the task's isolated QA label and loopback route, with no personal Host or conversation data.
