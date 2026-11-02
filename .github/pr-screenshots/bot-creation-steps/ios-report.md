# #2930 iOS native acceptance — 2026-10-27

**Overall: FAIL.** This evidence-only follow-up leaves the implementation unchanged. It does not approve merge, deployment, TestFlight or store submission.

Refs #2922, #2930 and existing Zip-name defect #2954. Agent task: `codex/local/01a1653b-3345-7091-8284-34ceddb41e2c`. Claim: https://github.com/BotHarness/DeepSeekBot/issues/2922#issuecomment-6440381608.

## Candidate and boundaries

- Frozen main/JS source: `a13e23d791e7eb065a4c25a188f45326023b98be`, newer than the #2930 squash `a0294108dec299619756ff8b3904bba821cd8254`. No cherry-picks or product edits.
- iPhone 18 Pro Max Simulator, iOS 27, Debug arm64 dev client, `ai.botharness.deepseekbot.dev`, 0.0.1 (1). Chinese system/app locale. Physical iPhone and Android: **UNTESTED by this run**.
- Retained native build source: `43bf7b4a000566ff97316e61e48cb54979d2f582`; independently recomputed native fingerprint `6f73bb9f815ecc5d10ca974f07e30649711ae650` matches, as do the config/package/lock inputs. Wrapper SHA256 `7682039e40781dde4cef01687b7641b8c72dcd46288c8b58e3a8d552cd1f888d`; Debug dylib SHA256 `cee275506fa41306b2bfe50fab0dc3ef991889ba04a05c5e459ddf80b06f50cf`.
- Current JS loaded through this task's Metro from the frozen worktree. Exact executed-JS content hashing through CDP remained **UNVERIFIED**; no claim that the older native build itself contains the newer JS. Its native compatibility and the observed current step screens are recorded separately.
- Default Dynamic Type: `large`. Maximum cases: `accessibility-extra-extra-extra-large`; restored to `large`. Reduce Motion stayed off. Light/dark captured; settled retakes replace theme-transition frames. No performance improvement claim.
- Two task-isolated QA Hosts, A and B; no everyday Host or model reply needed. Three pre-existing offline pairings retained. Therefore the clean-no-pairing and exactly-one-paired variants are not claimed.
- A1–A3 use the documented development fixture, not a real Connect account. All other create/import completions and counts below use real isolated Hosts.

## Results

PASS applies only to the explicitly exercised variants. UNTESTED clauses are not promoted by CI, Android evidence or source inspection.

| Case | Result                         | Observed result / remaining boundary                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | **FAIL**                       | The empty portion of a selectable row does not toggle it; tapping its text does. A single native trailing checkmark is used; Added and Offline rows are disabled.                                                                                                                                                                            |
| A2   | PASS                           | Zero/one/two-selection labels and pinned capsule work, using the A1 text-hit workaround. Shared height deviation is recorded in F3.                                                                                                                                                                                                          |
| A3   | PASS                           | Fixture list remains in place; Studio row and capsule contain native indicators. Real account pairing is not inferred.                                                                                                                                                                                                                       |
| A4   | UNTESTED                       | No real Connect test account used.                                                                                                                                                                                                                                                                                                           |
| B1   | PASS                           | Full Environment list, no dropdown, sentence, header close/no chevron, no round back on step1, Next1/3.                                                                                                                                                                                                                                      |
| B2   | PASS / UNTESTED variant        | Scoped A preselects A. All with A/B online picks last-used A. Actually stopping A then reentering clears selection and disables Next; offline A cannot be selected; choosing B enables Next. Exactly-one-paired variant UNTESTED because prior pairings were retained. Maximum-text list scroll reaches A/B.                                 |
| B3   | **FAIL** / UNTESTED variant    | From creation → Add Environment → real QA pairing → customization Save, navigation returns Home rather than the original creation step. Back from customization also returns Home. Initial no-online list was observed; clean-no-pairing empty state UNTESTED.                                                                               |
| B4   | PASS                           | Name-derived avatar, Shuffle changes the preview; empty name disables Next; system Photos picker and square crop work.                                                                                                                                                                                                                       |
| B5   | PASS                           | Actual Chinese software keyboard shown; footer sits above it and a visible Next tap advances to step3. Driver AX geometry can remain at its earlier coordinate; real screenshot-grounded tap verifies the visible action. Spoken VoiceOver UNTESTED.                                                                                         |
| B6   | **FAIL** layout contract       | Persona → bio → tags, optional values and final Create label work; maximum text can scroll to tags. Default button heights66pt, maximum back66pt vs capsule93.33pt, rather than equal52pt.                                                                                                                                                   |
| B7   | PASS / UNTESTED variants       | Round Back and real iOS edge swipe3→2 keep input; close exits; reopening preserves target/name/avatar/persona/bio/tags. Step1 edge-swipe and every close/back permutation UNTESTED. Android system back is outside this run.                                                                                                                 |
| B8   | PASS                           | Two rapid taps create exactly1Bot and1DM on A, none on B; original operation lookup matches. Opens new DM; Back does not reopen creation steps. Native loading capsule captured in both themes with a separately named controlled creation.                                                                                                  |
| B9   | PASS / UNTESTED fault branches | Real B pause produces5s waiting line, native busy capsule, then unreachable+Retry. App termination/reopen preserves original Host/input/key; restoring B and Retry creates exactly1Bot/1DM. This interruption happened before mutation. Post-mutation lost receipt, uncertain-edit lock and Host restart during submitted creation UNTESTED. |
| B10  | PASS / UNTESTED branch         | Shuffled recipe persisted on Host and appeared in DM. A selected/cropped test photo persisted and is visible in actual Bot profile. Picker cancellation retained draft. Failed avatar-apply alert branch UNTESTED.                                                                                                                           |
| C1   | PASS                           | Environment → Git link2/4 → identity3/4 → bio/tags and final Import.                                                                                                                                                                                                                                                                         |
| C2   | PASS                           | Real public repository check shows native Checking source capsule; advances with an editable repository-derived name. Light busy capture uses a bounded pause of B; dark is an unscaled video frame.                                                                                                                                         |
| C3   | PASS                           | Invalid link stays on2/4 with error above the bar; fixing it continues.                                                                                                                                                                                                                                                                      |
| C4   | PASS / UNTESTED variants       | Box placeholder and keep-imported-avatar copy; no persona field. Import performed without an avatar override. Exact imported-source artwork comparison and shuffled-import override UNTESTED.                                                                                                                                                |
| C5   | PASS                           | Actual Git import opens DM; A count2→3.                                                                                                                                                                                                                                                                                                      |
| D1   | PASS                           | Environment first, no immediate picker; actual UIDocumentPicker cancellation/reopen and actual Host-export Zip selection; filename, size and choose-another action shown.                                                                                                                                                                    |
| D2   | **FAIL**                       | Upload/preflight and actual import succeed, bio/tags match archive. Name carries over previous Git edit rather than archive name (#2954). Uploading100% remains on later steps after upload has finished.                                                                                                                                    |
| D3   | UNTESTED                       | Optional retained-Zip deletion/restore not injected.                                                                                                                                                                                                                                                                                         |
| E1   | PASS                           | Real market list/detail → Environment → listing-prefilled identity → Confirm source/target/name/editable bio/tags → actual import DM.                                                                                                                                                                                                        |
| E2   | UNTESTED                       | No stale catalogue commit was injected.                                                                                                                                                                                                                                                                                                      |

## First failures and reproduction

### F1 — A1 row hit area

Fixture: Environment list. Studio selected1 → tap blank part of Studio row → still selected1 → tap Studio name → selected0. Recorded native frames are retained as `ios-A1-before-light.png`, `ios-A1-blank-hit-light.png`, `ios-A1-name-hit-light.png`. The first failure was reproduced after a clean app relaunch; an earlier dev-launcher error overlay was excluded. Source investigation suggests the plain SwiftUI Button's HStack/Spacer lacks a full-row content shape; this is a hypothesis, not a shipped fix.

### F2 — B3 pairing loses creation return context

Creation step1 → Add Environment → pair a real task-owned QA Host → Save the optional customization page. Actual: Home is shown. Reopening creation manually can continue with the paired Host, but it does not satisfy automatic return. `ios-B3-return-dark.png` shows the actual Home destination. The optional customization Back path produced the same return.

### F3 — step-bar size contract

Native AX measures default roundBack66pt/capsule66pt. At maximum accessibility text the capsule is93.33pt while Back remains66pt. The reference contract specifies equal52pt controls. The maximum-text body remains scrollable; this failure does not claim the buttons are unusable.

### F4 — D2 name carry-over, existing #2954

A completed Git import was manually named `QA2930 Git`. A new Zip was exported from `QA2930 Shuffle`; its `.botharness/bot.json` contains that name, `Native QA fixture`, and tags`qa`,`native`. After its first native upload/preview, identity still displayed `QA2930 Git`, while bio/tags were correctly taken from the archive. `ios-D2-first-name-dark.png` preserves this first result. Later settled-theme retakes reused an edited draft (`QA2930 Layout`) and are labelled separately; they are not presented as the first failure. Manual rename allowed completing the actual Zip import.

### F5 — stale Uploading100% on later Zip steps

After preflight has advanced to identity and final bio/tags, the upload line still says `上传中100% · 保持应用打开`. The controls are already enabled. Reproduced again in settled light and dark captures. No interruption is implied by this stale line.

### Additional observation — created DM header

The new DM's avatar and name stack and clip within the small identity capsule (`ios-dm-dark.png`). Its correct hit target still opens the profile, where the photo avatar is displayed correctly. This is an adjacent visual regression, not a claimed creation failure or a fix to the profile redesign.

## Canonical Host receipts

| Operation exercised through native UI   | A Bot count | B Bot count | Independent Host proof                                                                                                         |
| --------------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Before creation                         | 0           | 0           | Live CLI list on each isolated Host.                                                                                           |
| Shuffled blank creation, two rapid taps | 1           | 0           | Exactly1DM and created receipt under original operation key.                                                                   |
| Photo-avatar blank creation             | 2           | 0           | Canonical avatar URL, actual native profile screenshot.                                                                        |
| Git import                              | 3           | 0           | Live list and actual new DM.                                                                                                   |
| Zip import                              | 4           | 0           | Real4,088-byte exported Zip; native upload/preflight/import and new DM.                                                        |
| Marketplace import                      | 5           | 0           | Live list and actual new DM.                                                                                                   |
| B slow/restart/retry                    | 5           | 1           | Same saved operation/input/target before and after App restart; lookup receipt matches that original key; exactly1matching DM. |
| Supplemental loading-theme capture      | 5           | 2           | Deliberately separate named operation `QA2930 Loading`; not a retry or duplicate of B9.                                        |

Original exported Zip SHA256: `47d5abd241e5135fb6655ead785f5368a5d2455abe0c189daecb7e93f54b121f`.

Authenticated CLI receipts, full fingerprints, logs, raw screenshots, recordings and first failed attempts remain private. Counts and UI results are separate evidence; neither substitutes for the other. No model calls were used.

## Capture provenance and limitations

`ios-captures.json` records source-capture and redacted PNG SHA256, original pixel dimensions and each privacy rectangle. Images preserve full aspect ratio and layout; only opaque privacy boxes replace account email and pre-existing computer names, with unchanged pixels outside those boxes. No generative edits. Some frames show the development tools control or the system return-to-Safari/Photos breadcrumb; these are labelled runtime evidence, not store artwork.

Default/max Dynamic Type and light/dark are native checks. Middle font size, English screens, spoken VoiceOver, Reduce Transparency fallback, pre-iOS26 styling, physical iPhone, Android and performance benchmarks remain UNTESTED here. Original recordings are sparse and are not used for frame-rate/performance claims. First-load IPv4/IPv6 development-server misconfiguration was corrected to the actual localhost listener and is not counted as a product failure.

## Cleanup / retained evidence

Both task-created Simulator connections were removed through the actual UI; their exact Host device keys were independently verified revoked, with no pending keys. Three pre-existing pairings remain. Own processes exited and their ports were independently checked free; protected shared listeners remained unchanged. The app/session closed, Simulator is Shutdown, light/large restored, Reduce Motion untouched. No physical-phone, tunnel or Serve change.

Own downloaded Zip and task-owned creation draft were removed after process exit. The owned public test photo was deleted from the live library and remains recoverable in Recently Deleted; other photographs were preserved. Closed isolated Profiles, accepted native build and raw evidence are retained for reproduction.

Simulator-only retained setup differences: the development Tools button remains hidden; newly presented Dev-app and Photos notification prompts were declined, without granting access. A scoped notification reset is not supported, so these were not reset to notDetermined. This does not claim a complete reset of all Simulator preferences. No store/deployment/merge action.

## Capture index

All links below are actual native captures. Light/dark are appearance variants of the merged implementation, not a before/after code change. F4 first failure is distinct from the later settled-theme retakes.

| Capture                | Image                                                    |
| ---------------------- | -------------------------------------------------------- |
| ios-A1-before-light    | [ios-A1-before-light.png](ios-A1-before-light.png)       |
| ios-A1-blank-hit-light | [ios-A1-blank-hit-light.png](ios-A1-blank-hit-light.png) |
| ios-A1-dark            | [ios-A1-dark.png](ios-A1-dark.png)                       |
| ios-A1-light           | [ios-A1-light.png](ios-A1-light.png)                     |
| ios-A1-name-hit-light  | [ios-A1-name-hit-light.png](ios-A1-name-hit-light.png)   |
| ios-A2-dark            | [ios-A2-dark.png](ios-A2-dark.png)                       |
| ios-A2-light           | [ios-A2-light.png](ios-A2-light.png)                     |
| ios-A3-dark            | [ios-A3-dark.png](ios-A3-dark.png)                       |
| ios-A3-light           | [ios-A3-light.png](ios-A3-light.png)                     |
| ios-B1-dark            | [ios-B1-dark.png](ios-B1-dark.png)                       |
| ios-B1-light           | [ios-B1-light.png](ios-B1-light.png)                     |
| ios-B10-dark           | [ios-B10-dark.png](ios-B10-dark.png)                     |
| ios-B2-dark            | [ios-B2-dark.png](ios-B2-dark.png)                       |
| ios-B2-light           | [ios-B2-light.png](ios-B2-light.png)                     |
| ios-B2-max-dark        | [ios-B2-max-dark.png](ios-B2-max-dark.png)               |
| ios-B2-max-light       | [ios-B2-max-light.png](ios-B2-max-light.png)             |
| ios-B2-offline-dark    | [ios-B2-offline-dark.png](ios-B2-offline-dark.png)       |
| ios-B2-offline-light   | [ios-B2-offline-light.png](ios-B2-offline-light.png)     |
| ios-B3-dark            | [ios-B3-dark.png](ios-B3-dark.png)                       |
| ios-B3-light           | [ios-B3-light.png](ios-B3-light.png)                     |
| ios-B3-return-dark     | [ios-B3-return-dark.png](ios-B3-return-dark.png)         |
| ios-B4-dark            | [ios-B4-dark.png](ios-B4-dark.png)                       |
| ios-B4-light           | [ios-B4-light.png](ios-B4-light.png)                     |
| ios-B5-light           | [ios-B5-light.png](ios-B5-light.png)                     |
| ios-B6-dark            | [ios-B6-dark.png](ios-B6-dark.png)                       |
| ios-B6-light           | [ios-B6-light.png](ios-B6-light.png)                     |
| ios-B6-max-dark        | [ios-B6-max-dark.png](ios-B6-max-dark.png)               |
| ios-B6-max-light       | [ios-B6-max-light.png](ios-B6-max-light.png)             |
| ios-B8-dark            | [ios-B8-dark.png](ios-B8-dark.png)                       |
| ios-B8-light           | [ios-B8-light.png](ios-B8-light.png)                     |
| ios-B9-error-dark      | [ios-B9-error-dark.png](ios-B9-error-dark.png)           |
| ios-B9-error-light     | [ios-B9-error-light.png](ios-B9-error-light.png)         |
| ios-B9-slow-dark       | [ios-B9-slow-dark.png](ios-B9-slow-dark.png)             |
| ios-C1-dark            | [ios-C1-dark.png](ios-C1-dark.png)                       |
| ios-C1-light           | [ios-C1-light.png](ios-C1-light.png)                     |
| ios-C2-dark            | [ios-C2-dark.png](ios-C2-dark.png)                       |
| ios-C2-light           | [ios-C2-light.png](ios-C2-light.png)                     |
| ios-C3-dark            | [ios-C3-dark.png](ios-C3-dark.png)                       |
| ios-C3-light           | [ios-C3-light.png](ios-C3-light.png)                     |
| ios-C4-dark            | [ios-C4-dark.png](ios-C4-dark.png)                       |
| ios-C4-final-dark      | [ios-C4-final-dark.png](ios-C4-final-dark.png)           |
| ios-C4-final-light     | [ios-C4-final-light.png](ios-C4-final-light.png)         |
| ios-C4-light           | [ios-C4-light.png](ios-C4-light.png)                     |
| ios-D1-dark            | [ios-D1-dark.png](ios-D1-dark.png)                       |
| ios-D1-light           | [ios-D1-light.png](ios-D1-light.png)                     |
| ios-D1-picker-dark     | [ios-D1-picker-dark.png](ios-D1-picker-dark.png)         |
| ios-D1-picker-light    | [ios-D1-picker-light.png](ios-D1-picker-light.png)       |
| ios-D2-dark            | [ios-D2-dark.png](ios-D2-dark.png)                       |
| ios-D2-details-dark    | [ios-D2-details-dark.png](ios-D2-details-dark.png)       |
| ios-D2-details-light   | [ios-D2-details-light.png](ios-D2-details-light.png)     |
| ios-D2-first-name-dark | [ios-D2-first-name-dark.png](ios-D2-first-name-dark.png) |
| ios-D2-light           | [ios-D2-light.png](ios-D2-light.png)                     |
| ios-D2-name-dark       | [ios-D2-name-dark.png](ios-D2-name-dark.png)             |
| ios-D2-name-light      | [ios-D2-name-light.png](ios-D2-name-light.png)           |
| ios-E1-dark            | [ios-E1-dark.png](ios-E1-dark.png)                       |
| ios-E1-light           | [ios-E1-light.png](ios-E1-light.png)                     |
| ios-dm-dark            | [ios-dm-dark.png](ios-dm-dark.png)                       |
