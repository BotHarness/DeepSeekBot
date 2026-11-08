# ADR-0304: Call frames are harvested into a timeline without loss

- Status: Accepted (T2)
- Date: 2026-11-08
- Issue: #3690 (spec #3688; supersedes the record list of ADR-0288 and the frame picking of ADR-0303)

## Context

A call grid holds at most nine keyframes (ADR-0303). Until now a sentence with more kept the first and the eight biggest changes and dropped the rest, a long silent stretch became frame records only in fixed blocks, and the next sentence listed those records in `voiceCall.visual.records`. Walking and talking with the camera lost frames for good, the list grew with every silent stretch, and the Bot had no time range to look things up by.

## Decision

**One harvest owner.** `packages/core/src/voice/harvest.ts` holds the pending keyframes of a share and only plans; the call owner composes and writes what it hands out. Pending keyframes keep only the newest 9 for the next sentence. Older ones are written oldest first as frame records (commits) of 9; the last commit of a cut may hold fewer.

- **Silent:** as soon as 9 wait, they become a commit.
- **Speaking** (the VAD is in speech): only when 18 wait are the oldest 9 written, so the sentence still ends with the newest 9.
- **Sentence end:** the newest 9 at most ride with the sentence; older ones are cut into commits. Those commits are composed and written before the sentence message is sent (the send waits at most the operation timeout), so the DM is in time order.
- **Dropped sentence** (filler, nothing heard, failed send): commits already written stay; only the sentence's own keyframes go back to pending, ahead of what arrived since, and wait for the next sentence until a new keyframe arrives.
- **No new keyframe:** the sentence points `sameAs` the last picture of this share, a sentence or a commit; before any picture it carries none. No single image is sent twice.
- **Dated by picture:** a frame record's message time is the end of its picture range (`startedAt + toMs`, never later than now), so a `channel_read` call window finds a record written late, such as one cut while the Human spoke, by what it shows.
- **Share off or switched:** what waits is written as commits of the old source rather than thrown away.
- **Safety net:** at most 32 keyframes wait. Commits are written one at a time, so a stuck write lets pending grow; past 32 the oldest are dropped and a `frames-dropped` event (`source`, `dropped`, `total`) reports them. Nothing is picked by score any more, and `pickGridFrames` is gone.

**Two ranges on a sentence.** Times count in ms from call connect, the same anchor as commits. `voiceCall.visual.fromMs/toMs` is the picture range of the sentence's keyframes (the same meaning as a commit's), and `voiceCall.speechFromMs/speechToMs` is when the Human spoke, taken from the VAD utterance and mapped to wall time. Validators require the picture range on a grid visual and accept the speech range only as a pair.

**No record list.** `voiceCall.visual.records` and `MAX_CALL_VISUAL_RECORDS` are deleted with no compatibility path; validators refuse `records`. Migration 135 strips `records` from stored call messages and drops grid metadata that has no picture range (development databases only), keeping the message and its image.

**Prompt.** The call header reads `[Voice call <id>: this message 1:06–1:20, picture 0:58–1:20]`. The visual hint explains the timeline, that earlier keyframes are frame records read with `channel_read` `call` + `from_ms/to_ms`, and that a `sameAs` message is opened with `channel_read_image`. Frame-record bodies and the client notices no longer say the Human was silent.

**CLI.** `call-simulate --video/--screen` adds `visual.harvest` (`commits`, `commitFrames`, `sentenceFrames`, `unchanged`, `dropped`); `grid-built` reports `commits` and the picture range instead of `dropped`.

## Consequences

A busy camera writes more frame records into the DM, one per 9 keyframes, and every keyframe stays reachable by time. The tile cache still keeps the newest 64 originals, so `call_frame` on an old record may report `released`. Restored keyframes of a dropped sentence can land in a commit written after a newer commit when 9 or more keyframes arrive while the sentence was being recognised; the records still carry their own ranges.
