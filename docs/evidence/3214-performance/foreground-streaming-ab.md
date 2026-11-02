# Foreground streaming A/B on a real GPU

Issues: #3214 and #3277. Measured November 2, 2026 on a real Mac. It answers whether #3311 and #3313
reduce main-thread work while three Bots stream. It is a measured improvement, not a full #3214
acceptance. Per-run values are in `foreground-streaming-ab.json`.

## Arms

| Arm | Code                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------- |
| A   | `113651345`, main just before #3311                                                                                        |
| B   | `d460269eb`, main with #3311. It also carries #3312 (timeline window), the composer mention fixes and #1927 (Discord only) |
| C   | B plus `c4c19efb8`, the #3313 change, cherry-picked locally                                                                |

C is not the #3313 branch head. That branch is based on an older main without #3312, which changes
timeline rendering, so comparing it with B would mix two changes.

## Setup

- MacBook Air M3 (Mac15,12), 24 GB, macOS 26.7.1, on AC power. Both attached displays run at 60 Hz.
- Chrome for Testing 153.0.8010.36, headed and frontmost, with a 1440 × 813 viewport at scale 2.
- Isolated DSH 0.2.1-rc.3 Host. All arms share one Host home and one fixture: a 240-message
  code-heavy Group with three Bots.
- Three Bots stream live on `deepseek-official/deepseek-flash` at low effort while the composer
  types through synthetic keyboard input.
- Five blocks with rotated arm order and one run per arm per block. The window ends when all Bots
  have replied and settled, or at about 30 s. Twelve runs ended at 19–21 s. One run per arm ran the
  full 32 s and did not report `allBotsReplied`, so its per-second values are lower.
- The fixture gains about three replies per run; rotation offsets this. Other Hosts were running on
  the machine, with a 1-minute load of 2.8–8.7 at run start.
- Frontmost-app sampling showed the test browser except for 1–2 samples at launch. Occlusion was not
  checked directly; 58–60 rAF per second shows no throttling.

## Results

Median [min, max] of five runs per arm. No run failed and no page errors were recorded.

| Metric                                   | A                    | B                 | C                 |
| ---------------------------------------- | -------------------- | ----------------- | ----------------- |
| Forced layout from `shellPresent` (ms)   | 1790 [1545, 1802]    | 46 [35, 74]       | 49 [40, 67]       |
| Forced layout from `boundingBox` (ms)    | 42 [30, 49]          | 236 [232, 275]    | 0 [0, 0]          |
| CPU (ms/s)                               | 161 [120, 176]       | 84 [70, 90]       | 80 [69, 83]       |
| Main-thread busy                         | 0.242 [0.204, 0.257] | 0.183 [0.161, 0.191] | 0.181 [0.163, 0.183] |
| Style recalculation (ms/s)               | 106.2 [74.0, 118.2]  | 50.0 [36.6, 53.3] | 48.7 [34.5, 49.7] |
| Long frames per second                   | 1.01 [0.71, 1.05]    | 0.11 [0.06, 0.16] | 0.10 [0.05, 0.14] |
| rAF per second                           | 58.1 [57.7, 58.8]    | 60.0 [59.8, 60.0] | 59.9 [59.8, 60.1] |
| rAF gap p95 (ms)                         | 19 [19, 19]          | 19 [19, 19]       | 19 [19, 19]       |
| rAF gap p99 (ms)                         | 35 [33, 50]          | 19 [19, 19]       | 19 [19, 19]       |
| Input p95 (ms)                           | 72 [72, 72]          | 72 [72, 72]       | 72 [72, 72]       |
| Input delay p95 (ms)                     | 1 [1, 2]             | 1 [1, 1]          | 1 [1, 1]          |
| Input processing p95 (ms)                | 3 [3, 4]             | 3 [3, 3]          | 3 [3, 3]          |
| Input presentation p95 (ms)              | 72 [72, 72]          | 72 [72, 72]       | 72 [72, 72]       |
| Opening `readable` (ms)                  | 104.1 [82.7, 122.4]  | 109.9 [93.6, 115.2] | 97.3 [81.0, 114.0] |

## Reading

- **B against A:** every block improves p99, long frames, busy and style recalculation. The
  `shellPresent` drop is specific to #3311. The rest of the gain is not separated from the other
  commits in B.
- **`boundingBox` in A and B:** the rise from A to B is attribution, not a regression. In A the
  observer's layout absorbs the forced work, so the same layout is charged to a later caller in B.
- **C against B:** the move-menu change removes its forced layout completely, and CPU ranges overlap.
  Frame, busy and input metrics show no measurable difference at this scale.
- **Input:** p95 is about 4.3 frames in every arm, so it does not meet a one-to-two-frame target.
  Main-thread delay and processing are about 4 ms, and the rest is presentation.
- **Input floor:** the same synthetic typing on an empty textarea measured 32–40 ms, about two frames.
  Streaming adds about 32–40 ms to that. Its cause is not established, and the number is not a direct
  measure of user-perceived latency.
- **Opening:** ranges overlap, so no arm is distinguishable.

## Failures and limits

- Before these runs, the seed run and the first pilot failed. macOS ignores Chrome's `--lang`, so the
  Chinese UI did not match the script's English selectors. The browser was then launched with
  `-AppleLanguages (en-US)`. Both failures were kept and are not in the table.
- One preflight launch of arm B failed in 0.33 s and succeeded on retry. Its output was not kept, so
  the cause is not confirmed.
- The measurement script is a task-local tool and is not committed, so these runs cannot be
  reproduced from this repository alone.
- Not measured: the user's installed Chrome, the packaged desktop app, physical keyboard latency and
  channel switching under streaming.
