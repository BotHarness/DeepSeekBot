# Native plus menus and haptic evidence

Application and native source: `bf87d28558583ebd0d7bf43d9da0120387c56a7b`. Before attachment source: `a1d78b8de06098677ae5210f0fc13358377c25d7` (composer identical to main `5692f1164`). The full matrix below was captured before merging main. Integration source `39c667ea5` then merged main `62081206b`; a separate cold-start native check passed both menus, keyboard/File cancellation, retained draft and opening-only feedback. Its iOS native fingerprint and binary are unchanged. Subsequent commits only update evidence. iOS 27 iPhone 17 Pro Simulator, 402 × 874 pt, rebuilt Debug Dev 0.0.1 (1) with fresh Metro.

Native fingerprint: `1d50562c178687eaac5fdee0cac4da882eabf2fa`. Executable SHA-256: `8e3b5aefe98eb156555bf43e59c82fa27210976557b1976511159ab5669000c3`. Native debug library SHA-256: `df05ed5f1bc9ae850ddfa36a0e17a2f95c0731966e64ffe2d4cea81c86fe21ab`. Actual native screenshots are cropped to exclude unrelated conversation content; the maximum creation menu intentionally needs scrolling. `scroll-l.png` and `scroll-d.png` show the final action before it was activated.

| Case                                                                            | Result                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Creation menu                                                                   | PASS: four actions in fixed order, no heading, native highlighting and outside dismissal                                                                                 |
| Four creation destinations                                                      | PASS: blank/Git forms, Marketplace, native Zip picker and Cancel; no creation/import submitted                                                                           |
| Composer menu                                                                   | PASS: Photos, Camera, File in an anchored native menu; no bottom tray                                                                                                    |
| Keyboard and draft                                                              | PASS: menu opens over the real keyboard; File and Photos pickers open and cancel; original test draft retained, input rectangle remains 274 × 44 pt at the same position |
| Application haptic requests                                                     | PASS: each controlled menu opening adds one; dismissal and source selection add none                                                                                     |
| Haptic feedback OFF / ON                                                        | PASS: persisted OFF keeps both menus usable with zero additional requests; ON restores one opening request                                                               |
| Chinese default / intermediate / maximum × light / dark                         | PASS: both menus inspected and dismissed; maximum creation menu scrolled and Git activated                                                                               |
| English default                                                                 | PASS: creation and attachment labels and picker cancellation                                                                                                             |
| Android native, physical iOS, actual vibration, VoiceOver                       | NOT VERIFIED; source tests do not establish tactile or device acceptance                                                                                                 |
| Camera capture, attaching/sending a selected file, full imports, cloud creation | NOT VERIFIED in this menu-only batch                                                                                                                                     |

Haptic requests were observed with a bounded conditional logpoint after the preference guard; no production instrumentation was added. Simulator output and provider requests cannot establish physical feel. Existing menus elsewhere retain their own feedback rules.

Final checks: **1,586 mobile tests pass, 9 skip**; lint, format, root/mobile typechecks and change ledger pass. Native compilation passed. Initial compile-signature failure was corrected; an unsigned diagnostic install could not access Keychain and was excluded. The final ad-hoc-signed Simulator package restored the existing pairings without creating new access grants.

Original drafts and preferences restored; only an avatar-status cache changed. Owned test processes stopped and ports released. The new qualified Simulator package is retained. Physical phone package and services are unchanged. No Host mutations, pairing changes, merge, release or phone deployment.

## Implementation boundaries

```text
Creation + / Composer +
  iOS UIKit UIButton + UIMenu
    menuActionTriggered → JS haptic('menu') → existing preference gate
    UIAction identifier → current scoped callback / existing picker
  Android Material 3 DropdownMenu
    opening guard → haptic('menu')
    DropdownMenuItem → existing picker
```

The local iOS module only owns native presentation and emits opening/selection events. It does not own preferences, attachments, navigation or Host state. Identical item updates retain the current menu during composer rerenders. Native inputs changed: existing development clients must be rebuilt before loading this JavaScript. The main CI does not compile this Swift module; the qualified local Xcode build supplies that check.

This batch supersedes the earlier `qa75` source/binary and iOS system-only haptic statement. Those screenshots remain historical evidence for the initial creation-menu change.
