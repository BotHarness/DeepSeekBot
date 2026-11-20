# Android chat performance baseline (R0 and R1)

Issue: [#3957](https://github.com/BotHarness/DeepSeekBot/issues/3957) · Spec: [#3955](https://github.com/BotHarness/DeepSeekBot/issues/3955) · Measured 2026-11-11 on the shared Android QA phone.

**Result.** R0 and R1 perform the same within run-to-run noise, and neither meets the 120 FPS bar. Paging into older history is the worst case: about 65 presentation intervals over 16.7 ms and about 330 app deadline misses in 25 s of fast flings, with a 33 ms p99. R1 is frozen as the comparison baseline for every native-timeline slice.

## Builds

| Arm | Source         | What it is                                                                                                       | APK SHA-256           |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------- |
| R0  | `9df0805707fd` | Main before the send flight (#3862), the Android latest anchor (#3910) and the RecyclerView experiment (#3941)   | `184a4eb62c4a…a8a2ff` |
| R1  | `559e21a4d81b` | Main with every Android chat experiment off (FlatList), plus the corrected FlatList send flight from this change | `a8ef55dc9beb…147296` |

Both are arm64 Release builds with production JavaScript and the development app identity (not debuggable).

## Workload and conditions

- Isolated Host with a fixed replay provider; no model. Scroll scenarios read a DM holding 240 generated Bot replies (218,346 characters, 39 tables, 44 code blocks; `android-chat-perf-workload.mjs 240`, SHA-256 `29f90218…62ad`) and 240 Human messages, frozen at revision 480. Every reply was checked byte for byte against the workload.
- Send and streaming scenarios use a second DM with 40 of the same messages. Streaming replays the 21,492-character `prose` fixture.
- 120 Hz display mode, system animations 1×, font scale 1, light theme, zh-CN. Battery 25.1 °C at the start and 27.8 °C at the end. No screen recording during measured runs.
- Order A/B/B/A/A/B, three runs per arm and scenario. One run (`b-3` cold paging) failed with an ADB timeout; it is kept as `cold-paging-failed-1` and was re-run at the end. Two pilot runs are excluded.

## Results

Median of three runs, R0 / R1. Intervals are between consecutive presented frames joined to SurfaceFlinger display frames.

| Scenario                                         | P95 ms      | P99 ms      | Intervals > 16.7 ms | App deadline misses | Dropped frames | PSS after (MiB) |
| ------------------------------------------------ | ----------- | ----------- | ------------------- | ------------------- | -------------- | --------------- |
| Cold open + 40 flings into older history (~25 s) | 16.6 / 16.6 | 33.3 / 33.3 | 64 / 66             | 326 / 347           | 10 / 11        | 503 / 577       |
| Warm fling, 16 drags (~16 s)                     | 16.6 / 16.6 | 16.6 / 16.6 | 10 / 12             | 70 / 60             | 3 / 2          | 502 / 533       |
| Back to latest after 10 flings (~5.7 s)          | 33.3 / 33.3 | 359 / 346   | 9 / 8               | 13 / 11             | 0 / 0          | 475 / 463       |
| Own send (~5.8 s)                                | 8.3 / 8.3   | 491 / 467   | 6 / 6               | 7 / 4               | 1 / 1          | 408 / 412       |
| Streaming at the latest message (~12 s)          | 8.3 / 8.3   | 13.3 / 16.6 | 7 / 10              | 14 / 16             | 0 / 0          | 499 / 527       |
| Reading history while streaming (~12 s)          | 8.3 / 8.3   | 16.6 / 8.6  | 6 / 5               | 21 / 12             | 4 / 2          | 539 / 536       |

## Reading the numbers

- PSS varies widely between runs of the same arm (cold paging R1: 577, 492 and 578 MiB; R0: 577, 503 and 492 MiB). The medians do not show a memory difference between the arms.
- Back to latest and own send have long idle stretches in which nothing changes and no frame is presented, so their p99 includes idle gaps and is not jank. Compare their over-16.7 ms counts instead. Blank frames on back to latest need a separate recording run and are not measured here; the blank flash reported by the Human was on the RecyclerView build, not on R0 or R1.
- End states were checked for every kept run: cold paging reached messages 132–143 (past the first page of 50), warm fling and back to latest ended at message 239, the own send was visible, streaming showed the replayed prose, and reading while streaming kept its position with the Jump to latest control offered.
- One phone and three runs per arm. These numbers rank variants on this device; they do not establish a production frame-rate claim.

## Reproduce

The capture pipeline and its isolated-Host setup are documented in [`apps/mobile/scripts/android-chat-perf.md`](../../apps/mobile/scripts/android-chat-perf.md). Raw traces, screenshots and per-run summaries stay in the private QA evidence directory.
