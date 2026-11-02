# Stream playback: reserve, semantic pacing, and committed-message handoff

Date: 2026-10-17  
Status: primary-source research and proposed local presentation policy; not an implementation or a test result.  
Related: [Native streaming buffer research](2028-native-streaming-buffer.md), issue #2028.

## Why this follow-up changes the earlier recommendation

The Human explicitly wants a genuine playback buffer: receive faster than the visible text is released, retain enough reserve to absorb short provider slowdowns, release graphemes progressively, and pause naturally at punctuation and sentence/paragraph boundaries. Fading an entire arriving chunk and publishing the latest full draft every 80 ms do not satisfy that requirement.

Consequently, the earlier note's suggestion to immediately flush all text on commitment is superseded for this streaming playback mode. Commitment closes the source and supplies the authoritative final target; it must not automatically consume the local playback queue. Complete-bubble mode still shows a committed bubble in one step. Both remain presentation preferences, with no change to Host authority or persistence.

## The exact LobeHub reference

The examined commit is `6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3`. This note does not extrapolate behavior from a moving main branch, an old issue, or the upstream Azure implementation.

The following are verified source facts:

- `createSmoothMessage` stores received characters in `outputQueue` and displayed text in `buffer`. One `requestAnimationFrame` loop accumulates elapsed time and releases a count of queued characters. Its default rate starts at 10; target rate is `max(startingRate, queueLength)` with a smoothed adjustment. Empty queue stops the loop. There is no reserve floor, startup prebuffer, punctuation classifier, or sentence-boundary policy. [Queue and scheduler](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L126-L237).
- Smooth text/reasoning have separate controllers. The other buffered mode publishes at 300 ms; `none` forwards incoming chunks. [Modes](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L257-L305), [text delivery](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L389-L415).
- The finish path stops both controllers, flushes timed buffers, then on an OK response flushes remaining queues before `onFinish`. Abort invokes `onAbort(output)` and stops the text controller in its error handler; finish handling can still run afterward when a response exists. [Abort/error](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L317-L349), [finish](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/fetch-sse/src/fetchSSE.ts#L526-L589).

Therefore reserve maintenance, semantic pauses, and draining after commitment are our proposed extensions. They must not be described as LobeHub features already adopted unchanged.

The helper at [`packages/utils/src/client/fetchEventSource/index.ts`](https://github.com/lobehub/lobehub/blob/6c7a6fb033e443bc27bf34cbd5509ab3db7f22f3/packages/utils/src/client/fetchEventSource/index.ts#L53-L109) passes the caller's signal to fetch, reads the response, and resolves after close or caught error. Despite retained interface comments about retry intervals, the inspected implementation has no retry loop, visibility listener, or explicit application-background policy. Browser `requestAnimationFrame` behavior is not an RN background-resume contract.

## What to borrow, and what to change for RN

Borrow the controller boundary: ingestion appends to a target; a single scheduler advances a visible cursor; the renderer receives only the visible prefix. Borrow elapsed-time accounting rather than a fixed character count per screen frame. React Native 0.86 exposes `requestAnimationFrame` and cancellation, but they share JS execution with application work; a frame callback alone does not prove smooth native rendering. [RN timers](https://reactnative.dev/docs/0.86/timers).

Do not copy these implementation details blindly:

- `split('')` splits UTF-16 units. Use the app's existing `unicode-segmenter/grapheme` helper for user-visible units, and retain source offsets for slicing. Code-point splitting alone still separates family emoji and combining sequences. The standard `Intl.Segmenter` model distinguishes grapheme, word, and sentence granularity, but availability on the actual Hermes build must be verified before introducing that dependency. [ECMA-402 Segmenter](https://tc39.es/ecma402/#segmenter-objects).
- Treat rate units as displayed graphemes per second, not model TPS. Token lengths differ by language and tokenizer.
- Keep a queue head/source offset instead of repeatedly shifting or splicing large arrays. Bound memory to the current response and its cursor, not one scheduled callback per received token.
- Clamp rate interpolation and per-tick elapsed time. A long JS stall or a foreground transition must not create a giant catch-up publication. This is a proposed safeguard rather than a guarantee of the reference implementation.
- Expose active state with a getter or derive it from the scheduled callback ID. A returned plain boolean captures its value at object construction; the reference's inner `startAnimation` guard is what actually prevents duplicate loops when the caller keeps attempting to start it.

The inspected queue source supports these observations, but it does not establish the best rate constants for our phone. Tune against deterministic recordings and measured render cost.

## Proposed reserve and semantic policy

These are initial design values for an experiment, not established best-practice constants or verified runtime behavior:

1. Start after a short prebuffer, for example 120–200 ms, or when a small reserve is already available. Cap first-character waiting so a slow source is not forced to produce a complete sentence first. Show the pending indicator immediately during this period.
2. Express reserve in playback time: `queuedGraphemes / displayedRate`. Aim initially for roughly 300–500 ms, bounded to a small grapheme count. A fixed reserve of 30 graphemes is approximately 500 ms at 60 graphemes/s; it cannot cover an arbitrary outage.
3. While source input is open, lower playback rate smoothly near the reserve low watermark and raise it when backlog grows above the high watermark. Estimate incoming rate with smoothing, but let queue occupancy and trend dominate; irregular chunk sizes must not make the visible pace oscillate per chunk.
4. Make pauses consume elapsed playback time: short at comma/colon, longer at sentence punctuation, longer again at a paragraph break. Give clustered punctuation such as `？！` one boundary pause, and do not add repeated delays to the closing quotation marks. Initial values might be 30–60 ms, 80–140 ms, and 140–220 ms respectively. These require Human review in Chinese and English.
5. Stop a release at the next eligible punctuation boundary and apply the pause before releasing beyond it. Otherwise a large accumulated release skips every semantic pause and simply appears as a chunk. Recognize fenced code/table structure and avoid prose punctuation pauses for every code symbol or table separator.
6. Release one or a few graphemes per visible publication at ordinary speed, with larger bounded releases only when catching up. A single frame scheduler can maintain fractional credit while the renderer publishes only when the cursor changes. Completed Markdown blocks keep their existing memoization; reparse only the changing tail where the current renderer supports it.
7. If the source pauses briefly, spend reserve rather than immediately stopping. If reserve runs out, stop cleanly at the last available character and retain the pending state. No buffering policy can guarantee continuous output after an outage longer than its finite reserve; it must never fabricate text.

There is an unavoidable tradeoff: keeping a fixed slow typewriter speed for an arbitrarily fast, very long response creates a long playback tail. A bounded catch-up rate, a readable maximum delay budget, and an optional explicit “show all” action are product choices. Do not satisfy a delay budget by silently dumping the entire queue at commitment after promising gradual playback.

## Commitment must not remount or bypass the player

Track source completion separately from presentation completion:

| Source state        | Presentation state                 | Meaning                                                                  |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Open                | Prebuffering / playing / waiting   | More draft data may arrive.                                              |
| Reconnecting        | Playing received reserve / waiting | Connection loss does not make received text invalid or imply completion. |
| Committed           | Draining                           | Exact final body is known; previously queued text is still being shown.  |
| Committed           | Complete                           | Cursor reached the exact final target.                                   |
| Failed or cancelled | Interrupted / draining by policy   | No fabricated successful completion.                                     |

On a matching committed body, keep the same visible cursor, replace the target with that exact body, release the reserve requirement to zero, and continue playback through punctuation pauses. Only when the cursor reaches the final target should playback become complete. Do not keep the UI's model-generation indicator active just to represent local draining; the model has already finished.

The current local source at inspection time removes `createDraftPresentation` as soon as its source draft disappears. The list also assigns a `draft:${draftId}` row separately from committed rows. Consequently a controller owned only by that draft row cannot drain after settlement: its unmount discards the cursor and a committed row renders the full body. The presentation owner needs to survive above that row and associate the existing draft with its canonical committed message through the established settle identity, while suppressing duplicate draft/committed rendering. This is a source-level observation, not a runtime test result.

If final text differs from the draft, compare against the already displayed prefix. A correction wholly inside the unrevealed suffix can replace that suffix without a visual jump. A correction to already shown text requires an explicit reconciliation rule: display the authoritative correction once, retain the longest valid grapheme prefix/cursor, and continue remaining playback. Do not append stale queued text after a corrected final body, and do not discard the authoritative result to preserve an animation.

Each committed bubble must remain independent. For a turn producing several messages, preserve ordering and bounded pending playback without waiting for the entire turn. Reopening historical messages should show their committed bodies directly rather than replaying them as new streams.

## Background, cancellation, and lifecycle traps

Use RN `AppState` for active/background transitions; Android also exposes blur/focus, including notification-drawer blur without an AppState change. [RN AppState](https://reactnative.dev/docs/0.86/appstate#events).

- On background or screen detachment, cancel the visual scheduler and save its cursor in the bounded conversation presentation owner if the session remains relevant. Keep transport/reconnect ownership where it already lives. Do not make screen visibility implicitly cancel the Bot.
- On returning, reconcile the latest authoritative snapshot, reset the scheduler timestamp, then resume the retained cursor. Do not apply the entire background duration as playback credit. Explicitly decide whether a long absence resumes the current response or shows settled history; neither should happen accidentally through unmount.
- A temporary disconnect can continue playing already received reserve and then wait. It should not automatically flush to the latest received body or mark the message successful. A later snapshot may supply a larger or corrected final target.
- An explicit stop action needs its own policy. Stop network/model work promptly through the existing action. If it is intended to stop visual playback as well, cancel the scheduler and show the received partial content as interrupted; do not keep a hidden animation running against user intent. If previously received content should drain instead, make that deliberate and keep the stopped source state separate.
- Unsubscribe exactly once, cancel frame/timer callbacks, and guard them with a generation identity. A reused component or Host/channel switch must not publish a previous response's tail into a different conversation. Mode changes also need a deliberate transition: complete-bubble mode suppresses draft playback, while switching back must not replay already viewed history.

## Verification this proposal still requires

This research makes no implementation, native-rendering, or performance claim. Before acceptance, replay identical inputs covering a fast burst followed by 200/500/1000 ms pauses, slow initial input, punctuation clusters, long text without punctuation, fenced code, emoji split across chunks, reconnect, explicit stop, background/resume, several bubbles, and committed-body corrections.

Assert exact final text, grapheme-safe monotonic release during ordinary appends, retained reserve while input is healthy, bounded startup delay, distinct punctuation pauses, and continued incremental release after commitment. Record input, queue depth, cursor, playback rate, and source/presentation state with bounded metadata only. A native video must show the expected progression; unit timing checks alone do not prove the result appears natural. Keep the existing missing-text regression and native frame-time qualification separate.
