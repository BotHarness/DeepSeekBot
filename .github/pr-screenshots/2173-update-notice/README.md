# Compatible update notice — native acceptance

PR #2177 implements #2173. All rendered evidence comes from official macOS Desktop apps with isolated synthetic Profiles. No browser automation, private Bot contents, or model calls. Runtime source is `26ac68fc5678d378eb93e62fe6af2946386fc8a7`; `970b4379c6fbcc63dd54895e8da2cde8e3c918a5` only reformats a test. Later commits contain documentation/evidence only. Artifact integrities and image hashes are adjacent JSON files.

## Evidence boundaries

- **Historical baseline:** `before-published-121.png` is the real published npm DSB 1.2.1 on official DSH 0.2.0-rc.2. After installed notes were dismissed and Desktop restarted, no available-update modal appeared. Authenticated Host checking found published 1.3.1. Original baseline commit: `58676fae77fe1cde951c0b8a61ec5288fc5e37a3`.
- **Fixed candidate against the real registry:** candidate runtime source was packed with QA version 1.2.1, never published. `online-131-020-dark.png` shows automatic discovery of actual npm 1.3.1 on DSH 0.2.0-rc.2. This is not a patched copy of the historical 1.2.1 source.
- **Future release simulation:** candidate source was packed with QA version 1.3.1. A QA-only Profile Plugin supplied registry manifests and explicitly labeled notes for unpublished 1.4.0 / 1.4.1 / 1.4.2. It did not inject Client state, replace the compatibility evaluator, or ship in product artifacts. The real native DSH evaluator processed these manifests. These screenshots are not publication evidence.
- Untouched published 1.3.1 cannot gain this new Client behavior from an npm tag change. Its first upgrade still needs the existing update entry. The shell's DSH update badge is a different feature.

## Native result matrix

| Journey                                            | Result                                                                 | Evidence                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| DSH 0.2.0-rc.2, candidate QA 1.2.1, real npm 1.3.1 | Automatic compatible-target modal after onboarding and installed notes | `online-131-020-dark.png`                                |
| Dismiss via Escape, open About                     | Update remains available in settings                                   | `settings-020.png`                                       |
| Restart the same Profile after dismissal           | No repeated available-target modal                                     | `dismiss-restart-020.png`                                |
| Explicit native installation of real npm 1.3.1     | Host reports running 1.2.1, installed 1.3.1, restart-required          | `native-install-pending-020.png`                         |
| Full Desktop restart after install                 | Host reports current 1.3.1 / latest 1.3.1; installed notes appear      | `native-installed-131.png`; limitations below            |
| DSH 0.2.0-rc.2, QA 1.3.1 → fixture 1.4.0           | Tutorial, installed notes, then one compatible-update modal            | `candidate-140-020-dark-zh.png`                          |
| DSH 0.2.1-rc.2, QA 1.3.1 → fixture 1.4.0           | Actual newer DSH identity and compatible target shown                  | `candidate-140-021-dark-zh.png`                          |
| Dismiss fixture 1.4.0; restart with fixture 1.4.1  | New exact target reminds again; English and light theme verified       | `candidate-new-target-021-light-en.png`                  |
| Fixture 1.4.2 requires DSH >=0.2.2                 | Clear incompatible requirement; no install button                      | `incompatible-021-light-en.png`, `incompatible-cli.json` |
| Registry unavailable, force check from About       | Says npm cannot be reached, never “up to date”                         | `offline-settings-021.png`, `offline-cli.json`           |
| Registry restored, CLI force check                 | Available compatible target returned immediately                       | `recovered-cli.json`                                     |

The constrained-window capture is 1344 × 1200 pixels (`candidate-constrained-021.png`): title, identities, summary and all actions remain visible. Escape closes the notice. A subsequent forced settings check preserves the unsent Home draft and panel geometry (`draft-before-check.png`, `draft-after-check.png`); closing settings returns focus to its launcher. No test draft was sent.

Full-size dark and light captures use native 2522 × 1640 screenshots. Baseline is an absence-state comparison across historical and current UI; its shell/layout is intentionally different, not a pixel-aligned styling comparison.

## Installation test limitations and first failures

The real npm install initially failed because the CLI-created QA Profile used a different pnpm store from Desktop's installer. The native error did not claim success or change the running identity. Reinstalling the QA artifacts with Desktop's existing store resolved this test-environment mismatch; no installer, auth, or approval checks were bypassed.

Installing published 1.3.1 from this candidate is a **code downgrade despite the artificial numeric QA version increasing**. Desktop hot-reloaded the older published Client; the pending-restart screenshot therefore shows that older settings UI. After full restart, the old published Host correctly reports 1.3.1 but refuses the candidate's newer operational database schema (`upgrade-required`, visible in the screenshot). This proves package installation, running/installed identity separation, restart, and installed-note behavior; it does **not** qualify historical 1.3.1 against a newer database or claim post-downgrade Bot functionality. No user database was touched. The separate final candidate Profile remains healthy.

After QA, the registry fixture was removed from both test Profiles. Official DSH 0.2.1-rc.2 Desktop was restarted with the final candidate source and real registry; forced checking reports current QA identity 1.3.1 / latest published 1.3.1. No hypothetical update is left visible. No package was published and no PR was merged.

## Automated checks

- Focused Core / Client / CLI regression tests passed, including native evaluator semantics, compatible fallback beyond 20 candidates, incomplete-search retries, before-install revalidation, per-Profile/exact-target receipts, and single-modal restart coordination.
- Lint, formatting, TypeScript, and build passed.
- Frozen-code full run: 778 files passed, 2 timed out, 13 skipped; 6,979 tests passed, 2 timed out, 23 skipped. The two existing 15-second timeouts were in `bot-dm.test.ts` and `profile-backup.test.ts`; rerunning those files passed all 18 tests. This is not described as a clean single full-suite run.
- GitHub CI for code head `970b4379c6fbcc63dd54895e8da2cde8e3c918a5` passed affected tests, isolated Host smoke, build/typecheck/lint, docs and mobile bundle checks. CodeRabbit was skipped while Draft, not an independent passing review.
- Two independent agent reviews (spec and standards) found no remaining issues after the final fixes. Human QA, merge, and release remain pending.
- The requested rendered acceptance is macOS-only. Linux/Windows native rendering, a real future 1.4.0 installation, and the unmodified old Client gaining new behavior are not claimed.
