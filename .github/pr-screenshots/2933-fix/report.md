# #2933 physical iOS recovery evidence

2026-10-27. Task: `codex/local/01a17bec-cd91-7af0-b8b6-23762abad1ba`.

## Source and environment

- Physical iPhone XS Max, iOS 18.1.1; 375 × 812pt / 1125 × 2436px captures.
- Same existing Dev app identity and pairing, local signed Release 0.0.1 (1). No TestFlight upload or store release.
- Matched unfixed main: `96f37c9549be2466acb19ba2bd8ab99b7a79c960`.
- Final native product source: `258b01d10e31bd1ff205fbd606a0bdc952810301`, containing that main plus the keyboard frame fix. Later evidence-only commits do not change the app.
- Both packages passed 50 source-map, signature, extension, device, minimum-OS and app-group checks. The initial main at task start (`a0294108dec2`) also reproduced the blank twice.
- Original light appearance and system text settings retained; the exact text-size category was not independently read. The original input method was WeType Chinese; Apple English (US) was a temporary control and WeType was restored.
- The Human clarified that the original report concerned an older TestFlight version. Its exact build remains unknown; these are current-source Dev results, not TestFlight acceptance.

## Cause and narrow change

A temporary probe on the initial main captured background `keyboardWillShow` notifications with end coordinates width=0, height=0 and screenY=0. The root/avoider remained 812pt high while the inner view shrank to about 22.7pt and the composer moved to y=-68pt. The core React Native padding calculation treated snapshot coordinates as a keyboard covering almost the full screen. The visible text input then had 0×0 AX bounds, although the draft remained stored.

Use the already installed keyboard-controller `KeyboardAvoidingView` for the iOS/default frame. Its native height/progress owner replaces the core screen-coordinate calculation; existing frame props, child identity, navigation, draft persistence and the Android frame stay unchanged. No dependencies or native inputs changed in this fix. All temporary probes were removed.

## Matched proof

`initial.png` is the unfixed main before backgrounding. `before.png` is that same package after actual SpringBoard → 5s → resume: history and composer disappear, draft value and Dev PID remain. `after.png` is the fixed package after the same trigger with the same multiline QA draft.

The final native regression script failed on unfixed main: known text absent, composer 0×0, and 539,861 of 630,000 static message-region pixels changed. It uses actual SpringBoard foreground and resumes without relaunch.

| Final product case              | Background | Result |
| ------------------------------- | ---------- | ------ |
| WeType, multiline unsent draft  | 5s         | PASS   |
| WeType, multiline unsent draft  | 30s        | PASS   |
| WeType, empty draft             | 5s         | PASS   |
| WeType, empty draft             | 30s        | PASS   |
| Apple English (US), empty draft | 5s         | PASS   |
| Apple English (US), empty draft | 30s        | PASS   |
| Keyboard closed, empty draft    | 5s         | PASS   |
| Keyboard closed, empty draft    | 30s        | PASS   |

Each PASS requires known QA content, nonzero/hittable input, the same draft value and Dev main PID, and zero changed RGB pixels in a nonempty 630,000-pixel static message region. This is a static reading-position check, not streaming/performance proof. Images were inspected for the real soft keyboard and reachable input/actions.

List → same conversation retained the test draft and known content after a 10-second wait. A retained native recording contained no blank content/header among 238 decoded frames in an 8-second stable re-entry window. Variable recording rate and the bounded window cannot rule out all flicker; no UI FPS claim is made.

## Remaining observations and acceptance

- `header.png`: one keyboard-closed case had isolated captures where the native header was not drawn, although its AX Back button remained 44×44 and hittable. The next case drew it normally. Cause and relation to the original flicker are unconfirmed; retained as a separate observation, not an all-pass header claim.
- Sustained flicker was not reproduced. The generic render-failure reload affordance is not implemented by this narrow fix; keep #2933 open.
- iPhone 17 / reported iOS 26.6.2, TestFlight chat behavior, Android, intermediate/maximum Dynamic Type, dark appearance, VoiceOver, active marked-text composition, long/streaming histories and Human QA remain UNTESTED. The physical driver does not expose direct font/appearance controls; phone settings were preserved and no Simulator window was taken.
- UIKit background snapshot frames have no useful Expo Web counterpart; the before/after evidence is physical native, not a Web preview.

## Automated checks and restoration

- Mobile suite: 2160 passed, 11 skipped across 285 passing / 9 skipped files.
- Related CI-plan tests: 130 passed. Root/mobile types, lint, format, feature map and release-ledger checks passed.
- Two-axis source review: no remaining actionable findings after script privacy, cleanup and oracle corrections. Source tests cannot establish UIKit geometry; the native script is the regression seam.
- Quiescent app/AppGroup backups were validated before the first update. After that update all backed-up files matched except two system SplashBoard previews. Keychain was not exported; the same signing/access identity and existing working pairing were retained.
- No new pairing, message send, model call, Host, Metro or network route was created. Only task drafts were cleared; original WeType, empty composer and All view restored. Updated Dev app and original data/pairings remain; TestFlight was untouched.
- Task recording/session/daemon stopped with known cleanup. Independent checks found zero owned driver/build/recorder processes and zero phone runners; the driver port was released and protected QA services unchanged. Device window released.

Raw snapshots, personal device metadata, backups, system-home captures and original recordings remain private. These four images contain only the designated QA conversation and test draft.
