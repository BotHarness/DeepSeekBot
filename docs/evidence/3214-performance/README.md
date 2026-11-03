# Desktop 1.6.1 performance checkpoint

Issues: #3214, #3226 and #3248. Evidence collected October 31–November 1, 2026.
This is a bounded improvement checkpoint, not a stable-60-FPS or universal-1500-ms acceptance.

## Included changes

- Ordinary generated avatars use static images and distinct static activity glyphs, without mounting their animation lifecycle. Window Companions retain their separate animated path.
- SQLite latest-message previews project the selected message rather than hydrating complete Channel histories.
- Timeline queries select bounded placement windows before projecting receipts, reactions and attachments; unread anchors and bidirectional pagination retain their existing contracts.
- Attention and approval queries use selective indexes; source-message existence checks use an indexed lookup.
- Draft updates preserve settled message/group identity. Obsolete Channel-opening continuations stop after selection changes. Continuous scrollbar activity shares one visibility session.
- Startup usage reconciliation projects each Session to token/routing metadata before reading the next one, including queued live events, while retaining the final atomic transaction.
- Performance policy requires controlled component ablations, matched A/B trials and explicit correctness/native verification boundaries for future changes.

No Markdown package swap, Worker highlighter, virtual-list replacement, giant-message document mode, Companion lifecycle rewrite, streaming-mode redesign or composer/model-selection redesign is included.

## Historical whole-Client A/B

The machine-local task archive is `.humanlayer/tasks/desktop-160-perf/`.
The committed `headed-ab.json` is the sanitized, per-trial summary from `HEADED-NATIVE-REPORT.md` and `headed-native-summary.json`.
It is an earlier frozen whole-Client pair, **not a measurement of every change in this PR's final head**.

- Google Chrome for Testing 153.0.8010.36; headed, foreground at trial boundaries; normal VSync; no frame-rate overrides.
- DSH 0.2.1-rc.3; 1440 × 900 CSS viewport; three-Bot Group, 60 rounds / 240 messages, at most 589 characters per body; exactly 50 entries loaded.
- Native CDP mouse-source scroll gestures, 8000 px/s, 9600 px up/down. This is neither JavaScript `scrollTop` replay nor a Human's physical gesture.
- Three alternating timing trials per side, plus three separate correctness trials per side. No profiling during primary timing.
- Read-only CoreGraphics display observation: 1470 × 956 logical / 2940 × 1912 pixels, 60 Hz. An older summary incorrectly attributed the display-mode reading to `system_profiler`; this committed summary corrects that attribution.

Medians of per-trial values; parentheses show min–max:

| Metric                               |               Original |       Frozen candidate | Change |
| ------------------------------------ | ---------------------: | ---------------------: | -----: |
| Scroll rAF interval p95, ms          |    216.8 (167.1–234.4) |       31.3 (17.7–32.5) | −85.6% |
| Longest scroll callback interval, ms |    250.0 (232.9–315.7) |      66.6 (33.7–150.3) | −73.4% |
| Main-thread cumulative CPU, ms       | 3104.4 (2879.8–3207.7) | 1327.6 (1324.9–1342.0) | −57.2% |

The candidate's 150.3 ms outlier is retained. rAF cadence is not physical presentation FPS.
Separate correctness sampling found zero gaps, empty viewports, ordering/duplicate failures or settled anchor displacement; 89 original and 426 candidate prepaint snapshots were sampled, not every presented frame.
The committed before/after screenshots show the same synthetic conversation after the historical trials, not a visual proof of FPS or final-head acceptance.

## Independently measured slices

These experiments use different frozen pairs and denominators; percentages must not be combined.

| Slice                                              | Before → after                                                                                 | Evidence boundary                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Static ordinary avatars                            | Ordinary cold-switch longest callback median 811 → 181 ms; long-Markdown unread 5524 → 1006 ms | Three trials/side/scenario; early Chromium diagnostics, not installed Desktop FPS                                       |
| Latest-message previews, 40 Channels               | Source batch 241.352 → 30.622 ms                                                               | Data-path experiment, not complete Panel rendering                                                                      |
| Bounded latest-50 timeline from 10001 placements   | Host HTTP median 126.177 → 2.525 ms                                                            | Three repeats; returned bodies/IDs match; ordinary UI opening timings overlap                                           |
| Attention/approval indexes, 30-round Group opening | 770.1 → 309.2 ms with cleared preferences; 839.0 → 381.2 ms with saved preferences             | Five alternating pairs; scroll p95 unchanged at 18.5 ms                                                                 |
| Indexed existence checks                           | 128 real-store checks: 479.335 → 2.215 ms                                                      | Five pairs; microbenchmark, not an end-to-end streaming result                                                          |
| Settled groups during 60 draft updates             | 420 → 0 settled-group renders                                                                  | CPU/frame distributions overlap; no perceptible-speed claim                                                             |
| Abandoned selection continuations                  | 2 → 0 unnecessary history requests                                                             | Five delayed trials; natural timing distributions overlap                                                               |
| Scrollbar activity reuse                           | Trace style-update count 1090 → 621                                                            | No established CPU/frame improvement                                                                                    |
| Compact usage reconciliation                       | 5/5 OOM → 5/5 complete                                                                         | Five alternating pairs, synthetic 24 × 6 MiB Session logs, 128 MiB Node heap; not full-Host/single-large-log acceptance |

The usage experiment's machine-local report is `.humanlayer/tasks/3248-usage-memory/REPORT.md`.
It preserves inherited prefixes, fallback routing, receipt deduplication, queued live calls and rollback in focused regression tests.
DSH still materializes an individual Session read; this PR does not establish a byte bound for that upstream operation.

## Unresolved acceptance and next bisect

- A later candidate opening took 2140.166 ms; the 1500 ms waiting ceiling is not achieved across the matrix.
- Later normal-VSync trials retain 125–127 ms native synchronous-highlighting long tasks. The Worker experiment is diagnostic only and is not shipped here.
- A cold 112 px displacement remains unresolved. Zero drift in the historical A/B above does not erase it.
- Channel-list data hydration was optimized, but complete Panel rendering/subscription ablation is pending. Sampled list-formatting costs were about 103 ms in `formatChannelListTime` and 57 ms in `plainMarkdown`, not isolated causal speedups.
- Next controls preserve Panel width and timeline geometry: normal baseline; Channel-list subtree/subscriptions unmounted; list subscriptions frozen; previews/timestamps bypassed; timeline frozen while the list remains active; then roster, Companion and other docked Panels separately.
- Final combined-head A/B, heap/soak, concurrent real-stream input, installed Desktop and Human acceptance remain separate pending gates.
- These issues remain referenced rather than automatically closed by this checkpoint.

## Verification and resource ownership

The delivery branch is based on the updated main branch. Its existing generation 113 migration remains intact; attention indexes use generation 114. Upgrade tests cover both generations 112 and 113, preserving canonical rows and checking integrity and refusal of older writers. This database compatibility fence is not a simple binary downgrade: recovery requires a forward-compatible fix or restoration of a pre-upgrade backup.

Historical browser/Host processes were task-owned and stopped; ports were released and evidence retained. This PR preparation does not restart the paused continuous-performance goal or modify shared QA Hosts/generated builds.
Delivery verification on the updated-main worktree passed 18 focused test files / 275 tests, and a separate broader Channel/attention/usage/budget batch passed 34 files / 262 tests. These batches overlap and are not added into a total. Root TypeScript checking, scoped formatting/lint, Release Ledger, CLI parity, feature-map and source-policy checks passed. Lint retains existing unused-variable/control-regex warnings. The sparse-checkout CI-plan CLI cannot validate omitted asset directories; full CI planning and docs/mobile/build checks remain CI gates. These checks do not substitute for browser, installed Desktop or Human acceptance.

## Foreground streaming A/B

The later measurement of #3311 and #3313 on a real GPU is in [foreground-streaming-ab.md](foreground-streaming-ab.md).
