# Android physical-device QA for #2930

Date: 2026-10-27. Refs [#2922](https://github.com/BotHarness/DeepSeekBot/issues/2922), [#2930](https://github.com/BotHarness/DeepSeekBot/pull/2930). Task: `codex/local/01a17bef-21c0-75f0-bf5d-2fedb6df7b73`. [Claim](https://github.com/BotHarness/DeepSeekBot/issues/2922#issuecomment-6435239194).

**The merged revision is not accepted by this run.** It failed to boot with `Maximum call stack size exceeded (native stack depth)`. Further checks used the separate [#2947](https://github.com/BotHarness/DeepSeekBot/pull/2947) fix candidate. Candidate failures and incomplete checks below remain open; the images do not imply that #2947 was merged or that #2930 passed on its own.

## Revisions and device

| Item | Actual run |
| --- | --- |
| Original source | `280dfd094755e7586395991f8bc863d31b06ece0`, contains #2930 squash `a0294108dec299619756ff8b3904bba821cd8254` |
| Candidate source | `68c68f4715b9b59b7c969735bff441792b3f7624`, #2947, based on main `96f37c954`; platform step-bar contract extracted to break runtime self-import |
| QA artifact branch | `qa/2930-android-screenshots`, branched from original source; no runtime changes |
| Hardware | USB POCO 24069PC21G, Android 16, arm64-v8a, physical 1220 × 2712, density 480, Chinese locale |
| Normal / maximum settings | font 1.0 / 2.0; physical density 480 / native maximum display-size density 610 |
| Installed QA client | SDK 58 development Debug client, application ID `ai.botharness.deepseekbot.dev`, arm64; existing Release client could not load Metro or development fixtures |
| QA APK SHA-256 | `d3e9c4735784904b3323173272c1f0d2d0dba7b88e010b74ec64d7a27dd5bc8f` |
| Runtime | Dedicated isolated DSH 0.2.1-rc.3 Host, authenticated pairing; Metro loaded candidate JS. No everyday Host, VPS, or live model calls |
| Navigation | Real edge-back gesture and real three-button Back both exercised; original gesture setting restored |

## Per-step result

`pass` applies to the stated behavior, not to unperformed variants. `untested` can include partial observations, listed explicitly. Original-source checks were blocked globally by startup; only the first attempted fixture entry is marked fail. Candidate behavior results and screenshot completeness are separate.

| Step | Original source | Fix candidate | Observation / limit |
| --- | --- | --- | --- |
| A1 | fail | pass | Development fixture: Studio Mac / Travel Laptop toggle selected fill and native check; Added Home PC and offline Office Server cannot be selected; no checkbox controls. |
| A2 | untested | pass | Disabled zero-selection capsule; Add 1 and Add 2 states; bottom safe area checked. Chinese only; English not tested. |
| A3 | untested | pass | Fixture pairing stays in list; row and capsule show native loading. This is fixture proof, not a real account operation. |
| A4 | untested | untested | Optional real Tobs Connect account operation not attempted. |
| B1 | untested | pass | Blank creation starts at single-select Environment, intro and header X; no first-step round Back; Next 1/3. |
| B2 | untested | untested | Partial: specific Environment and All/last-online selection observed; offline rows cannot be selected; static maximum font/display layout checked after cold restart. Only-one-paired and last-used-offline fallbacks were not completed; existing pairings were preserved. |
| B3 | untested | untested | Fresh zero-paired-device profile and pairing during creation not staged. |
| B4 | untested | pass | Empty name disables Next; name-generated avatar and Shuffle; real system Photos picker selected only the supplied public image and opened native square crop. Native profile application is separately failed in B10. |
| B5 | untested | pass | Actual soft keyboards in both themes; Next remains above keyboard and can be activated. Dark keyboard recommendation toolbar is redacted. |
| B6 | untested | pass | Persona, bio and tags optional; final Create has no step count; maximum font/display top and scrolled layouts keep action accessible. Canonical first Bot retained entered bio/persona. Standard-size light screenshot is missing. |
| B7 | untested | pass | Round Back, system Back, real edge-back gesture and three-button Back move one step. Name/avatar/persona/bio draft retained across close/reopen and app restart. |
| B8 | untested | pass | Real accepted create response held: native loading; then direct DM. Back returns to roster, not completed forms. Loading screenshot is dark only. |
| B9 | untested | pass | Held actual accepted response, then dropped transport/lookup traffic: slow message, locked uncertain state, error above capsule, Check and resume. Restoring transport opens the original Bot. CLI proves one Bot for each of QA293Blank, QARecover and QAResume; no retry duplicate. Slow screenshot is dark only; uncertain state has both themes. |
| B10 | untested | fail | Generated recipes persisted, native photo crop exercised, and failed avatar application showed native alert while Bot existed. Opening the native Bot profile raised `Event cannot be both direct and bubbling: topSelect`; final profile avatar rendering could not be accepted. Profile redesign is outside this QA/fix scope. |
| C1 | untested | pass | Actual Git flow has four steps and Next 2/4 at source input. Light/dark images differ in input contents (empty versus filled); they are state examples, not a matched comparison. |
| C2 | untested | pass | Actual public Git source: Checking source on leaving step 2, then name `doubao` prefilled. Artificially holding preview beyond timeout also showed timeout; releasing and retrying succeeded. Only light loading screenshot retained. |
| C3 | untested | pass | Invalid URL stays on step 2 with visible error; corrected exact public URL proceeds. Only dark error screenshot retained. |
| C4 | untested | untested | Partial: box placeholder / original-avatar caption and no editable Persona in final import step observed. Generated override persisted for Zip import. Original avatar rendering in native profile blocked by B10; Git Shuffle variant not separately completed. |
| C5 | untested | pass | Actual Git import opens DM; canonical Host list contains one imported `doubao`. |
| D1 | untested | pass | Entry first shows Environment; picker is entered from step 2. Real Android DocumentsUI selected only QA2930-export.zip; filename, size and Choose another visible. Screenshot is dark only; entry image captures Environment result-check loading. |
| D2 | untested | fail | Real 4055-byte Host export uploads and preflights, bio `QABio` prefilled, empty archive tags remain empty. Name incorrectly stayed `doubao` from previous Git flow instead of archive `QA293Blank`: [#2954](https://github.com/BotHarness/DeepSeekBot/issues/2954). Manually renaming to QAZip then importing worked and opened DM. Archive was one chunk; multi-chunk progress not tested. |
| D3 | untested | untested | Optional retained-file deletion/restore native case not staged. Existing automated coverage mentioned in the handoff is not counted as execution of this case. |
| E1 | untested | pass | Actual Marketplace listing: three steps, name prefilled `doubao`, final source URL / Environment / edited name QAMarket / bio / tags / Import; actual import opens DM and canonical Host contains one QAMarket. Only dark final screenshot retained. |
| E2 | untested | untested | Optional stale listing commit not staged; shared public listing left unchanged. |

## Failures and evidence limits

- Boot failure: [#2945](https://github.com/BotHarness/DeepSeekBot/issues/2945), independent fix [#2947](https://github.com/BotHarness/DeepSeekBot/pull/2947). Local regression: 102 tests across 9 related files, mobile typecheck, repository lint, touched formatting and changelog checks passed. #2947 CI also passed. iOS native execution was not performed.
- Zip stale name: [#2954](https://github.com/BotHarness/DeepSeekBot/issues/2954); the wrong-name and actual archive metadata observations are preserved.
- Profile `topSelect` error blocks B10 and final original-avatar proof. No profile redesign/fix included.
- Changing native maximum display size while running produced a multiple-NavigationContainer/linking warning and a blank view. Cold restart recovered; static maximum layouts passed. Hot configuration recreation is **not accepted** by this run.
- Some captures taken immediately after changing system theme kept the prior theme or mixed native/app colors. They were excluded as target-theme evidence. Missing matched pairs: B4 (photo versus Shuffle state), B6 standard light, B8 light, B9 slow light, C1 input state, C2 dark, C3 light, C4 light, D1 light, D2 dark, E1 light. The handoff's complete matched-theme screenshot requirement remains unmet.
- A1/A2 illustrate different valid selection counts across themes. They are captioned accordingly; not pixel-matched before/after comparisons.
- TalkBack labels/step counts were inspected in native UI trees; spoken TalkBack navigation was not tested. No emulator/iOS, camera QR scanning, real Connect account, or live model qualification is claimed.
- Exploratory screenshots whose names did not match their actual screen were excluded. Published images are real device captures; only status-bar cropping, fixture-section cropping, error cropping, private Environment-name masks, and dark keyboard-toolbar redaction were applied. No generated or reconstructed screens.

## Canonical result and cleanup

The dedicated Host ended with exactly six Bots: QA293Blank, QARecover, QAResume, doubao, QAZip and QAMarket. Transport faults ran through a task-local loopback proxy after authenticated pairing; Host authentication was retained. No model was invoked. Native transitions and direct CLI reads, rather than request success alone, support the behavior results.

The QA device was revoked on the dedicated Host, and only its newly added Environment was unpaired locally. Existing five pairings were preserved. Original font, density, night mode, gesture navigation, keyboard option and input method were restored. Clipboard was not changed. Only the supplied public test photo and export Zip were removed. The exact preceding Release development-ID APK was reinstalled with data preserved (SHA-256 `80d54299f12397ec100569c07c10511e4132d7d0deda86f576b9fb6082c139f1`). Dedicated Host, Metro, proxies and the two task-owned ADB reverse mappings were stopped/removed; the phone lease was released. Raw private evidence remains local, outside this PR.

## Screenshot index

Filenames describe the actual retained view and theme. `max` is the native maximum font/display setting; `nav` shows three-button navigation. B4-light shows the photo-selection path, while B4-dark shows a restored generated-avatar draft. B10-alert-light refers to the native alert; the underlying app surface retained dark colors. See the PR for pinned GitHub-rendered embeds.
