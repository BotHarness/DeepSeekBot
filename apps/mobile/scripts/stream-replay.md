# Fixed Android streaming replay

This local QA provider sends deterministic content through a real isolated Host's existing `channel_send` tool. It does not replace the Host or inject fake chat events. Use the shared Android batch lease and an isolated QA Profile, never a production provider or a private conversation.

1. Create a private, gitignored control file containing the designated QA Bot slug. Start the loopback server in a separate terminal:

   ```sh
   node apps/mobile/scripts/stream-replay.mjs --port 39210 --control <private-control.json> --log <private-metadata.jsonl>
   ```

2. In that isolated Host only, configure an OpenAI-compatible QA provider with base URL `http://127.0.0.1:39210/v1`, a dummy local credential, and model `qa-replay`. Apply it to both the orchestrator and assignment routes of a dedicated QA Bot. Model configuration uses the existing Settings/CLI owner; no real provider key is needed. Read `/health` to check fixture lengths and timing.

3. Restart the development app between isolated runs to avoid accumulating QA navigation screens. Open that Bot's DM, wait until the conversation is live, hide the keyboard, choose the dark portrait theme and leave the list following the latest message. Arm exactly one reply immediately before the send:

   ```json
   { "slug": "<qa-bot-slug>", "fixture": "prose", "runId": "<fresh-uuid>" }
   ```

   Fixtures: `prose` (21,492 UTF-16 characters), `long` (continuous paragraph, formatting and emoji), `plain` (continuous plain paragraph ending in `PLAIN_REPLAY_COMPLETE`), `rich` (120 code lines, 40 table rows and other formatting), `gentle` (short Chinese prose at 3 graphemes / 100ms), `rhythm` (article, fast initial burst, 800/600ms extra input gaps and a slower middle), and `smoke` (short protocol check). Except for `gentle` and `rhythm`, the server splits JSON tool arguments at 80-grapheme boundaries on a drift-compensated 32 ms clock. A `runId` is consumed once; tool completion and follow-up requests return `Done` without sending another message. An unarmed file has no `runId`. The bounded in-memory consumed-ID history holds 64 runs; use a new UUID for every run.

4. Start an 18-second native recording with the shared QA helper; after approximately 700 ms, send a marked message with `deepseekbot send <slug> --body AX_FLICKER_FIXED --timeout 45` in another terminal. Keep authentication in the existing private environment/token-file adapter. Keep the returned canonical reply privately and verify exactly one expected body. Do not open a sheet or scroll during the visibility recording. For performance, run a separate, explicitly observed drag and record native frame timing.

5. Check the native video and read it visually:

   ```sh
   node apps/mobile/scripts/check-stream-video.mjs --video <native.mp4> --case streaming --start 4 --seconds 6 --out <private-result.json>
   node apps/mobile/scripts/check-stream-video.mjs --video <rich.mp4> --case rich --start 5 --seconds 6
   node apps/mobile/scripts/check-stream-video.mjs --video <complete.mp4> --case complete-wait --start 3 --seconds 5
   node apps/mobile/scripts/check-stream-video.mjs --video <complete.mp4> --case complete-ready --start 13 --seconds 4
   ```

The checker requires `ffmpeg`. It scales a portrait frame to 244×542 and samples a fixed gray-bubble/bright-text region. Streaming/ready cases require bubble coverage in at least 90% of the full window and no nearly blank text frames. `rich` has a separate sparse-table threshold; the all-gray regression still fails it. `complete-wait` requires no large draft body and must be paired with the ready check and verified app/chat foreground. Different themes, layouts, delays or fixtures need a separately calibrated check; do not move thresholds merely to pass a recording. These checks detect the reported disappearance, not grammar, all image/native extensions, naturalness, exact content, or 120 FPS.

For reserved playback, keep recording beyond Host commitment until the final displayed glyph: `deepseekbot send` completing does not mean local playback is complete. `rhythm` changes provider cadence, not video speed. End metadata retains at most 64 relative chunk timestamps to verify injected gaps. Pair native playback traces (received/cursor/pending/phase) with the canonical final reply; a stable body-only video checker does not prove natural pacing.

Metadata records include a Unix-millisecond `at` timestamp. Align playback measurements with the first `start` record whose `reply` is true; CLI startup and Host setup can precede it. Retain producer chunk timing/max lag separately from rendering timing. For native frame comparisons, keep the same build mode, refresh-rate setting and mirror configuration, collect early and late active windows, and perform screenshots/accessibility dumps after the measured intervals. Record first observed complete content as an upper bound when polling cannot identify the exact last-glyph frame.

On Android, verify the active physical/render mode through `dumpsys display` after each install and during the tested interaction. A peak-refresh setting of 120 Hz can still run the app at 60 Hz after idle or an install. Reject mixed-mode A/B comparisons. If the assigned device runner temporarily pins the minimum refresh rate for a controlled benchmark, record its original value and restore it afterward. Keep display probes outside measured windows, and use native FrameTimeline/vsync evidence to check the captured mode. FrameTimeline end-to-end latency includes pipeline waiting and is not the same as main-thread execution time.

Measure app-associated presentation intervals inside a sustained scrolling or fling interval when qualifying scroll FPS. A stream's presentation count also includes intentional punctuation pauses and idle time, so it is a content-update rate rather than a scroll-FPS result. Use identical Release builds, fixed input and ABBAAB with three runs per version. Preserve history-reading anchors and full canonical replies separately from performance results.

Keep raw recordings, replies, control files and metadata in the batch's private evidence directory. Publish only redacted QA evidence. Stop this exact provider process and remove only its task-owned provider/preset/Bots when the batch owner ends the fixture run; keep shared resources and unrelated QA data intact.

For the history-reading regression, use a separate replay: begin a drag toward older text while the prose is growing, then wait for inertia to stop. The displayed prefix must hold while the canonical reply continues receiving and commits; earlier paragraphs must stay at the same screen position. Native header removal can legitimately change raw scroll offset, so compare the same visible content anchor, not offset alone. A layout callback near zero must not resume following. Tap Jump to latest or deliberately finish a return gesture at the bottom and verify playback resumes. While a chat covers Chats, its roster/Inbox view subscriptions should not continuously rerender the hidden channel rows; returning must show current data.
