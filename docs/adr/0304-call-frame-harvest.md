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
- **Share off, switched or hung up:** what waits is written as commits of the old source rather than thrown away, and commits already queued still land after the call ends.
- **Safety net:** at most 32 keyframes wait. Commits are written one at a time, so a stuck write lets pending grow; past 32 the oldest are dropped and a `frames-dropped` event (`source`, `dropped`, `total`) reports them. Nothing is picked by score any more, and `pickGridFrames` is gone.

**Two ranges on a sentence.** Times count in ms from call connect, the same anchor as commits. `voiceCall.visual.fromMs/toMs` is the picture range of the sentence's keyframes (the same meaning as a commit's), and `voiceCall.speechFromMs/speechToMs` is when the Human spoke, taken from the VAD utterance and mapped to wall time. Validators require the picture range on a grid visual and accept the speech range only as a pair.

**No record list.** `voiceCall.visual.records` and `MAX_CALL_VISUAL_RECORDS` are deleted with no compatibility path; validators refuse `records`. Migration 135 strips `records` from stored call messages and drops grid metadata that has no picture range (development databases only), keeping the message and its image.

**Prompt.** The call header reads `[Voice call <id>: this message 1:06–1:20, picture 0:58–1:20]`. The visual hint explains the timeline, that earlier keyframes are frame records read with `channel_read` `call` + `from_ms/to_ms`, and that a `sameAs` message is opened with `channel_read_image`. Frame-record bodies and the client notices no longer say the Human was silent.

**CLI.** `call-simulate --video/--screen` adds `visual.harvest` (`commits`, `commitFrames`, `sentenceFrames`, `unchanged`, `dropped`); `grid-built` reports `commits` and the picture range instead of `dropped`.

## Consequences

A busy camera writes more frame records into the DM, one per 9 keyframes, and every keyframe stays reachable by time. The tile cache still keeps the newest 64 originals, so `call_frame` on an old record may report `released`. Restored keyframes of a dropped sentence can land in a commit written after a newer commit when 9 or more keyframes arrive while the sentence was being recognised; the records still carry their own ranges.

## Update (2026-11-08, #3694): text typed during a call

A Human DM message typed while a call with that Bot runs in that DM goes through the same harvest as a sentence end. The Channel does not know call state: the Human send path (`channelSend`) asks the call owner through `createCallTextHarvest` (`packages/core/src/voice/call-text.ts`) and gets nothing back outside a call, in another DM, before the call connects, or after it ends.

- **Same cut.** The newest 9 waiting keyframes ride with the text as a grid attached after the Human's own attachments (none when they already attached 10, and the keyframes keep waiting); older ones become frame records written before the text lands; with no new keyframe the text points `sameAs` the last picture of the share, and before any picture it carries none.
- **Fields.** The message carries `voiceCall: {callId, atMs, visual?}`: `atMs` is when it arrived, in ms from call connect, and it has no speech range. Validators accept `atMs` only without `speechFromMs/speechToMs`. The turn header reads `[Voice call <id>: typed at 1:24, picture 1:20–1:23]`, the voice-call hints say a typed message is not a transcript, and its tiles open with `call_frame` like a sentence's.
- **Order.** The text joins the call's sentence queue at arrival: a sentence whose speech ended earlier and is still being recognised lands first, and the next sentence waits until the text has landed (at most the operation timeout). Turns and `busy` follow ADR-0281 in that order; a text starts the Bot's own turn like a sentence, so it does not show `busy`.
- **Failed send.** Commits stay and the riding keyframes go back to pending; if the call ended meanwhile they are written as a frame record instead. A retried send with the same message id compares only the Human's own attachments.
- **CLI.** A `call-simulate --script` step `{"at": ms, "text": "…"}` types through the real `channelSend` path; the report adds `texts` (`frames`, `commitsBefore`, `fromMs/toMs`, `layout`, `sameAs`) and `visual.harvest.textFrames`, and events add `text`.
