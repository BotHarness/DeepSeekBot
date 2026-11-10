# Android chat performance capture

`android-chat-perf.mjs` measures the conversation screen of a **Release** build on the shared physical Android phone. It is the comparison pipeline for the native timeline slices of [#3955](https://github.com/BotHarness/DeepSeekBot/issues/3955): every slice is compared against the frozen R1 baseline with the same workload. Read [Windows Android QA](../../../docs/agents/android-device-qa.md) first; every command needs the runner's active phone lease.

## Commands

```sh
node apps/mobile/scripts/android-chat-perf.mjs prepare --owner <task> --batch <batch> --queue <queue-root> \
  --apk <app-release.apk> --receipt <receipt.json> --conversation "<QA conversation title>" --out <arm-dir>

node apps/mobile/scripts/android-chat-perf.mjs capture --owner <task> --batch <batch> --queue <queue-root> \
  --scenario warm-fling|cold-paging|back-to-latest|own-send --label <arm>-<run> \
  --config apps/mobile/scripts/android-chat-perf-frames.pbtxt --conversation "<title>" --out <arm-dir> [--marker <text>]

node apps/mobile/scripts/android-chat-perf.mjs analyze --dir <arm-dir>/<label> --trace-processor <trace_processor_shell>
```

`prepare` refuses an APK whose hash differs from its build receipt and a debuggable package. `capture` runs the scenario's setup outside the trace, records device state, memory before and after, the FrameTimeline trace, the final screenshot and UI tree, and the uptime window of the measured gestures. `analyze` joins each app frame to its SurfaceFlinger display frame through `display_frame_token`, so presentation time is the screen's, not the app slice end. It rejects a trace that does not cover the window or multiplies frames, and reports presentation-interval P50/P95/P99/max, intervals over 8.3 and 16.7 ms, app deadline misses, dropped frames and PSS.

## Scenarios

| Scenario         | Setup (not measured)                              | Measured                                                  |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `warm-fling`     | 16 drags to load and return to the latest message | 16 matched drags over loaded history                      |
| `cold-paging`    | Force-stop, launch, open the conversation         | 14 fast flings toward older history, including page loads |
| `back-to-latest` | 10 fast flings toward older history               | Tap Jump to latest and 2 s of settling                    |
| `own-send`       | Focus the composer and type `--marker`            | Tap send and 2.5 s of flight and commit                   |

Streaming replay is not part of this script: it needs an isolated Host with the fixed provider in [stream-replay.md](stream-replay.md), coordinated with the Host owner.

## Rules

- Same phone, Release with production JavaScript, same frozen conversation, font scale, theme, refresh mode and animation scales on both arms. Record and restore the animation scales the device started with.
- Alternate arms A/B/B/A/A/B, three valid runs each. Keep invalid samples and say why they are invalid; never keep only the fastest run.
- `own-send` changes the conversation. Run it in a separate QA conversation so the scroll workloads stay frozen.
- No screen recording during measured runs. Blank frames on `back-to-latest` are judged from a separate recording run.
- A gesture command exiting successfully is not proof of movement: compare the before and after screenshots and the frame count.
