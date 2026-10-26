# iOS streaming investigation — 2026-10-18

Refs [#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845) and Android [#2133](https://github.com/BotHarness/DeepSeekBot/pull/2133).

**No renderer candidate is selected.** This change fixes production-JS profiling and records the experiments; it does not change the shipping iOS renderer, prove 120 FPS, or finish #1845. Android's measured presentation rate is not an iOS result.

## Repeated A/B comparison

A is main at `648c1202c44f5a5e82ce22596682934745705cef`. B adds only `streamingAnimation={streaming}` to the enriched Markdown view. The installed renderer uses that flag for both cached streaming measurement and tail animation.

Three runs per version, ordered **A B B A A B**, first with Hermes sampling, then with separate native Time Profiler captures. Each JS run starts in an empty fixture DM. Each native run starts with one prior fixed reply in the matching DM. Every run reaches one canonical reply exactly equal to the fixture. No video, accessibility polling or builds run during these measured windows.

| Median                             | A baseline | B native flag |
| ---------------------------------- | ---------: | ------------: |
| Hermes sampled busy time           |  10,704 ms |      5,790 ms |
| Hermes completeRoot inclusive time | 6,585.0 ms |    1,041.6 ms |
| JS requestAnimationFrame rate      |   59.6 FPS |      59.6 FPS |
| Native sampled JS-thread time      |  12,306 ms |      8,859 ms |
| Native sampled main-thread time    |   6,075 ms |      9,071 ms |
| Native sampled other-thread time   |   2,931 ms |      3,634 ms |

B improves the JS-only profile but raises main-thread sampled time by **49.3%**. Combined work does not improve, so B is rejected. The flag cannot be accepted from the JS result alone. Long JS frames remain near admission and completion; the largest in this repeated set is 106.7 ms. An uninterrupted middle section does not prove hitch-free completion.

[Per-run results](results.json) retain all six JS and six native measurements. CPU weights are sampled running time, not native frame rate or full-pipeline frame time. Do not add Hermes and native weights: they come from separate captures.

## Further screening pilots

These are **single-run screening results**, not repeated performance claims. They were stopped after an adverse result rather than promoted to an optimization.

| Pilot     | Change from A                                        |   JS busy | JS FPS | Nominal dropped frames | Frames >50 ms |
| --------- | ---------------------------------------------------- | --------: | -----: | ---------------------: | ------------: |
| A control | Original renderer                                    | 11,952 ms |   59.7 |                     22 |             5 |
| C         | Memoized native Markdown blocks                      | 11,079 ms |   56.0 |                    258 |            49 |
| D         | C plus measured viewport window                      | 11,462 ms |   59.0 |                    103 |             6 |
| E         | D plus native RN prose, enriched code/table fallback | 15,290 ms |   56.9 |                    207 |            44 |
| F         | E without viewport window                            | 17,620 ms |   54.3 |                    362 |            52 |

The [candidate source snapshots](candidates/) are research fixtures only, never imported by the app. B/C replace the generic Markdown module; D/E/F were tested as an iOS-specific module. These pilots do not establish comparative native CPU cost. C's native capture overlapped source checks and is excluded. The first D-labelled JS/native captures resolved the baseline generic module in Metro, so they are also excluded as candidate results. After restarting Metro with `--clear`, the iOS module and its entire source content were checked through the source map before the valid D/E/F pilots.

## Reproduction boundary

- iOS 26 Simulator, SDK 58.0.14, RN 0.88, enriched-markdown 1.1.1; Debug native binary with production minified JS from Metro. This is not a Release build.
- Installed native source identity: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; actual native build preceded its documentation-only commit at `f89d055d40fff7f3844bae28b1deb052477d32fc`. iOS native dependency/config inputs match the baseline. No native rebuild was needed for these JS experiments.
- Retained isolated Host runtime: `2202bef4d744893fddf66cdd0a6b0c58f710dfb6`, DSH 0.2.0-rc.2. Its mock provider and model plan were unchanged. This tests the real Host/DM transport with a fixed model response, not a live LLM.
- [Fixture text](fixture.txt): 10,849 ASCII bytes, SHA256 `4835489e8eb64b08e289240f50909d46c5621c88d5302fe3c57c1db783a48fe7`. Its prose and code are benchmark data, not product guidance.
- [Replay server source](replay-server.txt) preserves the exact mock algorithm: four characters of the JSON-encoded `channel_send` arguments per scheduled 16 ms timeout, without drift compensation. The trigger includes `Reply directly in this DM`. Tool completion does not send a second message.
- Start the mock only in an assigned isolated QA window. For example: `node --input-type=module - fixture.txt <reserved-port> 4 16 < replay-server.txt`. Configure only that isolated Host's test model. Keep authentication and machine addresses private.
- JS capture starts before the CLI send and ends after the send process plus 12 seconds of playback settling. `--quiet 3 --max 180`; source-map processing follows capture. The new `--no-react` mode records the full capture and reports `react: null`. Do not compare this window with development mode's first-to-last-commit window.
- Native Time Profiler captures run for 60 seconds; replay starts two seconds after recording begins. Pass `--device <assigned-simulator-udid>` when attaching to a Simulator process. Preserve native-tool warnings. The absent Hangs input-table warning does not turn CPU samples into hitch measurements.
- Repeat A/B on independent fixture DMs, verify exact canonical text after each reply, keep native and Hermes sampling separate, and inspect the selected source-map module before measuring a newly added platform file.

The submitted profiler was then exercised directly against another fixed DM reply on the restored baseline: `react: null`, explicit full-capture window, 59.6 JS FPS, 26 nominal dropped frames, six frames over 50 ms, 113.7 ms maximum. Canonical text matched. This validates the tool path, not a renderer improvement.

## Remaining acceptance

The available physical iPhone XS Max is 60 Hz. Simulator requestAnimationFrame measurements are nominally 60 Hz and cannot certify ProMotion. The installed Debug app already has `CADisableMinimumFrameDurationOnPhone=true`; the older issue's assumption that it is absent does not describe this installed binary.

Release **ProMotion** measurements remain required for streaming, long-history flings, and both at once. Record actual presentation rate, hitches over 8.3/16.7 ms, and hitch-time ratio. Recheck the Release binary's frame-duration configuration on that device. Physical-device performance, memory, thermal behavior, the large-text/theme matrix, and Human acceptance are not established by this report. VoiceOver is outside the Human's current requested scope.

Preserve the current renderer until an exact-build native result justifies a change. Do not merge a speculative port merely because Android's separate implementation measured near 120 presentations per second.
