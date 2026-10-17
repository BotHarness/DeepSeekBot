# Lark parent-video tracer — #1023 candidate

## Scope

This is the first video slice of [#1023](https://github.com/BotHarness/DeepSeekBot/issues/1023), based on merged file PR [#1943](https://github.com/BotHarness/DeepSeekBot/pull/1943). It does not finish the audio/video issue. A native text request that genuinely mentions the receiving App and replies to a native `media` parent carries its exact video descriptor and optional native cover. Generic files retain file semantics, even with an `.mp4` name. Direct native video/audio messages, audio playback and model understanding remain outside this slice.

The maintained Provider candidate is [dsh-im#31](https://github.com/DoodleBears/dsh-im/pull/31), source `f889a5808a342bb9b4abf586f115e57cb44b2b6b`. The development launcher pins its 421 runtime files with SHA-256 `02a4b38aaca218091e52bfa8a8b91be4c98f5d41458356ca9ecd0ee928633819`. The product's independently qualified Provider selection remains unchanged until native and installed-product qualification. No registry artifact has been published or deployed.

## Implemented path

The existing exclusive Provider Consumer negotiates `sourceVideos`, `sourceFiles` and optional `sourceImages`. Metadata enrichment verifies the exact parent in the original conversation/topic without downloading media. Native `duration` is preserved as milliseconds. Only an actual native image key associates a cover; no cover is generated.

Canonical Source Event → Channel placement projection → explicit **Prepare video** → authenticated attachment HTTP route → existing Human/source/identity/independent-path authority → bounded checked Provider resource → canonical AttachmentStore → original MP4 bytes → browser decode and manual native playback controls.

Video and cover share the existing three-request Client acquisition budget. Each request has a 30-second deadline and 25 MiB default limit. Unmount and authorization notifications cancel requests and revoke object URLs. Cover absence/failure is independent of playback. Unsupported byte formats and browser decoding errors retain the original download action. There is no runtime transcoding, automatic playback, model transcription or additional Bot attention/send authority. The mobile wire contract retains the new kind but presents only an original-file action and suppresses eager cover loading.

The final adjacent-surface audit found that the existing Bot Inbox source inspector automatically previewed every image and video descriptor. The Lark video and its cover now opt out of that loop; opening source metadata acquires neither. Both retain existing explicit original-download actions. The dedicated regression also retains the previously qualified WeChat auto-preview behavior, rather than changing another provider's scope.

`deepseekbot channel-media-download ... --representation playback` uses the same live Host route without the model. Omitting the flag still downloads the original; invalid representations and playback on the target-resolution command are usage errors. Both paths preserve coded refusals and refuse output overwrite.

## Regression checkpoint

- Provider: 60 focused tests passed; all Feishu tests passed 779 with five existing POSIX ffmpeg-fixture tests skipped on Windows. Build and package verification passed.
- Core and CLI: 22 tests passed, including video/cover projection, byte-exact original/playback reuse, no eager acquisition, restart, stop-before-acquisition, cached access after stop, unbind, wrong parent/resource/cover refusal, unsupported playback with original still downloadable, and explicit CLI representation.
- Client and mobile compatibility: 61 tests passed, covering explicit preparation, no autoplay, independent cover, loading/refusal/retry, late response disposal, identity-change cancellation, existing image/file/audio regressions and mobile original-only presentation. The first Client run failed two tests because their expected download label omitted “to this device”; the selector was corrected to the existing visible label and the full focused rerun passed.
- Production build and typecheck passed. Additional checks and native evidence will be appended as they complete.

The broader 90-test run passed 89 tests and timed out at the existing image unsupported/oversize case's 15-second limit. Its original failure is retained. After two additional video authority regressions were added, the entire Core media file passed all 17 tests serially, including that image case; no timeout was increased. The precise cause of the earlier timeout is unconfirmed.

A subsequent 47-test serial run passed 46 and timed out in the existing `messaging-attachments` wrong-source/replay test, followed by its 10-second temporary-root cleanup hook. This broader run is not green. The failure and cleanup timeout remain preserved; they are not attributed to the candidate or the environment without further evidence. The new video resource tests separately cover both declared and streamed oversize bodies and the independent cover decoding failure.

That exact wrong-source/replay case passed in isolation in 2.775 seconds, with its cleanup also completing; the other 20 tests were filtered out rather than counted as passed. The final Client video file passed all 12 tests, including an undecodable cover that leaves video available. Final format, lint/source policy/CLI parity, root/mobile typecheck and production build passed. The broader-run failures above remain part of the record despite these narrower successes.

The dedicated docs workspace build passed with 560 pages. The Windows top-level slides-spawn limitation already recorded for #1022 was not reclassified as a successful top-level docs command. Core [PR #1950](https://github.com/BotHarness/DeepSeekBot/pull/1950) is draft with a full CI run requested; CI and real-model scenario status are separate from local qualification. Provider [PR #31](https://github.com/DoodleBears/dsh-im/pull/31) remains draft. No #1023 merge was authorized or performed.

Full CI passed at head `a120639a8d915719ba85392d76ee0ac0ed3038f4` ([verify run](https://github.com/BotHarness/DeepSeekBot/actions/runs/38812593496)), including all three full test shards, lint/format/typecheck/build, docs site and isolated DSH smoke. Real-model scenarios were skipped. The subsequent Inbox source-inspector safeguard changes that head: its focused Inbox/video run passed all 23 tests, including existing WeChat video behavior and zero acquisition on opening Lark video/cover metadata. Final-head checks are tracked separately; the earlier CI result does not certify later code.

An isolated DSH 0.2.0-rc.2 Host passed authenticated doctor checks before and after a headless shell smoke. T3 was explicitly unavailable, so the repository verifier drove only the isolated Web shell; its empty Bot-mode screenshot was inspected and its console had zero issues. It is not video or native Lark evidence. The actual built product CLI returned one JSON `source-unavailable` refusal for both original and explicit playback requests to a nonexistent Channel, without creating output or calling a model. The private proof's initial expectation was `channel-unavailable`; it was corrected to the existing HTTP owner's source-refusal contract, with no product authorization change. This confirms live command/route operation only, not positive media delivery.

These are controlled automated regressions, not native rendering or playback evidence.

## Native gate

T3 reported an attached signed-in Lark tab, but reading it timed out. The required `preview_open` recovery then explicitly returned **No preview automation host is available**. The Human was asked to keep T3 Code connected. No #1023 QA2 receiver has started, no permissions changed, and the previously released QA2 receiver remains released.

After browser recovery, verify the Human account and designated QA2 group, inspect receiver ownership, prepare an automatic stop guard and coordinate the bounded window before binding. Upload a uniquely marked synthetic video through the native **Image & video** UI, quote that actual message and select the Bot from the native @ menu. Match the visible request/reply, Source Event, exact parent resource, Admission and Outbox facts. Verify zero managed media before preparation; then compare original bytes and hashes, manually play and check advancing decoded frames, pause/seek, refresh/restart and authority lifecycle. Capture matched light/dark before/after and a short recording. A missing cover is an observed metadata condition only when the native response actually omits it.

Native Lark intake, real playback, fresh installed-product E2E, live CLI execution, screenshots/recording and first-slice Human feedback remain pending. A successful API response alone will not close these gates. #1023 stays open; audio and other native shapes must not be expanded before the first working slice is reviewed.
