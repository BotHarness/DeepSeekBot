# S1 native interaction captures

Production Client source: `aeb70b4f5fbeb705842d5f560e91d15e78b0bae8`.
Captured 2026-10-19 in the same isolated macOS DSH 0.2.1-rc.2 Profile and window.
Viewport: 1261 × 820 CSS pixels. Locale: Chinese. Theme: dark. Data: fresh test Profile.
These show an interaction before/after on the candidate, not the old base revision.
The verification harness adds an identifying window title only; it does not implement zoom.

| File          | Action / observation                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| state-100.png | Settings → General at 100%                                                                      |
| state-120.png | One OS shortcut reached native forwarding as Meta+Shift+Equal, repeat=false; one level increase |
| state-144.png | One Settings zoom-in button click from 120%                                                     |
| state-83.png  | Reset to 100%, then one OS Meta+Minus                                                           |

At 100% and after the Equal event, content/code/terminal font tokens remained 14/11/13px.
The automation's Equal event carries Shift; this is not proof of ordinary Meta+Equal.
These captures do not qualify webview foreground recovery, plain-key input in embedded content,
actual non-default restart persistence, extreme-level recovery or Windows/Linux.
