# GenUI verification matrix

## HTML document candidate

The version-2 isolated HTML implementation shipped in PR #3699. Current-main Web qualification is tracked in #3703, independent execution/resource containment in #3704, and installed mobile in #3705; the cross-platform parent #3684 remains open. Closing implementation tickets #3685/#3691 did not turn their outstanding acceptance checkboxes into passes. Run the production-shaped HTML journey against a task-owned Host:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json \
  node scripts/e2e-genui-documents.mjs --out <private-evidence-directory>
```

It creates a synthetic Bot, invokes the model-free `genui_preview` Tool, explicitly publishes the document, and drives its actual isolated frames. It closes its own browser; the caller owns the Host. Default captures are headed. Keep every failure in its original run directory.

Add `--with-model` to require a real model-generated linked HTML follow-up after the visible Human continuation. This opts into real provider work on the newly created synthetic Bot. The runner requires the canonical Source Event, correct Channel/Bot/predecessor, and an ordered successful preview/publication in the actual orchestrator trace whose committed message ID matches that canonical message. A direct Tool run, a text-only reply, an earlier message or unrelated Bot does not satisfy this gate. The new message must also render in the actual conversation. The deterministic default is not model acceptance, even if a background model happens to reply.

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json \
  node scripts/e2e-genui-documents.mjs --pele --with-model \
  --out <private-evidence-directory>
```

The model evidence covers explicit publication of a linked generated document; it does not imply model reliability for every possible document. Inspect the retained preview diagnostics and failures separately. Neither successful model calls nor synthetic screenshot coverage clears #3704 or the independent foreground-performance/native/Human gates.

Add `--faults` for live bridge replay/oversize/unknown/mount checks, failed-save
recovery, uncertain-response deduplication and scoped Content Purge while open.
The two transport failures are explicitly injected in the task browser: one rejects
before a save request; the other drops the response only after the actual Host
reports a successful Human-message commit. They are controlled fault fixtures, not
evidence of a naturally occurring network outage. The retry must reuse the same
Human message ID and leave exactly one canonical message. The runner pauses/stops
its own synthetic Bot before this stage, resumes it only for the eligible DM
submission, then pauses/stops it again. The ended-Group purge API intentionally
refuses a DM. Use the scoped DM message-cleanup preview/confirm owner instead,
with an exact Channel and a cutoff just after the original document's canonical
creation time. Assert exactly one candidate before confirmation and one deletion
afterward; never widen the scope to get a passing result.

The public `channelMessages` projection intentionally does not expose `channelId` or `sourceEventId` on every message. The verification runner correlates its already-authorized scoped read with read-only Source Event/placement and Human-request Admission evidence from its own isolated Profile. This is observation only, never a write bypass or another message store. The orchestrator trace must be non-`direct`, and its committed result must identify the very same canonical message.

| Content or interaction               | Required evidence                                                 |
| ------------------------------------ | ----------------------------------------------------------------- |
| Composed document                    | Readable ordinary summary plus rich HTML                          |
| Metrics, comparison, table           | One screenshot per independently selected scene                   |
| Bar, line, donut                     | SVG rendering with readable equivalent labels                     |
| Flow, relationships, timeline        | One screenshot per diagram/content scene                          |
| Filter, no matches, numeric sort     | Visible result and bounded canonical private state                |
| Selection and details                | Local changes without Channel messages                            |
| Reopen and another authorized Client | Restored exact snapshot values                                    |
| CAS conflict and explicit save       | Draft retained, no silent overwrite                               |
| Reset, Continue and Refresh          | Trusted controls, visible Human message, appended linked snapshot |
| Light, dark and narrow Web           | Actual theme and viewport recorded, never called native evidence  |

These nine fixture scenes are examples of arbitrary self-contained documents, **not** nine protocol component types or exhaustive coverage of possible HTML. New supported journeys extend the fixture and scene index. Approval/Question/private-input owners remain separate.

Run `BH_GENUI_BROWSER_QA=1 pnpm exec vitest run packages/core/test/genui-html-browser.test.ts --maxWorkers=1` separately for real Chromium loading and blocked fetch, image, stylesheet, frame, form, navigation, refresh and popup requests. It does not intercept requests to manufacture a pass. Unit tests cover checked bridge messages, retained drafts, stale instances, retries and owner limits. None replaces installed WebView or desktop-shell validation.

**Unresolved execution boundary:** iframe sandbox/CSP restrict capabilities, not CPU or memory. The heartbeat, startup deadline, height/message limits and reload state do not guarantee recovery when generated code blocks the Client event loop. Hard independently interruptible execution/memory containment remains a release gate; do not run untrusted runaway-script fixtures in the Human's daily browser or claim the candidate is production-qualified.

## Offline Pele and default-style slice (#3691)

Add `--pele` to `scripts/e2e-genui-documents.mjs`. Before publication it invokes the real online `genui_diagram` Tool through the existing CLI, five times for each frozen flowchart/sequence/XY fixture. It checks stable SVG identities, records CLI durations and embeds exactly those SVG bytes into the ordinary v2 document. Extra selectable scenes retain the original nine examples and all existing interaction checks. It captures each compiled scene in light/dark and wide/narrow Web with explicit captions, CJK and numeric data equivalents, and checks borderless grouping and theme-token mapping.

These compiler/CLI timings are not a Pele-versus-Mermaid comparison or foreground timeline measurement. SVG scales without promising exact narrow-device re-layout or loaded-font measurement. Images remain private staging for the future PR; final-head binding, privacy review, R2 publication/readback and GitHub rendering verification are still required. No native qualification is implied.

## Historical version-1 report candidate

Use this matrix for #3685. A passing parser, unit test or publication RPC is not evidence that a report renders or that an interaction works in the Web Client. Test through the existing canonical publication, private-view and ordinary Human-message owners.

## Run the Web journey

Launch and authenticate a task-owned Host using `verify-app` and the verification resource cleanup runbook. Use a synthetic Bot and no customer data. Then run:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json \
  node scripts/e2e-genui-reports.mjs \
  --bot <synthetic-bot-slug> --out <private-evidence-directory>
```

The browser is headed by default. `--with-model` additionally requires a configured test Bot and an actual explicitly published model reply; the default does not qualify model behavior. The runner publishes synthetic messages and ordinary Human submissions to the designated test DM. It closes its own browser in `finally`; the caller owns Host cleanup. Retain failed runs and diagnose them before rerunning with a fresh evidence directory.

## Scene coverage

| Scene                     | Visible evidence                                                                    | Canonical or automated check                               |
| ------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Catalog composition       | Metric, table and bar-chart in an ordinary message after its summary                | Complete bounded report published by the real direct Tool  |
| Each component alone      | Metric-only without an unwanted table; table-only; chart-only with equivalent table | Expected component presence and absence                    |
| Filter and no matches     | Matching row; readable empty state                                                  | Exploration does not append Channel messages               |
| Numeric sorting           | Numeric order, not lexical order                                                    | First visible row                                          |
| Details and selection     | Expanded details, checked rows and selection count                                  | Stable row IDs in private state                            |
| Keyboard                  | Space toggles the focused checkbox                                                  | Host recovers the selected ID                              |
| Another authorized Client | Same saved view on the same Host                                                    | Exact report and CAS version                               |
| Concurrent edits          | Stale Client retains its own draft and shows conflict                               | No silent overwrite; explicit keep/load/save               |
| Reset                     | Filter, selection and other view controls return to defaults                        | Host state matches the reset                               |
| Continue                  | Ordinary visible Human message, then optional real model reply                      | Exact report/snapshot/selection and canonical Source Event |
| Refresh                   | New linked report, old report retained                                              | Fresh snapshot identity and predecessor message            |
| Empty and signed data     | Zero rows; negative/zero/positive/decimal bars around zero                          | Equivalent readable data and bounded bar geometry          |
| Escaped text              | Literal markup in a metric, never executable content                                | Text rendered by trusted React components                  |
| Maximum dataset           | 100 rows, 8 columns and 20 selected rows                                            | Further unchecked rows disabled; no truncation             |
| Presentation              | Wide/narrow Web, actual light/dark theme                                            | Viewport/theme recorded per capture                        |

The three T1 catalog components are metric, table and bar-chart. Approval, Question and private-input cards retain their existing owners; they are not GenUI catalog components. Catalog expansion requires extending this matrix and the runnable journey in the same change.

## Separate remaining gates

For a foreground diagnostic, `scripts/perf-idle-timeline.mjs --headed --foreground-scroll --trace` records native trusted wheel input, focus/visibility, sampled gaps/anchors, bounded rAF diagnostics and a separate compositor trace. `--foreground-scroll` refuses headless mode. Its sample checks are not a full zero-jump proof, presented FPS, or a performance acceptance verdict. Use a frozen fixture and at least three interleaved baseline/candidate runs, inspect compositor evidence and real display identity, and retain busy-machine failures instead of relaxing budgets. The existing headless default remains a structural/idle diagnostic for CI.

Record pass, fail or untested for every layer, never a blanket end-to-end claim:

Headed runs disable Puppeteer viewport emulation and fit the actual native window to
the display's available bounds. The summary records inner/outer dimensions, native
window bounds, display coordinates and actual device pixel ratio. Oversized emulated
viewports and off-screen native bounds fail calibration; do not count a clipped
1440px emulation in a smaller window as fully visible foreground evidence. This
calibration does not prove compositor presentation or exclusive machine ownership.

- Focused automated coverage: malformed/oversized/versioned reports, forged selections, publication failures, idempotent retries, dirty-draft remounts, access loss and canonical Content Purge.
- Additional real Web fault journeys: failed saves, uncertain-response retry, access revocation and purge while a report is open. Unit coverage does not qualify these browser scenes.
- Accessibility: keyboard selection is narrow evidence, not full keyboard navigation, screen-reader or large-text acceptance.
- Performance: matched base/candidate ordinary-history journeys plus separately budgeted added report work, at least three interleaved runs, foreground scrolling and zero jumps/gaps. Timing under shared machine load is not qualification.
- Dynamic-height recovery: `packages/client/test/timeline-window-recovery.test.tsx` reproduces the all-gap window after cached geometry becomes stale. The existing timeline owner retains a measurable edge group so later measurements can recover. This correctness guard is not frame-pacing or performance qualification.
- Desktop shell, installed iOS, installed Android and Human acceptance remain separate. An 800-pixel Web viewport does not qualify a mobile application.

## Animated foreground scroll protocol

The timeline driver's legacy `--animate` starts its synthetic CSS animation **after**
scrolling and measures animated idle work; it does not qualify scrolling with an active
visual animation. The driver now labels that schedule `timeline-idle-v1`; older manifests
without this field remain unchanged legacy evidence, not retroactively relabelled runs.
For a separate matched animated-scroll batch, add
`--animate-scroll --animate --foreground-scroll --headed`. This records
`timeline-animated-scroll-v2`, starts the same animation before scripted and native-wheel
scrolling, requires it to be running at the foreground segment's boundaries, and includes
user-timing start/end markers in the trace. The unchanged heap endpoint and budget still
apply. Do not pool the two protocols.

Active-animation assertions, zero sampled gaps and rAF cadence do not establish presented
FPS. Retain compositor traces, source/browser/build identities and at least three interleaved
base/change pairs. Distinguish Chromium's presentation feedback, diagnostic-observer cost,
physical display behavior, opening latency and installed-native acceptance.

## PR evidence

Mounted conversation DOM is not proof that the conversation is visible. At responsive
breakpoints the Messages list can cover the conversation while its DOM remains mounted.
The HTML runner reopens the conversation after resizing, requires a frontmost viewport
hit-test, and rejects captures whose document section does not intersect the viewport.
Earlier narrow captures without these assertions must be inspected and cannot establish
narrow GenUI acceptance merely because the runner exited successfully.
Navigate by the visible Channel row's exact `data-channel-id`, including DM contacts;
do not substring-match the Bot name against arbitrary buttons, because call controls
also include that name. Failure screenshots are retained as observations even when
the conversation is hidden, and are never counted as verified content captures.
The runner pauses its own synthetic Bot before stopping its activity in `finally`,
so queued model continuations cannot silently outlive a run. Cleanup failure fails
the run and is retained separately from the original failure. A busy preview remains
a refusal, not a passing render; do not raise its timeout to obtain a green result.
Document titles are not unique. Scope rendered-content checks and screenshots to the
canonical message ID, particularly when a model reuses its predecessor's title.
Capture records retain the matched message ID and selector; verify the document is
still in the viewport after layout settles, not just before scroll/window updates.

Keep PNG originals, ARIA observations and the manifest under the task's private evidence directory, with an index in the machine's main checkout. Preserve source SHA plus dirty diff identity, built Host/Client hashes, browser identity, fixtures, canonical references, capture times, viewport and theme. Bind any pre-commit capture to the final source only after verifying production source and bundle identities have not changed.

For a separate natural-GC diagnostic, run the same frozen performance driver and fixture
with `--trace --heap-observe 30` in at least three interleaved baseline/change pairs.
The driver retains raw boundary samples in `<label>.heap-observation.json`, including
browser timestamps when available, then observes an untouched fixed window after the
original idle endpoint and before typing. It never forces GC or replaces that endpoint
with a later minimum. The unchanged budget still uses `heapMB` (rounded decimal MB,
bytes divided by 1,000,000, not MiB). Correlate samples with natural GC events in the
trace; no observed major GC means the resident-memory question is inconclusive.
This diagnostic adds observer overhead and changes the subsequent typing phase; it is
not a replacement for the canonical performance qualification or a passing result for
an earlier budget failure. Do not combine it with CPU profiling.

Inspect every selected image for secrets, login URLs, private content and misleading clipping. Retain failed attempts separately. Publish only reviewed derivatives through the repository's R2 evidence publisher with the full frozen source commit; never commit screenshots or use a Git evidence branch. Verify public readback, retain upload receipts and put representative images plus a complete scene index in the PR Change outline. Verify GitHub-rendered images after writing the PR. An absence state captured in the candidate is labelled as such, not passed off as an older source build.
