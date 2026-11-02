# Desktop onboarding evidence

Native macOS DeepSeek Harness 0.2.1-rc.2, isolated synthetic Profile. No browser automation.

- `before-old-guide.jpg`: earlier main UI, legacy seven-item checklist. Captured at 2290 × 1640 with different synthetic fixture; compare the entry pattern, not pixel-identical layout.
- `step5-home-title.jpg`: final candidate, 2522 × 1640, fifth step waiting for real Home title click; unsent draft retained.
- `step5-conversation.jpg`: same final candidate after title click; Home closes, original Tob DM opens. Host readback confirms journey done.
- `layout-tip.jpg`: final candidate explicit replay; first of four short panel tips. Finishing tips returns to step five without completing the journey.
- `legacy-migration.jpg`: final candidate boot with a seeded legacy unfinished tutorial; no forced guide or navigation. Host readback reports v2/paused.
- `new-bot-empty.jpg` / `created-group-members.jpg`: candidate with the same creation and welcome-removal code, before the final navigation-failure guard; real approved Tob CLI creation and actual membership, no default Bot message.
- `model-gate.jpg`: candidate before final navigation guard; cleared default in this isolated Profile, then native setup/cancel/save verified and unsent draft restored.

- `step5-dark.jpg`: final candidate, dark theme, fifth step and retained draft.
- `narrow-desktop.jpg`: final candidate at 1744 × 1200; existing narrow Desktop conversation shell. Restoring 2522 × 1640 returned Home, its draft and step five. This is not mobile Home verification.

## Verification boundaries

Passed: 172 focused tests (13 files), lint including CLI parity, format, typecheck and build. Native model setup/cancel, real approved Bot/group creation, new Bot empty DM, same Tob DM, fifth-step action/readback, layout-tip replay, global resize and Home close/reopen restoration, quiet legacy unfinished migration, dark Home, and narrow-window/wide-window restoration.

Human QA accepted on 2026-10-18: the user explicitly confirmed macOS Desktop drag placement and child-panel resizing work correctly on this candidate. `human-accepted-layout.jpg` captures the resulting native layout: Home closed, original Tob DM visible, Sessions above Memory Files in the right child column, with adjusted width. This is a post-acceptance screenshot, not a recording of the user's gestures. Earlier agent gestures did not visibly move/resize panels and later returned `noWindowsAvailable`; that attempt remains an automation-evidence limitation and is superseded for acceptance by the user's direct confirmation.

Legacy completed/skipped cases, denial/pending invitation and recovery edges have source coverage; their full native matrix is not claimed. Mobile Web remains a later slice.

Screenshots show synthetic data only. This slice excludes mobile Web. The user authorized merge after CI and review pass; publishing a release is outside this task.

## Final review follow-up

The final review adds deterministic ordering for recovery among multiple replacement Bots and updates the English settings description. A regression test first reproduced the ordering failure; all 40 Host/Client onboarding tests then passed. Native screenshots and Human layout acceptance above precede only these two small follow-ups; the pictured Chinese layout and interaction code are unchanged.
