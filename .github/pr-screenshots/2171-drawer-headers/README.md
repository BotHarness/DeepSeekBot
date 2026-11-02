# Drawer headers — Batch 23

Runtime `4185d28a380bd37f68eafb765d28d24ee947af4a`; base `3be6b52c384812f801d2b9d58013580c0d6e4c0f`; installed native `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. [Runtime CI](https://github.com/BotHarness/DeepSeekBot/actions/runs/39109396184) passed all applicable jobs.

The assigned existing iOS 26 Simulator rendered both views at 402 × 874 in English. Before/after pairs use matching default text, light theme and signed-out data. No new dependency, native build, account login, service mutation or Prod change.

## Results

- Workspace drawer and generic statistics Sheet: default/intermediate/maximum Dynamic Type × light/dark captured and inspected. Long titles wrap; maximum-size close actually clicked in both surfaces. Sheet body was scrolled; the secondary Got it button was partly clipped in the captured position, so this is not a full body-action reachability qualification.
- Normal-size iOS title uses native glass from existing Expo UI. Larger text uses an opaque rounded rectangle. Close is a separate 44pt target. Android source/bundle passed but was not driven natively.
- Workspace close/reopen and backdrop dismissal were actually performed. The 3.7-second recording and 14-cell contact sheet were inspected.
- Real Settings Reduce Transparency toggle was observed checked, App returned to opaque title/close, then the original unchecked state and glass rendering were restored. No app restart was needed for the setting change.
- Original statistics preferences were backed up privately, noticeSeen was temporarily cleared to show the production Sheet, then the original bytes were restored. Development telemetry transport was unconfigured. No telemetry identity or private file is published.

## First failures retained

- Initial sandbox source run could not bind loopback; permitted rerun passed 649 tests / 8 skipped.
- Initial CI rejected comments/useEffect; external-store subscription replaced it. The final source-policy, typecheck, build, affected tests and both mobile bundles passed.
- First native maximum-light glass title became a dark ellipse around multiline text (`first-pass/`). Final runtime uses the rounded opaque large-text treatment; all six cases rerun.
- Initial capture was during bundling and was discarded from final comparisons. First system-switch label click did not toggle the switch; unchecked state and unchanged glass were retained. Actual switch tap then produced checked → opaque → unchecked → glass evidence.

## Boundaries and cleanup

Settings/SheetStack remain unchanged; this does not requalify #2112 or claim every drawer migrated. Android, physical phone, VoiceOver/Human and older-iOS rendering remain unverified. Source and iOS results do not close those gates.

Large/light and Reduce Transparency off restored; original statistics preference file restored byte-for-byte; own App, driver and Metro stopped. Installed app/data/Keychain, signed Products, rollback, three original QA documents, physical-phone lane and all Hosts preserved. No merge.
