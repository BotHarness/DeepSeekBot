# Bottom creation navigation — Batch36 evidence

All captures are actual iOS 26 Simulator renders, 402 × 874 points, English, UAT only. App source: `edf7c31f827b8e8f4df7670887e54749829dd47c`; installed Expo SDK 58 native binary baseline: `494a20f1e`. These captures do not qualify later source changes.

- `before-light.png`: base `9a51bc6028cdcc7c8beb5a8bfcc30a8a1755f98c`, default light; previous header creation entry. Same viewport/theme/locale; the candidate list contains additional empty UAT fixtures, so this is not an exact dataset comparison.
- `nav-first-light.png`, `activity-light.png`, `native-nav.mp4`: native SwiftUI destination selection and independent glass creation button; actual Chats/Activity and open/close interactions.
- `menu-all-light.png`, `default-dark-menu.png`: actual expanded action panel with native close button. The panel itself uses an opaque readable surface.
- `cloud-created-open.png`, `cloud-create-open.mp4`: one real owner-authorized create, automatic open and canonical readback of the returned empty channel. No messages sent. This fixes the earlier Batch34 SESSION_BUSY path. The recording includes the simulator keyboard's existing missing Chinese glyphs; keyboard localization is not claimed fixed.
- `maximum-light-nav.png`: preserved FAILED maximum-font capture: growing circle consumed navigation width, truncating labels. Source fix `50443fc32e3201f3cfdbde5a95918983ec179651` awaits its own native verification. This image is not a successful acceptance screenshot.

Member/guest menus withheld owner actions. The run added one empty Cloud fixture; two cumulative empty fixtures remain because there is no public deletion API. Own session, pairing and temporary guest grant were removed; pre-existing active sessions and memberships were preserved in this run. App data/preferences and shared device resources were restored and released. This does not retroactively resolve Batch34's session-inventory uncertainty.

Complete maximum-font light/dark, Reduce Transparency transition, long-press runtime, VoiceOver, Android device, physical iPhone and Human acceptance remain unverified. CI/source tests and native proof are separate.
