# Desktop performance handoff — 2026-11-02

## Start here

The Human paused the performance goal and requested a committed checkpoint for another session.
Do not resume benchmarks automatically. Task: `codex/local/01a19100-c6ee-7250-bcb0-f066fa018a7d`;
issue #3214, existing claim `issuecomment-6562890860`. First-stage PR #3291 is merged;
its source checkpoint is `76718e81f405db1e5fd61470c0e8411f3bd711f6`.
Read [the first-stage checkpoint](../evidence/3214-performance/README.md) before interpreting historical numbers.

This follow-up changes only the per-Channel unread-count query and adds its regression tests,
release fragment and this handoff. Renderer, Worker, cache and private loader experiments are
**not production changes**. No overall goal-start-to-now speedup is established: measurements
cover different frozen slices and cannot be summed. Browser, installed Desktop and Human
acceptance remain separate.

## Delivered and measured

| Area                                  | Change / method                                                           | Result and limit                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Ordinary avatars (#3291)              | Static renderer avoids animated hooks/resources; distinct activity glyphs | Resource regression guards; Companions remain separate                                                             |
| Sidebar previews (#3291)              | Project latest message, not full history                                  | Data-path improvement; not complete Panel acceptance                                                               |
| Timeline hydration (#3291)            | Select bounded placements before receipt/reaction/attachment projection   | Latest-50 Host HTTP median 126.177 → 2.525 ms, three repeats; not UI opening latency                               |
| Attention/approval (#3291)            | Selective indexes                                                         | Group opening 770.1 → 309.2 ms (cleared preferences), five pairs; scroll p95 unchanged at 18.5 ms                  |
| Existence checks (#3291)              | Indexed Source lookup                                                     | 128 real-store checks 479.335 → 2.215 ms; microbenchmark only                                                      |
| Streaming history (#3291)             | Preserve settled message/group identity                                   | 420 → 0 settled-group renders over 60 draft updates; no established frame improvement                              |
| Abandoned opening (#3291)             | Cancel obsolete continuations                                             | 2 → 0 unnecessary history requests; natural latency ranges overlap                                                 |
| Scrollbars (#3291)                    | Reuse visibility session                                                  | Style-update count 1090 → 621; no established CPU/frame gain                                                       |
| Startup usage (#3291, #3248)          | Project Session token/routing metadata before next read                   | Synthetic 128 MiB heap: 5/5 OOM → 5/5 complete; individual upstream Session reads still unbounded                  |
| Unread counts (this follow-up)        | Seek existing `(channel_id, revision)` index past each read position      | Full-Host unread-count RPC 60.65 [59.79, 61.77] → 29.95 [29.31, 30.25] ms, five pairs                              |
| Concurrent Host work (this follow-up) | Same query, identical independent Profiles                                | Read RPC under counts 40.71 [39.81, 41.89] → 9.41 [9.19, 10.19] ms; read-alone 1.863 → 1.907 ms regresses slightly |

Full-Host results use the same 32,488-Source seed, frozen Client, ten independent Profiles,
five alternating pairs, no response mocks. Values are medians [range] of per-arm pair medians.
Offline controls also cover all-read, last 1/50, all-unread and 1,000 empty Groups. All-unread
23,907 messages improves 64.79 → 52.90 ms: genuinely unread work is not constant-time.
The SQL adds no index, migration, cache, API or persistence authority. It preserves membership
visibility, missing read positions, departed/deleted Channel exclusion, muted per-Channel counts,
notice exclusion, SQL null behavior and distinct Source counting.

### Foreground browser A/B for the unread query

Five interleaved pairs per boundary, headed Chrome 153.0.8010.36, normal VSync, actual 60 Hz,
inner 1440 × 813, DPR 2, same frozen Client and canonical fixture. Timer begins at DOM click
dispatch, not physical intent or driver-issued input; Host reads are prewarmed, not cold startup.
Saved-empty Companion preferences are identical and exclude cold default Companion displacement.
Values below are median [min, max] milliseconds, n=5 per side.

| Unread boundary | Before readable      | After readable       |
| --------------- | -------------------- | -------------------- |
| 0               | 510.9 [494.4, 678.2] | 460.2 [427.7, 544.0] |
| 1               | 680.9 [624.0, 761.6] | 638.5 [607.7, 655.9] |
| 49              | 720.8 [655.8, 758.0] | 620.2 [558.1, 626.3] |
| 50              | 691.2 [634.5, 707.6] | 574.7 [558.2, 607.2] |
| 51              | 657.6 [631.6, 724.5] | 574.6 [557.2, 692.4] |
| 220             | 689.9 [623.7, 725.3] | 616.0 [574.6, 669.2] |
| 9999            | 641.0 [591.0, 673.6] | 541.9 [524.8, 608.0] |

The 50/9999 medians improve 16.9%/15.5%; 0/1 have overlapping ranges and one slower pair
each. All 70 observed operations meet 1,500 ms; 4,910 post-ready anchor snapshots have no
observed drift, correct unread divider/order, and peak initial window ≤50. This is not universal
1,500 ms acceptance, physical-input latency, presented FPS or continuous pagination correctness.
Longest callback is 117 ms before / 133.3 ms after; longest task 120 ms in both arms.

## Experiment ledger: attempted is not shipped

| Suspect / approach                 | How isolated                                                                                                              | Conclusion / next boundary                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Avatar vs Markdown                 | Avatar off, Markdown off, both off; narrower highlighter controls and traces                                              | Removing avatars alone does not remove major stalls; synchronous native highlighting is a cause, not all Markdown formatting |
| Native highlighter scheduling      | Queued work, real Worker, plain-code fallback, bounded output cache                                                       | Promising experiment, not adopted; need supported renderer-owner seam and complete app-level A/B                             |
| T3 rendering cache                 | Frozen reference `8760d063e903406c8e8f695b0852c0a15fc1e00f`; completed React-tree and highlighter-cache source comparison | Adapt bounded completed-content reuse, not a blind package replacement                                                       |
| Existing Channel cache             | Actual Store warm return / eviction at 30/31/100 Channels                                                                 | Already caches 30 ready Channels; not a cross-unmount Markdown/DOM cache                                                     |
| Completed Markdown cache           | Source prototype, retention/heap/soak controls                                                                            | No accepted production integration or natural-GC peak/long-term bound                                                        |
| Streamdown / lowlight / Shiki      | Primary-source package/parity/security research                                                                           | Retain native MarkdownText baseline; package metadata is not measured speedup                                                |
| Attention aggregate/range/DISTINCT | Offline oracle, all-unread/shared-Source and actual-owner controls                                                        | Some candidates regress; do not adopt partial-unread wins or sum their gains                                                 |
| Activity / covering indexes        | Query/owner/concurrent controls                                                                                           | Latest activity candidate lacks full browser gate; source-cover collateral regressions retained                              |
| Purge retained references          | Actual Host/CLI batching controls                                                                                         | Separate candidate, not adopted; not evidence for normal scrolling                                                           |
| Sidebar / other Panels             | Data path measured; geometry-preserving Panel ablations planned                                                           | Full rendering/subscription isolation still pending                                                                          |
| Streaming output mode              | Existing identity optimization and network observations                                                                   | Real three-Bot growing streams + typing, and mode-switch behavior, still need acceptance                                     |
| Very large Markdown                | Pathological fixture distinguished from ordinary Group                                                                    | Document/file presentation is a product proposal, not implemented; ordinary messages still stall                             |

### Latest integration checkpoint

Actual BotMain message-list subtree gets a keyed experimental owner boundary; Sidebar, composer
and unrelated native Panels stay outside it. Eleven functional checks and a missing-wrapper
negative control pass. Six further checks execute the exact emitted Worker script through a
Node worker-thread adapter; two identity-negative Workers reject mismatched digests. This proves
integration behavior, not browser performance. Private renderer copies, module-factory facades
and loader transformations are application-defined diagnostics, not supported public DSH APIs.

Two real headed full-shell pilots use fresh complete shell builds and normal Host Client
manifest delivery, without API/Client-response interception. Both pass opening, scrolling,
typing/draft preservation and revisits. Cached owner observes one dispatch, two warm hits and
zero main-thread highlighter loads. Their viewports differ, so they are **not performance A/B**.
Both retain the same native teardown `syncInspectManifest has no active Connection` warning.

A subsequent matched three-arm batch (native / Worker without cache / Worker with cache)
planned five rotated blocks, 15 fresh trials. Eight completed; ninth failed writing evidence
with `ENOSPC`. All eight meet observed 1,500 ms gates but fail the necessary 60 Hz callback
gate. Do not pool partial arms, publish a formal five-per-arm gain, or call this smooth 60 FPS.
The analyzer deliberately requires all 15 results. Earlier invalid-focus, setup and audit
failures remain preserved rather than silently excluded from the record.

## Remaining gates and recommended order

1. Reconcile disk/resources before resuming; do not restart the failed batch as part of handoff.
2. Establish a supported native renderer/highlighter ownership seam. Reuse completed parsed
   content/output only with invalidation for content, locale, theme, security and source identity;
   do not persist partial-stream results or reuse stale links/permissions.
3. Repeat complete matched native / Worker-only / cached A/B, five interleaved runs per arm,
   same fixtures/source/runtime/viewport and real foreground native scrolling. Retain failures.
4. Bisect remaining layout/style/geometry/virtual-window costs after holding highlighting fixed.
   Five ordinary three-Bot, 60-round scroll passes already fail: longest callback median
   117.7 [116.7, 133.4] ms, longest task 129 [125, 131] ms. Fixture is 240 messages / 93,559
   characters, maximum 589 per message, not a 230k-character document. The measured 50-entry
   windows were explicitly preconditioned by a second Channel click; pagination was not tested.
5. Preserve Panel width/geometry while separately unmounting Channel-list subscriptions,
   freezing them, bypassing preview/timestamps, and freezing timeline while list remains active;
   then roster, Companions and other docked Panels. Do not ship diagnostic bypasses.
6. Cover growing three-Bot streams + typing, 49/50/51/220/9999 unread, rapid switching,
   bidirectional pagination, 30/31/100-Channel eviction, Purge/reopen and cold default preferences.
   Large-history Owner/reopen >1,500 ms and cold 112 px displacement remain unresolved.
7. Check natural GC/peak heap and Worker memory, not Node RSS alone or forced-GC reclaimability.
   Enforce zero jumps/gaps and measure opening separately from pacing. rAF cadence alone does
   not prove presented FPS. Guarantee actual 60 Hz before claiming untested 120 Hz.
8. Verify installed Desktop and then Human acceptance separately. Do not weaken integrity,
   foreign-key or recovery checks to make reopening faster.

## Checkpoint validation

On the handoff date, the seven focused unread/attention suites pass (26 tests), including the
new actual-query-plan guard and membership/read-floor controls. The guard requires the
Channel/revision index seek and rejects a full placement scan; it deliberately uses no flaky
wall-clock threshold. Root and mobile TypeScript checks, scoped lint/format, CI-plan structural
validation and bilingual release-ledger checks pass. This validation is
not a new browser run; the browser results above belong to their frozen experimental identities.

## Local evidence and safe continuation

The same-machine archive is the ignored `.humanlayer/tasks/desktop-160-perf/`. Start with
`SESSION-HANDOFF.md`, `NEXT-STAGE-GOAL.md`, `EDGE-CASE-MATRIX.md`,
`NEXT-STAGE-UNREAD-SQL-REPORT.md`, `NEXT-STAGE-RANGESQL-V2-REPORT.md`,
`T3-RENDERING-NEXT-STAGE.md` and `MARKDOWN-PACKAGE-RESEARCH.md`.
These local paths are an index, **not reviewer-accessible raw evidence** or a portable experiment
bundle. Preserve them for the next session; publish only privacy-reviewed derivatives to R2.

The failed browser batch's nine Hosts are closed. Its dependency-only cleanup finished
2026-11-02 06:30:28 UTC, preserving database/credential/config hashes and original seed.
Physical `df` available moved from 141,064 to 279,888 KiB during cleanup; APFS sharing and
concurrent work mean this is not an attributed logical reclamation total. Disk remains critically
low. The nine Profiles retain data but need dependency reconstruction before reuse. No shared
store, source, evidence or original seed was removed. The cleanup receipt and retained manifests
describe recovery. Do not replay cleanup without fresh ownership/process/reference checks.

The original branch/main checkout contains extensive unrelated dirty work. Stage exact files,
never all changes; do not reset it or copy generated artifacts into a production PR. The new
PR is a narrow checkpoint, not closure of the full #3214 goal or a second closure of #3248.
