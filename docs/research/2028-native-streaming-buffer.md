# Native streaming text buffering and Android rendering

Date: 2026-10-17  
Status: source research plus a passing Android visibility regression; frame-rate qualification is separate.
Scope: Expo 57 / React Native 0.86.3 / `react-native-enriched-markdown` 1.1.1. This note does not claim that buffering alone fixes the reported disappearance of previously displayed text.

## Findings to apply first

Keep transport ingestion separate from presentation. Preserve every received draft update, but publish the visible tail at a bounded cadence. Keep stable message identities and unchanged row references; update the active draft row rather than rebuilding the historical messages. First verify the Android disappearance with clipping disabled and with native render logs captured. A smoother character effect must not hide a disappearing-content regression.

For the user's two local display preferences, streaming mode reveals buffered draft text while a complete-bubble mode keeps the typing indicator until a committed message is available. The preference must not change Host persistence, tool execution, or cancellation semantics. These are application recommendations, not behavior promised by the reference projects.

## What LobeHub actually does

The investigated revision is `lobehub/lobehub` main commit `6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3`. Its real implementation is [`packages/fetch-sse/src/fetchSSE.ts`](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts), not a Markdown-component animation alone.

- `createSmoothMessage` accumulates a character queue separately from the displayed buffer. Its `requestAnimationFrame` callback uses elapsed time to decide how much to release. The speed moves toward the greater of the configured starting speed and the remaining queue length, so a growing backlog speeds up presentation. The initial constant is 10 characters per second; it is not 10 model tokens per second. The inspected implementation splits JavaScript UTF-16 code units, which should not be copied blindly for emoji handling. [Queue and scheduler source](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L125-L241).
- The alternative buffered path collects text for 300 ms before notifying consumers; the `none` setting forwards chunks immediately. Text and reasoning have separate buffers/controllers. This is timed batching, not paragraph-based delivery. [Mode selection and buffers](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L257-L310).
- At successful completion it stops the animation and releases the remaining queue before `onFinish`. That avoids an arbitrary typing-animation tail after the network has finished. Error and abort behavior lives in separate branches; this source is a reference, not a lifecycle contract to copy into BotHarness. [Finish path](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L526-L590).

The useful idea is the separation of input rate and display rate with explicit completion. There is no evidence here that every response must wait for an entire paragraph or that 300 ms is the right cadence for our native renderer.

## What the installed Markdown renderer already provides

Upstream tag `v1.1.1` resolves to `c26cb0fb53e3fb483b337d885cc85dd553a2b170`; the locally installed package reports 1.1.1. Its compatibility table explicitly includes RN 0.86 for the 1.1.x line, and native platforms require Fabric. [Versioned README](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/README.md#compatibility-table).

`streamingAnimation` defaults to false. Enabling it fades newly appended text; it is not a transport buffer or a render-frequency limiter. With GitHub flavor, `streamingConfig` controls unfinished tables and fenced code blocks: progressive modes show usable rows/lines, hidden modes wait for completion, and code highlighting is deferred while the fence is open. These streaming modes are active only when `streamingAnimation` is enabled. [Versioned API](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/docs/API_REFERENCE.md#streaminganimation), [versioned streaming guide](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/docs/MARKDOWN_STREAMING.md).

The native wrapper routes GitHub flavor to a container renderer; CommonMark uses a different native text component. Changing flavor during a response would therefore change the native component, and should not be part of a smoothing strategy. [Native wrapper](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/src/native/EnrichedMarkdownText.tsx).

At inspection time, our `apps/mobile/src/ui/markdown-view.tsx` uses GitHub flavor and `remend(source)` for streaming, but does not pass `streamingAnimation` or `streamingConfig`. Therefore the already reported flashing cannot yet be attributed to that optional native fade. This is an observation of the local source, not proof of the device's currently loaded bundle.

## Android render, reconcile, and measurement paths

`EnrichedMarkdown.scheduleRender` parses and renders on a single-thread executor. A render sequence number rejects stale results on the main thread. Parsed segments are applied only after a result is ready; it does not intentionally clear the old result at the start of every update. However, an empty filtered result, parser failure, or caught rendering exception applies an empty segment list. Capture `EnrichedMarkdown: Render failed` alongside the video before concluding that clipping is the cause. [Android renderer](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/EnrichedMarkdown.kt#L367-L449).

The task's first deterministic Android film (`.humanlayer/tasks/2028-android-shell/perf/f1-film.jpg`, private local evidence) shows the large gray bubble retaining its geometry while the entire visible text disappears and returns without scrolling. The parent task reported no output from `adb logcat -d -s EnrichedMarkdown:E` during that run. This narrows the investigation to the native content subtree or clipping rather than the entire message row unmounting, but does not distinguish them conclusively. A stale-result guard can delay fresh text under heavy input; by itself it does not explain removing text already on screen. Parser-null results remain a silent clear path even without a logged exception.

The segment reconciler first reuses an identical signature and kind, including a moved unchanged segment; otherwise it updates an existing same-kind segment when possible. Only unmatched segments are created/removed. The container then attaches/removes necessary views and lays them out. This preserves unchanged native children, but does not make incoming Markdown parsing incremental. [Segment reconciler](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/segments/SegmentReconciler.kt), [container layout](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/segments/ContainerNodeView.kt).

GitHub-flavor Fabric measurement separately parses, renders, and measures segments to determine height. Its streaming shortcut reuses a cached size only when the filtered content hash and width are unchanged. Ordinary appended prose changes that hash, so each published update can still cause substantial measurement and native text work even when React only re-renders one row. [MeasurementStore](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/MeasurementStore.kt#L434-L551).

Optional tail animation uses a 150 ms span alpha animation and respects reduced motion. The GFM path records the previous displayed text length, updates the text view, and fades only the new tail; a newly created block receives a block fade. Structural changes or remounts can therefore produce different animation behavior from simple appends. Do not enable it as the first fix for disappearing old text. [Tail animator](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/utils/text/TailFadeInAnimator.kt), [GFM animation callers](https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/EnrichedMarkdown.kt#L533-L612).

Software Mansion also publishes `react-native-streamdown`: it repairs incomplete Markdown and moves processing to a Worklets Bundle Mode runtime. It requires additional Metro/Babel setup and dependencies, so it is an optional later optimization after profiling, not a zero-cost replacement for the existing `remend` call. [Official project](https://github.com/software-mansion-labs/react-native-streamdown).

## The inverted-list clipping hypothesis

RN documents that `removeClippedSubviews` defaults to true on Android and detaches offscreen native views. It explicitly warns of missing-content bugs, particularly with transforms and absolute positioning. This does not mean our exact issue has been proven to be an RN bug. It does justify an A/B test with `removeClippedSubviews={false}` for the inverted, growing-height chat list. Keep virtualization enabled and preserve its bounded render window; disabling clipping does not mean rendering all messages at once. [RN 0.86 list configuration](https://reactnative.dev/docs/0.86/optimizing-flatlist-configuration#removeclippedsubviews), [FlatList reference](https://reactnative.dev/docs/0.86/flatlist#removeclippedsubviews).

A JS row-render counter answers whether historical rows re-render. It cannot prove that a native text subtree remains visible during measurement or clipping. Conversely, unchanged React rows can still move and be redrawn when the active draft's measured height changes. Inspect the native frame and pixels independently of React commits.

## Earlier presentation proposal (superseded after Human QA)

The paragraph batching and settlement flush proposed below were rejected during Human QA. The current policy is a reserved, grapheme-paced conversation playback owner that drains through commitment; see [the follow-up investigation](2028-stream-playback-followup.md) and ADR-0219. This historical proposal is retained to explain the failed approach.

1. Store the latest received draft text immediately. Keep a separate visible prefix for the same draft identity. Do not enqueue one closure/timer per incoming token or duplicate transport state into a second persistent message authority.
2. In streaming mode, publish at most once per approximately 80 ms. Prefer a complete paragraph boundary within the pending suffix, but give an unterminated paragraph a maximum wait of approximately 160 ms. A long single paragraph, code fence, or table must not stall indefinitely. Publish a code-point-safe prefix; if using a typewriter cursor, use grapheme boundaries for emoji/combining marks.
3. Let elapsed time and backlog determine release size. A fast provider should produce larger releases rather than an unbounded animation queue. Record both received and visible lengths and their maximum delay. Keep first visible text prompt; do not wait for the first full paragraph.
4. Preserve message keys across draft-to-settled replacement where the existing timeline contract allows it. Keep already completed historical row references stable. Do not switch Markdown flavor or key on text length. Repair only the currently changing source; validate unfinished fences, lists, tables, links, and Chinese punctuation.
5. On settled, publish the exact authoritative committed body immediately and cancel pending work. A correction to the draft is allowed at this explicit transition; a generic append-only-prefix assumption must not discard committed corrections.
6. On error or disconnect, release the latest text actually received and expose interruption separately. Do not silently erase useful partial text, invent a completion, or leave a hidden queue that runs after unmount. On a later authoritative snapshot, reconcile from that snapshot. On switching Host/channel or replacing a draft identity, cancel its scheduled work so another conversation cannot receive the previous tail.
7. In complete-bubble mode, keep the pending/typing indicator without revealing draft body text; reveal each committed Channel Message independently. An agent turn can contain multiple bubbles, so waiting for the whole turn is a different behavior. A failed uncommitted draft stays an interrupted state, not a fabricated committed bubble.

## Verification needed before claiming smoothness

- Repeat a deterministic fixture with identical chunk text, order, and timing for baseline/fix: fast Chinese paragraphs, a long paragraph with no blank lines, emoji, unfinished code/table/list syntax, settled replacement, interruption, and multiple bubbles.
- Assert exact final content and bounded visible lag; count historical-row renders separately from the changing row. No published text should vanish during a pure append stream.
- Record device frame timing while streaming and while dragging the list. A stable 80 ms text publication cadence is compatible with a 120 Hz display, but does not prove 120 FPS: the UI thread must still render each required animation/scroll frame within its own deadline.
- Compare clipping on/off independently of buffering, inspect native render errors, and check fixed screen regions in captured frames. Do not declare the cause from a single FPS aggregate or a successful final screenshot.

## Local diagnostic evidence

The task-local replay sent a fixed 21,492-character Chinese Markdown response through a real isolated Host and its `channel_send` tool to the Android development app. A video pixel check sampled a fixed body region for six seconds, counting bright text only while the gray bubble remained present. The first recording had 116 nearly blank frames out of 184 sampled frames; disabling `removeClippedSubviews` still had 122 out of 180. Both checks failed. These are diagnostic recordings, not a completed performance comparison or evidence that buffering fixes the bug.

Subsequent isolated probes also failed with selection disabled and with native CommonMark. Replacing only the Android body with synchronous React Native text removed the disappearance. This locates the practical fix at the Markdown renderer/layout boundary; it does not prove a particular executor or native measurement race inside the dependency. An initial code/table implementation still produced empty gray regions until its horizontal ScrollViews used `flexGrow: 0`; this was a second, separately reproduced layout defect.

The source investigation itself changed no application code. The subsequent implementation keeps buffering and display preference local and adds no Host route, persistence owner, or model behavior.

## Passing native replay, 2026-10-17

The Android-specific renderer uses `marked` for parsing, `entities` for decoded text and React Native text/layout for supported Markdown. It preserves stable source-offset block keys; completed blocks are memoized while only the growing tail is repaired with `remend`. Both draft and settled bodies use that renderer. Images, HTML, spoilers and admonitions retain the native enriched path. Document-wide references stay in one source block to retain link definitions. iOS is unchanged.

The public replay is `apps/mobile/scripts/stream-replay.mjs`. It serves a loopback-only OpenAI-compatible endpoint, splits tool arguments at 80-grapheme boundaries on a drift-compensated 32 ms clock, and consumes each explicitly armed `runId` once. Follow-up model requests return `Done` without another Channel Message. Early diagnostic recordings used an older mock that could emit a second reply; the following accepted cases use the single-reply budget and verify the committed body through the real Host CLI.

The public pixel checker is `apps/mobile/scripts/check-stream-video.mjs`. Its fixed dark portrait region detects a large retained gray bubble with nearly absent bright text; it is deliberately a narrow regression detector, not a general visual-quality metric. The `rich` case uses a separate sparse-glyph threshold calibrated against a failing all-gray code/table recording. All windows below decode exactly 30 frames per second.

| Recording | Fixture and window                                                              | Result                                     |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| f8        | 21,492-character Chinese Markdown; 4–10 s                                       | 180 sampled frames, 0 blank frames; pass   |
| f9        | Long continuous paragraph, inline formatting, entities and family emoji; 4–10 s | 180 sampled frames, 0 blank frames; pass   |
| f10       | Rich formatting before horizontal-scroll layout fix; 5–11 s                     | 180 sampled frames, 180 blank frames; fail |
| f12       | Code (120 lines), table (40 rows), lists, quotes, links and emoji; 5–11 s       | 180 sampled frames, 0 blank frames; pass   |
| f13       | Complete bubbles, 3–8 s while receiving                                         | 150 frames, no large draft body; pass      |
| f13       | Complete bubbles, 13–17 s after commitment                                      | 120 frames, 0 blank frames; pass           |

The Complete bubbles setting was also checked after a force-stop/reopen without setting it again, then returned to Streaming. Static native capture confirms the rich replay's final table and `REPLAY_COMPLETE` marker. Component coverage checks exact code-copy text, reference links, entities, task lists and that appending to the tail does not render an already completed text block again.

Rechecking the earlier f4 native-renderer recording with the public checker gives 128/180 blank sampled frames in the same 4–10 second window; f8 gives 0/180. This retains a failing baseline for the committed detector. These recordings qualify the reported disappearance for these fixtures on the Android 16 QA phone. They do not establish 120 FPS, all enriched-only extensions, image loading, or iOS rendering. Keep the [native frame comparison](2028-android-streaming-measurements.md) separate from these visibility results.
